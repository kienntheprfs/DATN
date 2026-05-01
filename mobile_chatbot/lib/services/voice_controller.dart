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

  final ApiClient api;
  final void Function(String) onError;
  final List<ChatMessage> messages = [];
  final Set<String> seen = {};
  VoiceStatus status = VoiceStatus.idle;
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

  String currentTranscript = '';
  Role? currentSpeaker;
  DateTime? _lastSpeakingEvent;
  Timer? _speakingTimeout;
  Timer? _noResponseTimeout;
  static const _noResponseDuration = Duration(seconds: 30);

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
          }
          currentTranscript = data!['text'].toString();
          
          _lastSpeakingEvent = DateTime.now();
          if (!isSpeaking) {
            isSpeaking = true;
            notifyListeners();
          }
          _startSpeakingTimeout(); // Proactive stop

          if (data['final'] == true) {
            _append(Role.user, currentTranscript);
            _startNoResponseTimer();
          }
          notifyListeners();
        }

        if (type == 'bot-output' || type == 'bot-partial-output') {
          if (currentSpeaker != Role.bot) {
            currentSpeaker = Role.bot;
            currentTranscript = '';
          }

          String? output;
          if (data?['spoken'] is String) {
            output = data!['spoken'] as String;
          } else if (data?['text'] is String) {
            output = data!['text'] as String;
          }
          
          if (output != null && output.trim().isNotEmpty) {
            currentTranscript = output.trim();
            _cancelNoResponseTimer();
            
            if (type == 'bot-output') {
              _append(Role.bot, currentTranscript, runId: runId);
            }
            
            if (!isSpeaking) {
              isSpeaking = true;
              notifyListeners();
            }
            _startSpeakingTimeout(ms: 10000);
            notifyListeners();
          }
        }
        
        if (type == 'tool-result') _parseRoute(data?['content']?.toString());
      }

      if (type == 'bot-started-speaking') {
          debugPrint('[Voice] Bot started talking');
          currentSpeaker = Role.bot;
          if (!isSpeaking) {
            isSpeaking = true;
            notifyListeners();
          }
          _startSpeakingTimeout(ms: 10000);
        } else if (type == 'user-started-speaking') {
          debugPrint('[Voice] User started talking');
          currentSpeaker = Role.user;
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
    final parsedText = _parseMarkdown(text);
    final key = '${role.name}:$parsedText';
    if (!seen.add(key)) {
      if (messages.isNotEmpty && messages.last.role == role) {
        final lastMsg = messages.removeLast();
        seen.remove('${lastMsg.role.name}:${lastMsg.text}');
        final remaining = 500 - parsedText.length;
        final trimmedOld = lastMsg.text.length > remaining
            ? lastMsg.text.substring(lastMsg.text.length - remaining)
            : lastMsg.text;
        final combined = '$trimmedOld $parsedText';
        final newKey = '${role.name}:$combined';
        if (seen.add(newKey)) {
          messages.add(ChatMessage(role, combined, runId: runId));
        }
      }
      return;
    }
    messages.add(ChatMessage(role, parsedText, runId: runId));
    notifyListeners();
  }

  void _parseRoute(String? content) {
    if (content == null) return;
    try {
      final parsed = jsonDecode(content) as Map<String, dynamic>;
      if (parsed['type']?.toString() != 'route') return;
      final path = (parsed['path_coords'] as List<dynamic>? ?? [])
          .map((e) => e as List<dynamic>)
          .where((e) => e.length >= 2)
          .map(
            (e) => LatLng((e[0] as num).toDouble(), (e[1] as num).toDouble()),
          )
          .toList();
      if (path.isEmpty) return;
      _cancelNoResponseTimer();
      final steps = (parsed['instructions'] as List<dynamic>? ?? [])
          .map(
            (e) =>
                (e as Map<String, dynamic>)['instruction']?.toString() ??
                e.toString(),
          )
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
                '~${((parsed['total_distance_m'] as num?)?.round() ?? 0)}m',
            path: path,
            steps: steps,
          ),
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
    canSendIce = false;
    pendingIce.clear();
    isSpeaking = false;
    isMuted = false;
    currentTranscript = '';
    currentSpeaker = null;
    status = VoiceStatus.disconnected;
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
}


