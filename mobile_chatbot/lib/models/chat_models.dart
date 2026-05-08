import 'dart:ui';
import 'package:latlong2/latlong.dart';

enum Role { user, bot }

enum VoiceStatus { idle, connecting, connected, disconnected, error }

enum Rating { like, dislike }

class Landmark {
  Landmark({
    required this.id,
    required this.name,
    required this.description,
    required this.imageUrl,
  });

  final int id;
  final String name;
  final String description;
  final String imageUrl;
}

class ChatMessage {
  ChatMessage(this.role, this.text, {this.runId, this.route, this.landmarks});
  final Role role;
  final String text;
  final String? runId;
  final RouteInfo? route;
  final List<Landmark>? landmarks;
}

class ThreadItem {
  ThreadItem({
    required this.id,
    required this.userId,
    required this.title,
    required this.createdAt,
  });

  final String id;
  final String userId;
  final String? title;
  final DateTime? createdAt;
}

class MapData {
  MapData({
    required this.id,
    required this.name,
    required this.imageUrl,
    this.floorLevel,
  });

  final int id;
  final String name;
  final String imageUrl;
  final int? floorLevel;
}

class RouteInfo {
  RouteInfo({
    required this.title,
    required this.summary,
    required this.path,
    required this.steps,
    required this.map,
    this.floors,
  });

  final String title;
  final String summary;
  final List<Offset> path; // Changed from LatLng to Offset (pixels)
  final List<String> steps;
  final MapData map;
  final List<FloorSegment>? floors;
}

class FloorSegment {
  FloorSegment({
    required this.mapId,
    required this.name,
    required this.path,
    required this.steps,
  });

  final int mapId;
  final String name;
  final List<Offset> path;
  final List<String> steps;
}
