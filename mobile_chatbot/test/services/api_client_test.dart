import 'dart:convert';
import 'dart:ui';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_chatbot/models/chat_models.dart';

// Test hàm parse JSON độc lập, không cần gọi network
// Các hàm parse logic được trích xuất từ ApiClient để test

/// Parse agents response (trích từ ApiClient.fetchAgents)
List<String> parseAgents(Map<String, dynamic> body) {
  final raw = body['agents'] as List<dynamic>? ?? [];
  return raw
      .map((e) => (e as Map<String, dynamic>)['key']?.toString() ?? 'chatbot')
      .toList();
}

/// Parse login response (trích từ ApiClient.login)
String parseLoginToken(Map<String, dynamic> body) {
  return (body['access_token'] ?? '').toString();
}

/// Parse fetchMyUserId response
String parseUserId(Map<String, dynamic> body) {
  return (body['id'] ?? 'guest').toString();
}

/// Parse threads response
List<ThreadItem> parseThreads(Map<String, dynamic> body) {
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

/// Parse landmarks list (trích từ ApiClient._parseLandmarksList)
List<Landmark>? parseLandmarks(dynamic raw) {
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
      );
    }).toList();
  } catch (_) {
    return null;
  }
}

/// Parse route info (trích từ ApiClient._parseRouteInfo)
RouteInfo? parseRouteInfo(Map<String, dynamic> parsed) {
  try {
    final path = (parsed['path_coords'] as List<dynamic>? ?? [])
        .map((e) => e as List<dynamic>)
        .where((e) => e.length >= 2)
        .map((e) => Offset((e[0] as num).toDouble(), (e[1] as num).toDouble()))
        .toList();
    if (path.isEmpty) return null;
    final steps = (parsed['instructions'] as List<dynamic>? ?? [])
        .map((e) => (e as Map<String, dynamic>)['instruction']?.toString() ?? e.toString())
        .toList();
    final mapRaw = parsed['map'] as Map<String, dynamic>?;
    if (mapRaw == null) return null;
    final mapData = MapData(
      id: int.tryParse(mapRaw['id']?.toString() ?? '0') ?? 0,
      name: mapRaw['name']?.toString() ?? '',
      imageUrl: mapRaw['image_url']?.toString() ?? '',
      floorLevel: mapRaw['floor_level'] as int?,
    );
    return RouteInfo(
      title: '${parsed['start_name'] ?? 'Bắt đầu'} -> ${parsed['end_name'] ?? 'Kết thúc'}',
      summary: '${((parsed['total_distance_m'] as num?)?.round() ?? 0)}m',
      path: path,
      steps: steps,
      map: mapData,
    );
  } catch (_) {
    return null;
  }
}

/// Parse messages from fetchHistory response
List<ChatMessage> parseHistoryMessages(Map<String, dynamic> body) {
  final raw = body['messages'] as List<dynamic>? ?? [];
  final List<ChatMessage> chatMessages = [];
  for (var e in raw) {
    final map = e as Map<String, dynamic>;
    final type = map['type']?.toString();
    final content = map['content']?.toString() ?? '';
    if (type == 'human') {
      chatMessages.add(ChatMessage(Role.user, content));
    } else if (type == 'ai') {
      List<Landmark>? landmarks;
      final kwargs = map['additional_kwargs'] as Map<String, dynamic>?;
      if (kwargs != null && kwargs['landmarks'] != null) {
        landmarks = parseLandmarks(kwargs['landmarks']);
      }
      chatMessages.add(ChatMessage(Role.bot, content, landmarks: landmarks));
    } else if (type == 'tool') {
      try {
        final parsed = jsonDecode(content);
        if (parsed is Map && parsed['type'] == 'route') {
          final route = parseRouteInfo(Map<String, dynamic>.from(parsed));
          if (route != null) {
            chatMessages.add(ChatMessage(
              Role.bot,
              'Đã tìm thấy lộ trình. Nhấn xem chỉ đường để mở bản đồ.',
              route: route,
            ));
          }
        } else {
          final landmarks = parseLandmarks(parsed);
          if (landmarks != null && landmarks.isNotEmpty) {
            chatMessages.add(ChatMessage(
              Role.bot,
              'Tôi tìm thấy một số địa điểm giống mô tả của bạn. Bạn xem có phải mình đang ở một trong những nơi này không?',
              landmarks: landmarks,
            ));
          }
        }
      } catch (_) {}
    }
  }
  return chatMessages;
}

void main() {
  group('Parse Agents', () {
    test('parse danh sách agents với key', () {
      final body = {
        'agents': [
          {'key': 'knowledge-base-agent', 'name': 'Hỏi đáp'},
          {'key': 'map-assistant', 'name': 'Chỉ đường'},
        ],
      };
      final result = parseAgents(body);
      expect(result, ['knowledge-base-agent', 'map-assistant']);
    });

    test('fallback về chatbot khi không có key', () {
      final body = {
        'agents': [
          {'name': 'No Key Agent'},
          {'key': 'valid-agent'},
        ],
      };
      final result = parseAgents(body);
      expect(result[0], 'chatbot');
      expect(result[1], 'valid-agent');
    });

    test('trả về list rỗng khi agents null', () {
      final body = <String, dynamic>{};
      final result = parseAgents(body);
      expect(result, isEmpty);
    });
  });

  group('Parse Login Token', () {
    test('trả về access_token', () {
      final body = {'access_token': 'jwt-abc-123'};
      expect(parseLoginToken(body), 'jwt-abc-123');
    });

    test('trả về rỗng khi không có token', () {
      final body = <String, dynamic>{};
      expect(parseLoginToken(body), '');
    });
  });

  group('Parse User ID', () {
    test('trả về id', () {
      final body = {'id': 'user-456'};
      expect(parseUserId(body), 'user-456');
    });

    test('fallback về guest khi không có id', () {
      final body = <String, dynamic>{};
      expect(parseUserId(body), 'guest');
    });
  });

  group('Parse Threads', () {
    test('parse threads với đầy đủ fields', () {
      final body = {
        'items': [
          {
            'id': 't1',
            'user_id': 'u1',
            'title': 'Hỏi thư viện',
            'created_at': '2026-05-06T10:00:00Z',
          },
        ],
      };
      final result = parseThreads(body);
      expect(result, hasLength(1));
      expect(result[0].id, 't1');
      expect(result[0].userId, 'u1');
      expect(result[0].title, 'Hỏi thư viện');
      expect(result[0].createdAt!.year, 2026);
    });

    test('parse threads với null fields', () {
      final body = {
        'items': [
          {
            'id': 't2',
            'user_id': 'u2',
            'title': null,
            'created_at': null,
          },
        ],
      };
      final result = parseThreads(body);
      expect(result[0].title, isNull);
      expect(result[0].createdAt, isNull);
    });

    test('trả về list rỗng khi không có items', () {
      final body = {'items': []};
      expect(parseThreads(body), isEmpty);
    });

    test('trả về list rỗng khi items null', () {
      final body = <String, dynamic>{};
      expect(parseThreads(body), isEmpty);
    });
  });

  group('Parse Landmarks', () {
    test('parse list landmarks trực tiếp', () {
      final raw = [
        {
          'id': 1,
          'name': 'Thư viện',
          'description': 'Tòa thư viện',
          'real_image_url': 'https://img.com/lib.png',
        },
        {
          'id': 2,
          'name': 'Canteen',
          'description': 'Nhà ăn',
          'real_image_url': 'https://img.com/c.png',
        },
      ];
      final result = parseLandmarks(raw);
      expect(result, isNotNull);
      expect(result, hasLength(2));
      expect(result![0].name, 'Thư viện');
      expect(result[1].id, 2);
      expect(result[1].imageUrl, 'https://img.com/c.png');
    });

    test('parse landmarks từ map chứa key "landmarks"', () {
      final raw = {
        'landmarks': [
          {
            'id': '5',
            'name': 'Phòng 101',
            'description': 'Phòng học',
            'real_image_url': '/images/101.png',
          },
        ],
      };
      final result = parseLandmarks(raw);
      expect(result, hasLength(1));
      expect(result![0].id, 5);
      expect(result[0].name, 'Phòng 101');
    });

    test('trả về null khi input rỗng', () {
      expect(parseLandmarks([]), isNull);
      expect(parseLandmarks({}), isNull);
    });

    test('trả về null khi JSON lỗi', () {
      expect(parseLandmarks('not a list or map'), isNull);
    });

    test('xử lý id dạng string', () {
      final raw = [
        {'id': '99', 'name': 'Test', 'description': '', 'real_image_url': ''},
      ];
      final result = parseLandmarks(raw);
      expect(result![0].id, 99);
    });

    test('fallback giá trị mặc định khi field thiếu', () {
      final raw = [
        {'id': null, 'name': null, 'description': null, 'real_image_url': null},
      ];
      final result = parseLandmarks(raw);
      expect(result![0].id, 0);
      expect(result[0].name, '');
      expect(result[0].description, '');
      expect(result[0].imageUrl, '');
    });
  });

  group('Parse Route Info', () {
    test('parse route với đầy đủ fields', () {
      final parsed = {
        'start_name': 'Sảnh A',
        'end_name': 'Phòng 101',
        'total_distance_m': 120.5,
        'path_coords': [[0, 0], [50, 50], [100, 0]],
        'instructions': [
          {'instruction': 'Đi thẳng 50m'},
          {'instruction': 'Rẽ phải'},
        ],
        'map': {
          'id': 1,
          'name': 'A4 Tầng 1',
          'image_url': '/maps/a4-f1.png',
          'floor_level': 1,
        },
      };
      final result = parseRouteInfo(parsed);
      expect(result, isNotNull);
      expect(result!.title, 'Sảnh A -> Phòng 101');
      expect(result.summary, '121m'); // 120.5 rounds to 121
      expect(result.path, hasLength(3));
      expect(result.path[0].dx, 0);
      expect(result.path[1].dy, 50);
      expect(result.steps, hasLength(2));
      expect(result.steps[0], 'Đi thẳng 50m');
      expect(result.map.name, 'A4 Tầng 1');
      expect(result.map.floorLevel, 1);
    });

    test('fallback tên mặc định khi không có start/end', () {
      final parsed = {
        'total_distance_m': 50,
        'path_coords': [[0, 0], [10, 10]],
        'instructions': [],
        'map': {'id': 1, 'name': 'Test', 'image_url': ''},
      };
      final result = parseRouteInfo(parsed);
      expect(result!.title, 'Bắt đầu -> Kết thúc');
    });

    test('trả về null khi path_coords rỗng', () {
      final parsed = {
        'path_coords': [],
        'map': {'id': 1, 'name': 'Test', 'image_url': ''},
      };
      expect(parseRouteInfo(parsed), isNull);
    });

    test('trả về null khi không có map', () {
      final parsed = {
        'path_coords': [[0, 0]],
        'instructions': [],
      };
      expect(parseRouteInfo(parsed), isNull);
    });

    test('trả về null khi exception', () {
      final parsed = {'path_coords': 'not a list'};
      expect(parseRouteInfo(parsed), isNull);
    });

    test('xử lý khoảng cách 0', () {
      final parsed = {
        'total_distance_m': 0,
        'path_coords': [[0, 0], [1, 1]],
        'instructions': [],
        'map': {'id': 0, 'name': '', 'image_url': ''},
      };
      final result = parseRouteInfo(parsed);
      expect(result!.summary, '0m');
    });
  });

  group('Parse History Messages', () {
    test('parse human message', () {
      final body = {
        'messages': [
          {'type': 'human', 'content': 'Xin chào'},
        ],
      };
      final messages = parseHistoryMessages(body);
      expect(messages, hasLength(1));
      expect(messages[0].role, Role.user);
      expect(messages[0].text, 'Xin chào');
    });

    test('parse ai message', () {
      final body = {
        'messages': [
          {'type': 'ai', 'content': 'Chào bạn'},
        ],
      };
      final messages = parseHistoryMessages(body);
      expect(messages[0].role, Role.bot);
      expect(messages[0].text, 'Chào bạn');
    });

    test('parse ai message có landmarks', () {
      final body = {
        'messages': [
          {
            'type': 'ai',
            'content': 'Tìm thấy địa điểm',
            'additional_kwargs': {
              'landmarks': [
                {
                  'id': 1,
                  'name': 'Thư viện',
                  'description': 'Mô tả',
                  'real_image_url': 'https://img.com/lib.png',
                },
              ],
            },
          },
        ],
      };
      final messages = parseHistoryMessages(body);
      expect(messages[0].landmarks, isNotNull);
      expect(messages[0].landmarks, hasLength(1));
      expect(messages[0].landmarks![0].name, 'Thư viện');
    });

    test('parse tool route message', () {
      final body = {
        'messages': [
          {
            'type': 'tool',
            'content': jsonEncode({
              'type': 'route',
              'start_name': 'A',
              'end_name': 'B',
              'total_distance_m': 100,
              'path_coords': [[0, 0], [10, 10]],
              'instructions': [{'instruction': 'Đi thẳng'}],
              'map': {'id': 1, 'name': 'A4', 'image_url': '', 'floor_level': 1},
            }),
          },
        ],
      };
      final messages = parseHistoryMessages(body);
      expect(messages, hasLength(1));
      expect(messages[0].route, isNotNull);
      expect(messages[0].route!.title, 'A -> B');
      expect(messages[0].text, contains('lộ trình'));
    });

    test('parse tool landmarks message', () {
      final body = {
        'messages': [
          {
            'type': 'tool',
            'content': jsonEncode([
              {
                'id': 1,
                'name': 'Canteen',
                'description': 'Nhà ăn',
                'real_image_url': 'url',
              },
            ]),
          },
        ],
      };
      final messages = parseHistoryMessages(body);
      expect(messages, hasLength(1));
      expect(messages[0].landmarks, hasLength(1));
      expect(messages[0].text, contains('địa điểm'));
    });

    test('bỏ qua tool message JSON không hợp lệ', () {
      final body = {
        'messages': [
          {'type': 'tool', 'content': 'not json'},
        ],
      };
      final messages = parseHistoryMessages(body);
      expect(messages, isEmpty);
    });

    test('bỏ qua message type không xác định', () {
      final body = {
        'messages': [
          {'type': 'unknown', 'content': 'test'},
        ],
      };
      final messages = parseHistoryMessages(body);
      expect(messages, isEmpty);
    });

    test('parse hỗn hợp nhiều messages', () {
      final body = {
        'messages': [
          {'type': 'human', 'content': 'Câu hỏi 1'},
          {'type': 'ai', 'content': 'Trả lời 1'},
          {'type': 'human', 'content': 'Câu hỏi 2'},
          {'type': 'ai', 'content': 'Trả lời 2'},
        ],
      };
      final messages = parseHistoryMessages(body);
      expect(messages, hasLength(4));
      expect(messages[0].role, Role.user);
      expect(messages[1].role, Role.bot);
      expect(messages[2].role, Role.user);
      expect(messages[3].role, Role.bot);
    });

    test('trả về list rỗng khi messages null', () {
      final body = <String, dynamic>{};
      expect(parseHistoryMessages(body), isEmpty);
    });

    test('xử lý content null', () {
      final body = {
        'messages': [
          {'type': 'human', 'content': null},
        ],
      };
      final messages = parseHistoryMessages(body);
      expect(messages, hasLength(1));
      expect(messages[0].text, '');
    });
  });
}
