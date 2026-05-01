import 'package:latlong2/latlong.dart';

enum Role { user, bot }

enum VoiceStatus { idle, connecting, connected, disconnected, error }

enum Rating { like, dislike }

class ChatMessage {
  ChatMessage(this.role, this.text, {this.runId, this.route});
  final Role role;
  final String text;
  final String? runId;
  final RouteInfo? route;
}

class RouteInfo {
  RouteInfo({
    required this.title,
    required this.summary,
    required this.path,
    required this.steps,
  });

  final String title;
  final String summary;
  final List<LatLng> path;
  final List<String> steps;
}
