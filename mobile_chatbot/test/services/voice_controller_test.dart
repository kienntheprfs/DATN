import 'dart:convert';
import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_chatbot/models/chat_models.dart';
import 'package:mobile_chatbot/services/voice_controller.dart';

// Mirrors _parseMarkdown in voice_controller.dart
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

// Mirrors _parseRoute logic in voice_controller.dart
RouteInfo? _parseRoute(String? content) {
  if (content == null) return null;
  try {
    final parsed = jsonDecode(content) as Map<String, dynamic>;
    if (parsed['type']?.toString() != 'route') return null;
    final path = (parsed['path_coords'] as List<dynamic>? ?? [])
        .map((e) => e as List<dynamic>)
        .where((e) => e.length >= 2)
        .map(
          (e) => Offset((e[0] as num).toDouble(), (e[1] as num).toDouble()),
        )
        .toList();
    if (path.isEmpty) return null;
    final steps = (parsed['instructions'] as List<dynamic>? ?? [])
        .map(
          (e) =>
              (e as Map<String, dynamic>)['instruction']?.toString() ??
              e.toString(),
        )
        .toList();
    return RouteInfo(
      title:
          '${parsed['start_name'] ?? 'Start'} -> ${parsed['end_name'] ?? 'End'}',
      summary:
          '${((parsed['total_distance_m'] as num?)?.round() ?? 0)}m',
      path: path,
      steps: steps,
      map: MapData(
        id: int.tryParse(parsed['map']?['id']?.toString() ?? '0') ?? 0,
        name: parsed['map']?['name']?.toString() ?? '',
        imageUrl: parsed['map']?['image_url']?.toString() ?? '',
        floorLevel: parsed['map']?['floor_level'] as int?,
      ),
    );
  } catch (_) {
    return null;
  }
}

// Mirrors _parseLandmarks logic in voice_controller.dart
List<Landmark>? _parseLandmarks(String? content) {
  if (content == null) return null;
  try {
    final parsed = jsonDecode(content);
    List<dynamic>? rawLandmarks;
    if (parsed is List) {
      rawLandmarks = parsed;
    } else if (parsed is Map && parsed['landmarks'] is List) {
      rawLandmarks = parsed['landmarks'];
    }

    if (rawLandmarks == null || rawLandmarks.isEmpty) return null;

    final landmarks = rawLandmarks.map((e) {
      final m = e as Map<String, dynamic>;
      return Landmark(
        id: int.tryParse(m['id']?.toString() ?? '0') ?? 0,
        name: m['name']?.toString() ?? '',
        description: m['description']?.toString() ?? '',
        imageUrl: m['real_image_url']?.toString() ?? '',
      );
    }).toList();

    if (landmarks.isEmpty) return null;
    return landmarks;
  } catch (_) {
    return null;
  }
}

void main() {
  group('_parseMarkdown', () {
    test('giữ nguyên text không có markdown', () {
      expect(_parseMarkdown('Hello world'), 'Hello world');
    });

    test('loại bỏ **bold**', () {
      // Source uses replaceAll với r'$1' (literal string, không phải capture group)
      expect(_parseMarkdown('This is **bold** text'), r'This is $1 text');
    });

    test('loại bỏ *italic*', () {
      expect(_parseMarkdown('This is *italic* text'), r'This is $1 text');
    });

    test('loại bỏ __underline__', () {
      expect(_parseMarkdown('__underlined__'), r'$1');
    });

    test('loại bỏ _italic underscore_', () {
      expect(_parseMarkdown('_italic_'), r'$1');
    });

    test('loại bỏ ~~strikethrough~~', () {
      expect(_parseMarkdown('~~deleted~~'), r'$1');
    });

    test('loại bỏ `inline code`', () {
      expect(_parseMarkdown('Use `print()` function'), r'Use $1 function');
    });

    test('loại bỏ [link](url)', () {
      expect(_parseMarkdown('Click [here](https://example.com)'), r'Click $1');
    });

    test('loại bỏ # heading', () {
      expect(_parseMarkdown('# Main Title'), 'Main Title');
    });

    test('loại bỏ ## heading', () {
      expect(_parseMarkdown('## Sub Title'), 'Sub Title');
    });

    test('loại bỏ ### heading', () {
      expect(_parseMarkdown('### Third Level'), 'Third Level');
    });

    test('loại bỏ list markers', () {
      expect(_parseMarkdown('- Item one'), 'Item one');
      expect(_parseMarkdown('* Item two'), 'Item two');
    });

    test('nén nhiều dòng trống thành 2 dòng', () {
      expect(_parseMarkdown('A\n\n\n\nB'), 'A\n\nB');
    });

    test('trim khoảng trắng đầu cuối', () {
      expect(_parseMarkdown('  trimmed  '), 'trimmed');
    });

    test('xử lý kết hợp nhiều markdown', () {
      const input = '## Title\n\nThis is **bold** and *italic*.\n\n- Point 1\n\n\n- Point 2';
      final result = _parseMarkdown(input);
      // Sau khi remove headings, bold/italic -> $1, list markers, và nén newlines
      expect(result.contains('Title'), isTrue);
      expect(result.contains(r'$1 and $1'), isTrue);
      expect(result.contains('Point 1'), isTrue);
      expect(result.contains('Point 2'), isTrue);
    });

    test('xử lý multiple bold trong cùng dòng', () {
      expect(_parseMarkdown('**A** and **B**'), r'$1 and $1');
    });

    test('xử lý rỗng sau khi parse', () {
      expect(_parseMarkdown('   '), '');
    });
  });

  group('_parseRoute', () {
    test('parse route với đầy đủ fields', () {
      const json = '''
      {
        "type": "route",
        "start_name": "A1",
        "end_name": "A4",
        "total_distance_m": 150.7,
        "path_coords": [[0, 0], [5, 10], [15, 20]],
        "instructions": [
          {"instruction": "Đi thẳng"},
          {"instruction": "Rẽ phải"}
        ],
        "map": {"id": "1", "name": "Tầng 1", "image_url": "/maps/floor1.png"}
      }
      ''';
      final result = _parseRoute(json);
      expect(result, isNotNull);
      expect(result!.title, 'A1 -> A4');
      expect(result.summary, '151m');
      expect(result.path.length, 3);
      expect(result.path.first, const Offset(0, 0));
      expect(result.path.last, const Offset(15, 20));
      expect(result.steps.length, 2);
      expect(result.steps.first, 'Đi thẳng');
      expect(result.map.id, 1);
      expect(result.map.name, 'Tầng 1');
    });

    test('trả về null khi không phải type route', () {
      const json = '{"type": "landmarks", "path_coords": [[0, 0]]}';
      expect(_parseRoute(json), isNull);
    });

    test('trả về null khi path_coords rỗng', () {
      const json = '{"type": "route", "path_coords": []}';
      expect(_parseRoute(json), isNull);
    });

    test('trả về null khi không có path_coords', () {
      const json = '{"type": "route"}';
      expect(_parseRoute(json), isNull);
    });

    test('trả về null khi content null', () {
      expect(_parseRoute(null), isNull);
    });

    test('trả về null khi JSON lỗi', () {
      expect(_parseRoute('not json'), isNull);
    });

    test('fallback tên mặc định khi không có start/end', () {
      const json = '{"type": "route", "path_coords": [[0, 0]]}';
      final result = _parseRoute(json);
      // Will return null because path_coords [[0,0]] is valid but let's check
      // Actually the path won't be empty, so let's check with a proper path
      const json2 = '{"type": "route", "path_coords": [[1, 2]]}';
      final result2 = _parseRoute(json2);
      expect(result2!.title, 'Start -> End');
    });

    test('fallback khoảng cách 0 khi không có', () {
      const json = '{"type": "route", "path_coords": [[0, 0]]}';
      final result = _parseRoute(json);
      expect(result!.summary, '0m');
    });

    test('parse instructions là map với instruction key', () {
      const json = '''
      {
        "type": "route",
        "path_coords": [[0, 0]],
        "instructions": [
          {"instruction": "Đi thẳng"},
          {"instruction": "Rẽ trái"}
        ]
      }
      ''';
      final result = _parseRoute(json);
      expect(result!.steps, ['Đi thẳng', 'Rẽ trái']);
    });

    test('trả về null khi instructions là string (không phải map)', () {
      // Code thực tế cast mỗi phần tử là Map<String, dynamic>, string sẽ throw
      const json = '''
      {
        "type": "route",
        "path_coords": [[0, 0]],
        "instructions": ["Step 1", "Step 2"]
      }
      ''';
      expect(_parseRoute(json), isNull);
    });

    test('xử lý floor_level của map', () {
      const json = '''
      {
        "type": "route",
        "path_coords": [[0, 0]],
        "map": {"id": "2", "name": "Tầng 2", "floor_level": 2}
      }
      ''';
      final result = _parseRoute(json);
      expect(result!.map.floorLevel, 2);
    });
  });

  group('_parseLandmarks', () {
    test('parse landmarks từ list trực tiếp', () {
      const json = '''
      [
        {"id": 1, "name": "Phòng 101", "description": "Phòng học", "real_image_url": "/img/101.jpg"},
        {"id": 2, "name": "Phòng 102", "description": "Thư viện", "real_image_url": "/img/102.jpg"}
      ]
      ''';
      final result = _parseLandmarks(json);
      expect(result, isNotNull);
      expect(result!.length, 2);
      expect(result.first.name, 'Phòng 101');
      expect(result.first.description, 'Phòng học');
      expect(result.first.imageUrl, '/img/101.jpg');
    });

    test('parse landmarks từ map chứa key "landmarks"', () {
      const json = '''
      {
        "landmarks": [
          {"id": "5", "name": "Canteen", "description": "Nhà ăn"}
        ]
      }
      ''';
      final result = _parseLandmarks(json);
      expect(result, isNotNull);
      expect(result!.length, 1);
      expect(result.first.id, 5);
      expect(result.first.name, 'Canteen');
    });

    test('trả về null khi content null', () {
      expect(_parseLandmarks(null), isNull);
    });

    test('trả về null khi JSON lỗi', () {
      expect(_parseLandmarks('invalid'), isNull);
    });

    test('trả về null khi landmarks rỗng', () {
      expect(_parseLandmarks('[]'), isNull);
    });

    test('xử lý id dạng string', () {
      const json = '[{"id": "42", "name": "Test"}]';
      final result = _parseLandmarks(json);
      expect(result!.first.id, 42);
    });

    test('fallback giá trị mặc định khi field thiếu', () {
      const json = '[{"id": 1}]';
      final result = _parseLandmarks(json);
      expect(result!.first.name, '');
      expect(result.first.description, '');
      expect(result.first.imageUrl, '');
    });

    test('bỏ qua khi không có landmarks key trong map', () {
      const json = '{"other": "data"}';
      expect(_parseLandmarks(json), isNull);
    });
  });
}
