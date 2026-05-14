import 'dart:ui';
import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';
import '../models/chat_models.dart';
import '../utils/constants.dart';
import 'api_client.dart';

String _parseMarkdown(String text) {
  return text
      .replaceAll(RegExp(r'\*\*(.+?)\*\*'), r'$1')
      .replaceAll(RegExp(r'\*(.+?)\*'), r'$1')
      .replaceAll(RegExp(r'__(.+?)__'), r'$1')
      .replaceAll(RegExp(r'_(.+?)_'), r'$1')
      .replaceAll(RegExp(r'~~(.+?)~~'), r'$1')
      .replaceAll(RegExp(r'`(.+?)`'), r'$1')
      .replaceAll(RegExp(r'\[(.+?)\]\(.+?\)'), r'$1')
      .replaceAll(RegExp(r'#+\s*'), '')
      .replaceAll(RegExp(r'^\s*[-*]\s+', multiLine: true), '')
      .replaceAll(RegExp(r'\n{3,}'), '\n\n')
      .trim();
}

class VoiceController extends ChangeNotifier {
  VoiceController({required this.api, required this.onError});

  static final _random = Random();

  final ApiClient api;
  final void Function(String) onError;
  final List<ChatMessage> messages = [];
  final Set<String> seen = {};
  VoiceStatus status = VoiceStatus.idle;
  final String _guestUserId = 'guest-${_uuid().substring(0, 8)}';

  String get guestUserId => _guestUserId;
  bool isSpeaking = false;
  bool isMuted = false;
  String? threadId;
  String? runId;
  String? pcId;
  bool canSendIce = false;
  final List<RTCIceCandidate> pendingIce = [];

  RTCPeerConnection? peer;
  RTCDataChannel? dataChannel;
  MediaStreamTrack? audioTrack;

  MediaStream? _localStream;

  Future<void> connect({
    required String agentId,
    required String userId,
    String? token,
  }) async {
    if (status == VoiceStatus.connecting || status == VoiceStatus.connected) {
      return;
    }
    status = VoiceStatus.connecting;
    notifyListeners();
    try {
      _localStream = await navigator.mediaDevices.getUserMedia({'audio': true});
      final tracks = _localStream!.getAudioTracks();
      if (tracks.isEmpty) throw Exception('Không có audio track');
      audioTrack = tracks.first;
      
      peer = await createPeerConnection({
        'iceServers': [
          {'urls': 'stun:stun.l.google.com:19302'},
        ],
      });
      
      await peer!.addTrack(audioTrack!, _localStream!);
      
      dataChannel = await peer!.createDataChannel(
        'pipecat',
        RTCDataChannelInit(),
      );
      dataChannel!.onMessage = (m) => _onData(m.text);
      
      peer!.onIceConnectionState = (s) {
        if (s == RTCIceConnectionState.RTCIceConnectionStateFailed ||
            s == RTCIceConnectionState.RTCIceConnectionStateDisconnected) {
          disconnect();
        }
      };
      
      peer!.onIceCandidate = (c) async {
        if (c.candidate == null) return;
        if (canSendIce && pcId != null) {
          await _sendIce(c, token);
        } else {
          pendingIce.add(c);
        }
      };

      final offer = await peer!.createOffer();
      await peer!.setLocalDescription(offer);
      final local = await peer!.getLocalDescription();
      threadId ??= 'thread-${DateTime.now().millisecondsSinceEpoch}-${Random().nextInt(99999)}';

      final response = await http.post(
        Uri.parse('${AppConstants.apiBase}/voice/offer'),
        headers: {
          'Content-Type': 'application/json',
          if (token != null) 'Authorization': 'Bearer $token',
        },
        body: jsonEncode({
          'sdp': local?.sdp,
          'type': local?.type,
          'request_data': {
            'agent_id': agentId,
            'user_id': userId,
            'thread_id': threadId,
          },
        }),
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode ~/ 100 != 2) {
        throw Exception('Server returned ${response.statusCode}: ${response.body}');
      }

      final answer = jsonDecode(response.body) as Map<String, dynamic>;
      pcId = answer['pc_id']?.toString();

      await peer!.setRemoteDescription(
        RTCSessionDescription(
          answer['sdp']?.toString(),
          answer['type']?.toString(),
        ),
      );

      canSendIce = true;
      for (final candidate in pendingIce) {
        await _sendIce(candidate, token);
      }
      pendingIce.clear();
      status = VoiceStatus.connected;
      notifyListeners();
    } catch (e) {
      debugPrint('Voice connection error: $e');
      status = VoiceStatus.error;
      onError('Lỗi kết nối voice: $e');
      await disconnect();
    }
  }

  Future<void> _sendIce(RTCIceCandidate candidate, String? token) async {
    if (pcId == null) return;
    await http.patch(
      Uri.parse('${AppConstants.apiBase}/voice/offer'),
      headers: {
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      },
      body: jsonEncode({
        'pc_id': pcId,
        'candidates': [
          {
            'candidate': candidate.candidate,
            'sdp_mid': candidate.sdpMid,
            'sdp_mline_index': candidate.sdpMLineIndex,
          },
        ],
      }),
    );
  }

  List<String> transcriptHistory = [];
  String currentTranscript = '';
  Role? currentSpeaker;
  DateTime? _lastSpeakingEvent;
  Timer? _speakingTimeout;
  Timer? _noResponseTimeout;
  static const _noResponseDuration = Duration(seconds: 30);
  
  DateTime? _lastMessageTime;
  static const _messageDebounce = Duration(milliseconds: 500);

  bool get isBotSpeaking => isSpeaking && currentSpeaker == Role.bot;

  void _startSpeakingTimeout({int ms = 1000}) {
    _speakingTimeout?.cancel();
    _speakingTimeout = Timer(Duration(milliseconds: ms), () {
      if (isSpeaking) {
        isSpeaking = false;
        notifyListeners();
      }
    });
  }

  void _startNoResponseTimer() {
    _noResponseTimeout?.cancel();
    _noResponseTimeout = Timer(_noResponseDuration, () {
      onError('Không nhận được phản hồi từ bot. Vui lòng thử lại.');
      disconnect();
    });
  }

  void _cancelNoResponseTimer() {
    _noResponseTimeout?.cancel();
    _noResponseTimeout = null;
  }

  void _onData(String text) {
    try {
      final message = jsonDecode(text) as Map<String, dynamic>;
      final type = message['type']?.toString() ?? '';
      final data = message['data'] as Map<String, dynamic>?;

      debugPrint('[Voice] Event: $type, Label: ${message['label']}');

      if (message['label'] == 'rtvi-ai') {
        if (type == 'run-id') runId = data?['run_id']?.toString();
        
        if (type == 'user-transcription' && data?['text'] != null) {
          if (currentSpeaker != Role.user) {
            currentSpeaker = Role.user;
            currentTranscript = '';
            transcriptHistory.clear(); // Clear history when switching to user
          }
          currentTranscript = data!['text'].toString();
          
          _lastSpeakingEvent = DateTime.now();
          if (!isSpeaking) {
            isSpeaking = true;
            notifyListeners();
          }
          _startSpeakingTimeout(); // Proactive stop

          if (data['final'] == true) {
            final text = currentTranscript.trim();
            if (text.isNotEmpty) {
              final now = DateTime.now();
              if (_lastMessageTime == null || now.difference(_lastMessageTime!) > _messageDebounce) {
                _lastMessageTime = now;
                
                if (transcriptHistory.isEmpty || transcriptHistory.last != text) {
                  transcriptHistory.add(text);
                }
                _append(Role.user, text);
                _startNoResponseTimer();
              }
            }
            currentTranscript = '';
          }
          notifyListeners();
        }

        if (type == 'bot-output' || type == 'bot-partial-output') {
          if (currentSpeaker != Role.bot) {
            currentSpeaker = Role.bot;
            currentTranscript = '';
            transcriptHistory.clear();
          }

          // Check for custom_data (landmarks, route) in the message
          final customData = data?['custom_data'] as Map<String, dynamic>?;
          if (customData != null) {
            if (customData.containsKey('landmarks')) {
              _parseLandmarks(jsonEncode(customData['landmarks']));
            }
            if (customData.containsKey('route') || customData['type'] == 'route') {
              _parseRoute(jsonEncode(customData));
            }
          }

          String? output;
          if (data?['spoken'] is String) {
            output = data!['spoken'] as String;
          } else if (data?['text'] is String) {
            output = data!['text'] as String;
          }
          
          if (output != null && output.trim().isNotEmpty) {
            final text = output.trim();
            currentTranscript = text;
            _cancelNoResponseTimer();
            
            if (type == 'bot-output') {
              if (transcriptHistory.isEmpty || transcriptHistory.last != text) {
                transcriptHistory.add(text);
              }
              _append(Role.bot, text, runId: runId);
              currentTranscript = '';
            }
            
            if (!isSpeaking) {
              isSpeaking = true;
              notifyListeners();
            }
            _startSpeakingTimeout(ms: 10000);
            notifyListeners();
          }
        }
        
        if (type == 'tool-result') {
          final content = data?['content']?.toString();
          _parseRoute(content);
          _parseLandmarks(content);
        }
      }

      if (type == 'bot-started-speaking') {
          debugPrint('[Voice] Bot started talking');
          if (currentSpeaker != Role.bot) {
            currentSpeaker = Role.bot;
            transcriptHistory.clear();
            currentTranscript = '';
          }
          if (!isSpeaking) {
            isSpeaking = true;
            notifyListeners();
          }
          _startSpeakingTimeout(ms: 10000);
        } else if (type == 'user-started-speaking') {
          debugPrint('[Voice] User started talking');
          if (currentSpeaker != Role.user) {
            currentSpeaker = Role.user;
            transcriptHistory.clear();
            currentTranscript = '';
          }
          if (!isSpeaking) {
            isSpeaking = true;
            notifyListeners();
          }
          _startSpeakingTimeout(ms: 5000);
        } else if (type == 'bot-stopped-speaking' || type == 'user-stopped-speaking') {
          debugPrint('[Voice] Handling STOP event: $type');
          _speakingTimeout?.cancel();
          if (isSpeaking) {
            isSpeaking = false;
            notifyListeners();
          }
        }

      
      if (type == 'error') {
        onError(message['message']?.toString() ?? 'Voice lỗi');
      }
    } catch (_) {}
  }

  void _append(Role role, String text, {String? runId}) {
    final parsedText = _parseMarkdown(text).trim();
    if (parsedText.isEmpty) return;
    
    final key = '${role.name}:$parsedText';
    
    // Strict deduplication: if we've seen this EXACT text from this role recently, skip.
    if (seen.contains(key)) return;
    seen.add(key);

    // Merge consecutive messages from the same role if they are different content
    if (messages.isNotEmpty && messages.last.role == role) {
      final lastMsg = messages.last;
      if (lastMsg.text != parsedText) {
        messages[messages.length - 1] = ChatMessage(
          role, 
          '${lastMsg.text}\n$parsedText', 
          runId: runId ?? lastMsg.runId
        );
      }
    } else {
      messages.add(ChatMessage(role, parsedText, runId: runId));
    }
    notifyListeners();
  }

  void _parseRoute(String? content) {
    if (content == null) return;
    try {
      final parsed = jsonDecode(content) as Map<String, dynamic>;
      if (parsed['type']?.toString() != 'route') return;

      final status = parsed['status']?.toString();

      // Handle needs_confirmation
      if (status == 'needs_confirmation') {
        _cancelNoResponseTimer();
        final startName = parsed['start_name']?.toString() ?? '';
        final endName = parsed['end_name']?.toString() ?? '';
        final startOptions = (parsed['start_options'] as List<dynamic>?)
            ?.map((e) => e.toString())
            .toList();
        final endOptions = (parsed['end_options'] as List<dynamic>?)
            ?.map((e) => e.toString())
            .toList();

        messages.add(
          ChatMessage(
            Role.bot,
            'Vui lòng xác nhận địa điểm để tôi tìm đường cho bạn.',
            runId: runId,
            confirmationJson: jsonEncode({
              'start_name': startName,
              'end_name': endName,
              'start_options': startOptions ?? [],
              'end_options': endOptions ?? [],
            }),
          ),
        );
        notifyListeners();
        return;
      }

      final path = (parsed['path_coords'] as List<dynamic>? ?? [])
          .map((e) => e as List<dynamic>)
          .where((e) => e.length >= 2)
          .map(
            (e) => Offset((e[0] as num).toDouble(), (e[1] as num).toDouble()),
          )
          .toList();
      if (path.isEmpty) return;
      _cancelNoResponseTimer();

      final rawInstructions = parsed['instructions'] as List<dynamic>? ?? [];
      final steps = rawInstructions
          .map(
            (e) =>
                (e as Map<String, dynamic>)['instruction']?.toString() ??
                e.toString(),
          )
          .toList();
      final instructions = rawInstructions
          .map((e) => InstructionStep.fromJson(e as Map<String, dynamic>))
          .toList();

      // Parse multi-floor data
      final routeMaps = (parsed['route_maps'] as List<dynamic>?)
          ?.map((e) {
            final m = e as Map<String, dynamic>;
            final mapData = MapData(
              id: int.tryParse(m['map']?['id']?.toString() ?? '0') ?? 0,
              name: m['map']?['name']?.toString() ?? '',
              imageUrl: m['map']?['image_url']?.toString() ?? '',
              floorLevel: m['map']?['floor_level'] as int?,
            );
            final nodes = (m['nodes'] as List<dynamic>?)
                ?.map((n) => MapNode.fromJson(n as Map<String, dynamic>))
                .toList() ?? [];
            return RouteMapInfo(map: mapData, nodes: nodes);
          })
          .toList();

      messages.add(
        ChatMessage(
          Role.bot,
          'Đã tìm thấy lộ trình. Nhấn xem chỉ đường để mở bản đồ.',
          runId: runId,
          route: RouteInfo(
            title:
                '${parsed['start_name'] ?? 'Start'} -> ${parsed['end_name'] ?? 'End'}',
            summary:
                '${((parsed['total_distance_m'] as num?)?.round() ?? 0)}m',
            path: path,
            steps: steps,
            instructions: instructions,
            startName: parsed['start_name']?.toString(),
            endName: parsed['end_name']?.toString(),
            totalDistanceM: (parsed['total_distance_m'] as num?)?.toDouble() ?? 0,
            status: status,
            startOptions: (parsed['start_options'] as List<dynamic>?)
                ?.map((e) => e.toString())
                .toList(),
            endOptions: (parsed['end_options'] as List<dynamic>?)
                ?.map((e) => e.toString())
                .toList(),
            routeMaps: routeMaps,
            map: MapData(
              id: int.tryParse(parsed['map']?['id']?.toString() ?? '0') ?? 0,
              name: parsed['map']?['name']?.toString() ?? '',
              imageUrl: parsed['map']?['image_url']?.toString() ?? '',
              floorLevel: parsed['map']?['floor_level'] as int?,
            ),
          ),
        ),
      );
      notifyListeners();
    } catch (_) {}
  }

  void _parseLandmarks(String? content) {
    if (content == null) return;
    try {
      final parsed = jsonDecode(content);
      List<dynamic>? rawLandmarks;
      if (parsed is List) {
        rawLandmarks = parsed;
      } else if (parsed is Map && parsed['landmarks'] is List) {
        rawLandmarks = parsed['landmarks'];
      }

      if (rawLandmarks == null || rawLandmarks.isEmpty) return;

      final landmarks = rawLandmarks.map((e) {
        final m = e as Map<String, dynamic>;
        return Landmark(
          id: int.tryParse(m['id']?.toString() ?? '0') ?? 0,
          name: m['name']?.toString() ?? '',
          description: m['description']?.toString() ?? '',
          imageUrl: m['real_image_url']?.toString() ?? '',
          type: m['type']?.toString() ?? 'building',
        );
      }).toList();

      if (landmarks.isEmpty) return;

      messages.add(
        ChatMessage(
          Role.bot,
          'Tôi tìm thấy một số địa điểm giống mô tả của bạn. Bạn xem có phải mình đang ở một trong những nơi này không?',
          runId: runId,
          landmarks: landmarks,
        ),
      );
      notifyListeners();
    } catch (_) {}
  }

  Future<void> disconnect() async {
    _cancelNoResponseTimer();
    try {
      await dataChannel?.close();
      await peer?.close();
      await audioTrack?.stop();
      await _localStream?.dispose();
      
      dataChannel = null;
      peer = null;
      audioTrack = null;
      _localStream = null;
    } catch (_) {}
    
    pcId = null;
    threadId = null;
    canSendIce = false;
    pendingIce.clear();
    isSpeaking = false;
    isMuted = false;
    currentTranscript = '';
    transcriptHistory.clear();
    currentSpeaker = null;
    status = VoiceStatus.disconnected;
    seen.clear();
    messages.clear(); // Added to wipe conversation history as requested
    notifyListeners();
  }

  @override
  void dispose() {
    disconnect();
    super.dispose();
  }

  void toggleMute() {
    if (audioTrack == null) return;
    isMuted = !isMuted;
    audioTrack!.enabled = !isMuted;
    notifyListeners();
  }

  static String _uuid() {
    // Simple UUID v4
    final r = _random;
    final bytes = List<int>.generate(16, (_) => r.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return [
      bytes.sublist(0, 4).map((b) => b.toRadixString(16).padLeft(2, '0')).join(),
      bytes.sublist(4, 6).map((b) => b.toRadixString(16).padLeft(2, '0')).join(),
      bytes.sublist(6, 8).map((b) => b.toRadixString(16).padLeft(2, '0')).join(),
      bytes.sublist(8, 10).map((b) => b.toRadixString(16).padLeft(2, '0')).join(),
      bytes.sublist(10, 16).map((b) => b.toRadixString(16).padLeft(2, '0')).join(),
    ].join('-');
  }

  void sendTextMessage(String text) {
    if (status != VoiceStatus.connected || dataChannel == null) return;
    
    final msg = jsonEncode({
      'id': _uuid(),
      'label': 'rtvi-ai',
      'type': 'chat-text',
      'data': {'text': text},
    });
    
    dataChannel!.send(RTCDataChannelMessage(msg));
    _append(Role.user, text);
    _startNoResponseTimer();
    notifyListeners();
  }

  void updateAgent(String newAgentId) {
    if (status != VoiceStatus.connected || dataChannel == null) {
      debugPrint('[Voice] Cannot update agent: not connected');
      return;
    }
    debugPrint('[Voice] Updating agent to: $newAgentId');
    final msg = jsonEncode({
      'id': _uuid(),
      'label': 'rtvi-ai',
      'type': 'update-agent',
      'data': {
        'agent_id': newAgentId,
        'thread_id': threadId,
      },
    });
    dataChannel!.send(RTCDataChannelMessage(msg));
    notifyListeners();
  }
}


