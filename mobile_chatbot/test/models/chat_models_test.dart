import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_chatbot/models/chat_models.dart';
import 'package:latlong2/latlong.dart';
import 'dart:ui';

void main() {
  group('Role enum', () {
    test('có đúng 2 giá trị', () {
      expect(Role.values.length, 2);
      expect(Role.user.name, 'user');
      expect(Role.bot.name, 'bot');
    });
  });

  group('VoiceStatus enum', () {
    test('có đúng 5 giá trị', () {
      expect(VoiceStatus.values.length, 5);
      expect(VoiceStatus.idle.name, 'idle');
      expect(VoiceStatus.connecting.name, 'connecting');
      expect(VoiceStatus.connected.name, 'connected');
      expect(VoiceStatus.disconnected.name, 'disconnected');
      expect(VoiceStatus.error.name, 'error');
    });
  });

  group('Rating enum', () {
    test('có đúng 2 giá trị', () {
      expect(Rating.values.length, 2);
      expect(Rating.like.name, 'like');
      expect(Rating.dislike.name, 'dislike');
    });
  });

  group('Landmark', () {
    test('tạo Landmark với đầy đủ fields', () {
      final landmark = Landmark(
        id: 1,
        name: 'Thư viện',
        description: 'Tòa nhà thư viện',
        imageUrl: 'https://example.com/image.jpg',
      );

      expect(landmark.id, 1);
      expect(landmark.name, 'Thư viện');
      expect(landmark.description, 'Tòa nhà thư viện');
      expect(landmark.imageUrl, 'https://example.com/image.jpg');
    });

    test('tạo Landmark với giá trị rỗng', () {
      final landmark = Landmark(
        id: 0,
        name: '',
        description: '',
        imageUrl: '',
      );

      expect(landmark.id, 0);
      expect(landmark.name, isEmpty);
      expect(landmark.description, isEmpty);
      expect(landmark.imageUrl, isEmpty);
    });
  });

  group('ChatMessage', () {
    test('tạo ChatMessage cơ bản (user)', () {
      final msg = ChatMessage(Role.user, 'Xin chào');

      expect(msg.role, Role.user);
      expect(msg.text, 'Xin chào');
      expect(msg.runId, isNull);
      expect(msg.route, isNull);
      expect(msg.landmarks, isNull);
    });

    test('tạo ChatMessage với runId', () {
      final msg = ChatMessage(Role.bot, 'Trả lời', runId: 'run-123');

      expect(msg.runId, 'run-123');
    });

    test('tạo ChatMessage với route', () {
      final mapData = MapData(id: 1, name: 'A4', imageUrl: 'url');
      final route = RouteInfo(
        title: 'A -> B',
        summary: '50m',
        path: [const Offset(0, 0), const Offset(10, 10)],
        steps: ['Đi thẳng', 'Rẽ phải'],
        map: mapData,
      );
      final msg = ChatMessage(Role.bot, 'Đã tìm đường', route: route);

      expect(msg.route, isNotNull);
      expect(msg.route!.title, 'A -> B');
      expect(msg.route!.steps, hasLength(2));
      expect(msg.landmarks, isNull);
    });

    test('tạo ChatMessage với landmarks', () {
      final landmarks = [
        Landmark(id: 1, name: 'Thư viện', description: 'Mô tả', imageUrl: 'url'),
        Landmark(id: 2, name: 'Canteen', description: 'Mô tả 2', imageUrl: 'url2'),
      ];
      final msg = ChatMessage(Role.bot, 'Tìm thấy địa điểm', landmarks: landmarks);

      expect(msg.landmarks, isNotNull);
      expect(msg.landmarks, hasLength(2));
      expect(msg.landmarks![0].name, 'Thư viện');
      expect(msg.landmarks![1].name, 'Canteen');
    });

    test('ChatMessage bot có thể có cả route và landmarks null', () {
      final msg = ChatMessage(Role.bot, 'Trả lời thường');

      expect(msg.role, Role.bot);
      expect(msg.text, 'Trả lời thường');
      expect(msg.route, isNull);
      expect(msg.landmarks, isNull);
    });
  });

  group('ThreadItem', () {
    test('tạo ThreadItem với đầy đủ fields', () {
      final now = DateTime.now();
      final thread = ThreadItem(
        id: 'thread-1',
        userId: 'user-1',
        title: 'Hội thoại test',
        createdAt: now,
      );

      expect(thread.id, 'thread-1');
      expect(thread.userId, 'user-1');
      expect(thread.title, 'Hội thoại test');
      expect(thread.createdAt, now);
    });

    test('tạo ThreadItem với title và createdAt null', () {
      final thread = ThreadItem(
        id: 'thread-2',
        userId: 'user-2',
        title: null,
        createdAt: null,
      );

      expect(thread.id, 'thread-2');
      expect(thread.title, isNull);
      expect(thread.createdAt, isNull);
    });

    test('parse createdAt từ ISO string', () {
      final date = DateTime.parse('2026-05-06T10:30:00Z');
      final thread = ThreadItem(
        id: 't',
        userId: 'u',
        title: null,
        createdAt: date,
      );

      expect(thread.createdAt!.year, 2026);
      expect(thread.createdAt!.month, 5);
    });
  });

  group('MapData', () {
    test('tạo MapData không có floorLevel', () {
      final map = MapData(id: 1, name: 'A4', imageUrl: 'https://a4.png');

      expect(map.id, 1);
      expect(map.name, 'A4');
      expect(map.imageUrl, 'https://a4.png');
      expect(map.floorLevel, isNull);
    });

    test('tạo MapData có floorLevel', () {
      final map = MapData(
        id: 2,
        name: 'A4 Tầng 1',
        imageUrl: 'https://a4-f1.png',
        floorLevel: 1,
      );

      expect(map.floorLevel, 1);
    });
  });

  group('RouteInfo', () {
    test('tạo RouteInfo cơ bản', () {
      final mapData = MapData(id: 1, name: 'A4', imageUrl: 'url');
      final route = RouteInfo(
        title: 'Sảnh A -> Phòng 101',
        summary: '120m',
        path: [const Offset(0, 0), const Offset(50, 50), const Offset(100, 0)],
        steps: ['Đi thẳng 50m', 'Rẽ phải', 'Đến nơi'],
        map: mapData,
      );

      expect(route.title, 'Sảnh A -> Phòng 101');
      expect(route.summary, '120m');
      expect(route.path, hasLength(3));
      expect(route.steps, hasLength(3));
      expect(route.map.name, 'A4');
      expect(route.floors, isNull);
    });

    test('tạo RouteInfo với floor segments', () {
      final mapData = MapData(id: 1, name: 'A4', imageUrl: 'url');
      final floors = [
        FloorSegment(
          mapId: 1,
          name: 'Tầng 1',
          path: [const Offset(0, 0), const Offset(10, 10)],
          steps: ['Đi thẳng tầng 1'],
        ),
        FloorSegment(
          mapId: 2,
          name: 'Tầng 2',
          path: [const Offset(0, 0), const Offset(5, 5)],
          steps: ['Lên cầu thang', 'Rẽ trái'],
        ),
      ];
      final route = RouteInfo(
        title: 'Tầng 1 -> Tầng 2',
        summary: '30m',
        path: [const Offset(0, 0), const Offset(15, 15)],
        steps: ['Đi thẳng', 'Lên tầng 2'],
        map: mapData,
        floors: floors,
      );

      expect(route.floors, isNotNull);
      expect(route.floors, hasLength(2));
      expect(route.floors![0].name, 'Tầng 1');
      expect(route.floors![1].name, 'Tầng 2');
    });
  });

  group('FloorSegment', () {
    test('tạo FloorSegment cơ bản', () {
      final segment = FloorSegment(
        mapId: 1,
        name: 'Tầng 1',
        path: [const Offset(0, 0), const Offset(10, 10)],
        steps: ['Đi thẳng', 'Rẽ phải'],
      );

      expect(segment.mapId, 1);
      expect(segment.name, 'Tầng 1');
      expect(segment.path, hasLength(2));
      expect(segment.steps, hasLength(2));
    });
  });
}
