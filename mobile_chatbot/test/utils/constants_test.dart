import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_chatbot/utils/constants.dart';

void main() {
  group('AppConstants', () {
    test('apiBase có giá trị mặc định', () {
      // String.fromEnvironment trả về defaultValue khi không có --dart-define
      expect(AppConstants.apiBase, 'http://10.0.2.2:8002');
    });

    test('có đầy đủ màu sắc', () {
      expect(AppConstants.primaryColor.value, 0xFF2563EB);
      expect(AppConstants.secondaryColor.value, 0xFF64748B);
      expect(AppConstants.backgroundColor.value, 0xFFF8FAFC);
      expect(AppConstants.cardColor.value, 0xFFFFFFFF);
      expect(AppConstants.accentColor.value, 0xFF86EFAC);
      expect(AppConstants.errorColor.value, 0xFFEF4444);
      expect(AppConstants.glassColor.value, 0xCCFFFFFF);
    });

    test('borderRadius có giá trị 24', () {
      expect(AppConstants.borderRadius, 24.0);
    });
  });

  group('getFullImageUrl', () {
    test('trả về rỗng khi path rỗng', () {
      expect(AppConstants.getFullImageUrl(''), '');
    });

    test('trả về nguyên vẹn khi đã là full URL', () {
      const fullUrl = 'https://example.com/image.png';
      final result = AppConstants.getFullImageUrl(fullUrl);
      expect(result, fullUrl);
    });

    test('thêm leading slash khi path không có', () {
      final result = AppConstants.getFullImageUrl('images/test.png');
      expect(result, 'http://10.0.2.2:8002/wayfinder/static/images/test.png');
    });

    test('giữ nguyên leading slash khi đã có', () {
      final result = AppConstants.getFullImageUrl('/images/test.png');
      expect(result, 'http://10.0.2.2:8002/wayfinder/static/images/test.png');
    });

    test('không duplicate /wayfinder/static khi đã có sẵn', () {
      const path = '/wayfinder/static/images/test.png';
      final result = AppConstants.getFullImageUrl(path);
      expect(result, 'http://10.0.2.2:8002/wayfinder/static/images/test.png');
      // Đảm bảo không bị duplicate
      expect(result.split('/wayfinder/static').length, 2); // 1 phần trước + 1 phần sau
    });

    test('xử lý path có /maps/ prefix', () {
      final result = AppConstants.getFullImageUrl('/maps/a4-floor1.png');
      expect(result, 'http://10.0.2.2:8002/wayfinder/static/maps/a4-floor1.png');
    });

    test('xử lý URL https đã có full path', () {
      const httpsPath = 'https://example.com/wayfinder/static/image.png';
      final result = AppConstants.getFullImageUrl(httpsPath);
      expect(result, httpsPath);
    });
  });
}
