import 'dart:convert';
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
}
