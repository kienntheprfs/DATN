import 'package:flutter/material.dart';
import '../models/chat_models.dart';
import '../services/api_client.dart';
import '../utils/constants.dart';
import '../widgets/message_bubble.dart';

class HistoryDetailScreen extends StatefulWidget {
  const HistoryDetailScreen({
    super.key,
    required this.threadId,
    required this.token,
    required this.api,
    required this.title,
  });

  final String threadId;
  final String token;
  final ApiClient api;
  final String title;

  @override
  State<HistoryDetailScreen> createState() => _HistoryDetailScreenState();
}

class _HistoryDetailScreenState extends State<HistoryDetailScreen> {
  late Future<List<ChatMessage>> _historyFuture;

  @override
  void initState() {
    super.initState();
    _historyFuture = widget.api.fetchHistory(
      token: widget.token,
      threadId: widget.threadId,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppConstants.backgroundColor,
      appBar: AppBar(
        title: Text(
          widget.title.toUpperCase(),
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w900, letterSpacing: 1),
        ),
        elevation: 0,
        backgroundColor: Colors.white,
        foregroundColor: AppConstants.secondaryColor,
      ),
      body: FutureBuilder<List<ChatMessage>>(
        future: _historyFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text('Lỗi nạp lịch sử: ${snapshot.error}'));
          }
          final messages = snapshot.data ?? [];
          if (messages.isEmpty) {
            return const Center(child: Text('Không có tin nhắn nào trong hội thoại này.'));
          }

          return ListView.builder(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
            itemCount: messages.length,
            itemBuilder: (context, index) {
              return MessageBubble(
                message: messages[index],
                api: widget.api,
                onError: (msg) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg))),
                agentId: 'chatbot', // Default
                threadId: widget.threadId,
                token: widget.token,
              );
            },
          );
        },
      ),
    );
  }
}
