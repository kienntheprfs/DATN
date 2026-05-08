import 'package:flutter/material.dart';

class AppConstants {
  static const String apiBase = String.fromEnvironment(
    'API_URL',
    defaultValue: 'http://10.0.2.2:8002',
  );

  // Premium Color Palette
  static const Color primaryColor = Color(0xFF2563EB); // Royal Blue
  static const Color secondaryColor = Color(0xFF64748B); // Slate
  static const Color backgroundColor = Color(0xFFF8FAFC);
  static const Color cardColor = Colors.white;
  static const Color accentColor = Color(0xFF86EFAC); // Soft Green for connected state
  static const Color errorColor = Color(0xFFEF4444);
  
  static const Color glassColor = Color(0xCCFFFFFF);
  static const double borderRadius = 24.0;

  static String getFullImageUrl(String path) {
    if (path.isEmpty) return '';
    if (path.startsWith('http')) return path;
    
    // Match frontend logic in wayfinding-client.ts
    // frontend uses /api/wayfinder/static/ as the base for wayfinding images
    
    final cleanPath = path.startsWith('/') ? path : '/$path';
    
    // If the path already includes the full static path, don't duplicate it
    if (cleanPath.contains('/wayfinder/static')) {
      return '${apiBase}${cleanPath}';
    }
    
    return '${apiBase}/wayfinder/static${cleanPath}';
  }
}
