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
    this.type = 'building',
  });

  final int id;
  final String name;
  final String description;
  final String imageUrl;
  final String type;
}

class InstructionStep {
  InstructionStep({
    required this.text,
    this.coordinate,
    this.distanceM,
    this.endNodeId,
    this.mapId,
  });

  final String text;
  final Offset? coordinate;
  final double? distanceM;
  final int? endNodeId;
  final int? mapId;

  factory InstructionStep.fromJson(Map<String, dynamic> json) {
    final coord = json['coordinate'];
    Offset? offset;
    if (coord is List && coord.length >= 2) {
      offset = Offset(
        (coord[0] as num).toDouble(),
        (coord[1] as num).toDouble(),
      );
    }
    return InstructionStep(
      text: json['instruction']?.toString() ?? json['text']?.toString() ?? '',
      coordinate: offset,
      distanceM: (json['distance_m'] as num?)?.toDouble(),
      endNodeId: json['end_node_id'] as int?,
      mapId: json['map_id'] as int?,
    );
  }
}

class RouteMapInfo {
  RouteMapInfo({
    required this.map,
    required this.nodes,
  });

  final MapData map;
  final List<MapNode> nodes;
}

class MapNode {
  MapNode({
    required this.id,
    required this.mapId,
    required this.x,
    required this.y,
    required this.name,
  });

  final int id;
  final int mapId;
  final double x;
  final double y;
  final String name;

  factory MapNode.fromJson(Map<String, dynamic> json) {
    return MapNode(
      id: (json['id'] as num).toInt(),
      mapId: (json['map_id'] as num?)?.toInt() ?? 0,
      x: (json['x'] as num).toDouble(),
      y: (json['y'] as num).toDouble(),
      name: json['name']?.toString() ?? '',
    );
  }
}

class ChatMessage {
  ChatMessage(this.role, this.text, {
    this.runId,
    this.route,
    this.landmarks,
    this.confirmationJson,
  });
  final Role role;
  final String text;
  final String? runId;
  final RouteInfo? route;
  final List<Landmark>? landmarks;
  final String? confirmationJson;
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
    this.instructions,
    this.startName,
    this.endName,
    this.totalDistanceM = 0,
    this.status,
    this.startOptions,
    this.endOptions,
    this.routeMaps,
  });

  final String title;
  final String summary;
  final List<Offset> path;
  final List<String> steps;
  final MapData map;
  final List<FloorSegment>? floors;
  final List<InstructionStep>? instructions;
  final String? startName;
  final String? endName;
  final double totalDistanceM;
  final String? status;
  final List<String>? startOptions;
  final List<String>? endOptions;
  final List<RouteMapInfo>? routeMaps;
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

class AgentInfo {
  AgentInfo({required this.key, this.description});

  final String key;
  final String? description;

  String get displayName {
    switch (key) {
      case 'router-agent':
        return 'Trợ lý thông minh';
      case 'knowledge-base-agent':
        return 'Hỏi đáp quy chế';
      case 'map-assistant':
        return 'Bản đồ & Chỉ đường';
      default:
        return key;
    }
  }
}
