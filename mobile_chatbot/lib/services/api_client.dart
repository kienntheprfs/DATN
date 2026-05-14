import 'dart:convert';
import 'dart:ui';
import 'package:http/http.dart' as http;
import '../models/chat_models.dart';
import '../utils/constants.dart';

class ApiClient {
  Uri _uri(String path) => Uri.parse('${AppConstants.apiBase}$path');

  Future<List<String>> fetchAgents() async {
    final response = await http.get(_uri('/agent/info'));
    if (response.statusCode ~/ 100 != 2) throw Exception(response.statusCode);
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final raw = body['agents'] as List<dynamic>? ?? [];
    return raw
        .map((e) => (e as Map<String, dynamic>)['key']?.toString() ?? 'chatbot')
        .toList();
  }

  Future<String> login({
    required String email,
    required String password,
  }) async {
    final response = await http.post(
      _uri('/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );
    if (response.statusCode ~/ 100 != 2) throw Exception(response.statusCode);
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return (body['access_token'] ?? '').toString();
  }

  Future<void> register({
    required String email,
    required String password,
    required String fullname,
  }) async {
    final response = await http.post(
      _uri('/auth/register'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'email': email,
        'password': password,
        'fullname': fullname,
      }),
    );
    if (response.statusCode ~/ 100 != 2) throw Exception(response.statusCode);
  }

  Future<String> fetchMyUserId({required String token}) async {
    final response = await http.get(
      _uri('/auth/me'),
      headers: {'Authorization': 'Bearer $token'},
    );
    if (response.statusCode ~/ 100 != 2) throw Exception(response.statusCode);
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return (body['id'] ?? 'guest').toString();
  }

  Future<void> submitRating({
    required String token,
    required String runId,
    required String threadId,
    required String agentId,
    required Rating rating,
  }) async {
    final response = await http.post(
      _uri('/dashboard/ratings'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      },
      body: jsonEncode({
        'run_id': runId,
        'thread_id': threadId,
        'agent_id': agentId,
        'rating': rating == Rating.like ? 'LIKE' : 'DISLIKE',
      }),
    );
    if (response.statusCode ~/ 100 != 2) throw Exception(response.statusCode);
  }

  Future<List<ThreadItem>> fetchThreads({required String token}) async {
    final response = await http.get(
      _uri('/agent/threads'),
      headers: {'Authorization': 'Bearer $token'},
    );
    if (response.statusCode ~/ 100 != 2) throw Exception(response.statusCode);
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final raw = body['items'] as List<dynamic>? ?? [];
    return raw.map((e) {
      final map = e as Map<String, dynamic>;
      return ThreadItem(
        id: map['id']?.toString() ?? '',
        userId: map['user_id']?.toString() ?? '',
        title: map['title']?.toString(),
        createdAt: map['created_at'] != null
            ? DateTime.tryParse(map['created_at'].toString())
            : null,
      );
    }).toList();
  }

  Future<List<ChatMessage>> fetchHistory({
    required String token,
    required String threadId,
  }) async {
    final response = await http.post(
      _uri('/agent/history'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      },
      body: jsonEncode({'thread_id': threadId}),
    );
    if (response.statusCode ~/ 100 != 2) throw Exception(response.statusCode);
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final raw = body['messages'] as List<dynamic>? ?? [];
    
    final List<ChatMessage> chatMessages = [];
    
    for (var e in raw) {
      final map = e as Map<String, dynamic>;
      final type = map['type']?.toString();
      final content = map['content']?.toString() ?? '';
      
      if (type == 'human') {
        chatMessages.add(ChatMessage(Role.user, content));
      } else if (type == 'ai') {
        // Parse landmarks from additional_kwargs if present
        List<Landmark>? landmarks;
        final kwargs = map['additional_kwargs'] as Map<String, dynamic>?;
        if (kwargs != null && kwargs['landmarks'] != null) {
          landmarks = _parseLandmarksList(kwargs['landmarks'] as List<dynamic>);
        }
        chatMessages.add(ChatMessage(Role.bot, content, landmarks: landmarks));
      } else if (type == 'tool') {
        // Try to parse tool result if it's a route or landmarks
        try {
          final parsed = jsonDecode(content);
          if (parsed is Map && parsed['type'] == 'route') {
            if (parsed['status']?.toString() == 'needs_confirmation') {
              final startName = parsed['start_name']?.toString() ?? '';
              final endName = parsed['end_name']?.toString() ?? '';
              final startOptions = (parsed['start_options'] as List<dynamic>?)
                  ?.map((e) => e.toString())
                  .toList();
              final endOptions = (parsed['end_options'] as List<dynamic>?)
                  ?.map((e) => e.toString())
                  .toList();
              chatMessages.add(ChatMessage(
                Role.bot,
                'Vui lòng xác nhận địa điểm.',
                confirmationJson: jsonEncode({
                  'start_name': startName,
                  'end_name': endName,
                  'start_options': startOptions ?? [],
                  'end_options': endOptions ?? [],
                }),
              ));
            } else {
              final route = _parseRouteInfo(Map<String, dynamic>.from(parsed));
              if (route != null) {
                chatMessages.add(ChatMessage(
                  Role.bot, 
                  'Đã tìm thấy lộ trình. Nhấn xem chỉ đường để mở bản đồ.', 
                  route: route
                ));
              }
            }
          } else {
            // Check if it's a list of landmarks or a map containing landmarks
            final landmarks = _parseLandmarksList(parsed);
            if (landmarks != null && landmarks.isNotEmpty) {
              chatMessages.add(ChatMessage(
                Role.bot,
                'Tôi tìm thấy một số địa điểm giống mô tả của bạn. Bạn xem có phải mình đang ở một trong những nơi này không?',
                landmarks: landmarks,
              ));
            }
          }
        } catch (_) {
          // Ignore failed JSON parses for tools
        }
      }
    }
    
    return chatMessages;
  }

  List<Landmark>? _parseLandmarksList(dynamic raw) {
    try {
      List<dynamic>? list;
      if (raw is List) {
        list = raw;
      } else if (raw is Map && raw['landmarks'] is List) {
        list = raw['landmarks'];
      }
      
      if (list == null || list.isEmpty) return null;
      
      return list.map((l) {
        final m = l as Map<String, dynamic>;
        return Landmark(
          id: int.tryParse(m['id']?.toString() ?? '0') ?? 0,
          name: m['name']?.toString() ?? '',
          description: m['description']?.toString() ?? '',
          imageUrl: m['real_image_url']?.toString() ?? '',
          type: m['type']?.toString() ?? 'building',
        );
      }).toList();
    } catch (_) {
      return null;
    }
  }

  RouteInfo? _parseRouteInfo(Map<String, dynamic> parsed) {
    try {
      final path = (parsed['path_coords'] as List<dynamic>? ?? [])
          .map((e) => e as List<dynamic>)
          .where((e) => e.length >= 2)
          .map((e) => Offset((e[0] as num).toDouble(), (e[1] as num).toDouble()))
          .toList();
          
      if (path.isEmpty) return null;

      final rawInstructions = parsed['instructions'] as List<dynamic>? ?? [];
      final steps = rawInstructions
          .map((e) => (e as Map<String, dynamic>)['instruction']?.toString() ?? e.toString())
          .toList();
      final instructions = rawInstructions
          .map((e) => InstructionStep.fromJson(e as Map<String, dynamic>))
          .toList();

      final mapRaw = parsed['map'] as Map<String, dynamic>?;
      if (mapRaw == null) return null;

      final mapData = MapData(
        id: int.tryParse(mapRaw['id']?.toString() ?? '0') ?? 0,
        name: mapRaw['name']?.toString() ?? '',
        imageUrl: mapRaw['image_url']?.toString() ?? '',
        floorLevel: mapRaw['floor_level'] as int?,
      );

      final routeMaps = (parsed['route_maps'] as List<dynamic>?)
          ?.map((e) {
            final m = e as Map<String, dynamic>;
            final rm = m['map'] as Map<String, dynamic>?;
            final nodes = (m['nodes'] as List<dynamic>?)
                ?.map((n) => MapNode.fromJson(n as Map<String, dynamic>))
                .toList() ?? [];
            return RouteMapInfo(
              map: MapData(
                id: int.tryParse(rm?['id']?.toString() ?? '0') ?? 0,
                name: rm?['name']?.toString() ?? '',
                imageUrl: rm?['image_url']?.toString() ?? '',
                floorLevel: rm?['floor_level'] as int?,
              ),
              nodes: nodes,
            );
          })
          .toList();

      return RouteInfo(
        title: '${parsed['start_name'] ?? 'Bắt đầu'} -> ${parsed['end_name'] ?? 'Kết thúc'}',
        summary: '${((parsed['total_distance_m'] as num?)?.round() ?? 0)}m',
        path: path,
        steps: steps,
        instructions: instructions,
        startName: parsed['start_name']?.toString(),
        endName: parsed['end_name']?.toString(),
        totalDistanceM: (parsed['total_distance_m'] as num?)?.toDouble() ?? 0,
        status: parsed['status']?.toString(),
        startOptions: (parsed['start_options'] as List<dynamic>?)
            ?.map((e) => e.toString())
            .toList(),
        endOptions: (parsed['end_options'] as List<dynamic>?)
            ?.map((e) => e.toString())
            .toList(),
        routeMaps: routeMaps,
        map: mapData,
      );
    } catch (_) {
      return null;
    }
  }
}
