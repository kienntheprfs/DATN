import 'package:flutter/material.dart';
import '../models/chat_models.dart';
import '../services/api_client.dart';
import '../utils/constants.dart';
import 'history_detail_screen.dart';

class HistoryListScreen extends StatefulWidget {
  const HistoryListScreen({super.key, required this.token, required this.api});
  final String token;
  final ApiClient api;

  @override
  State<HistoryListScreen> createState() => _HistoryListScreenState();
}

class _HistoryListScreenState extends State<HistoryListScreen> {
  late Future<List<ThreadItem>> _threadsFuture;

  @override
  void initState() {
    super.initState();
    _threadsFuture = widget.api.fetchThreads(token: widget.token);
  }

  String _formatDate(DateTime? date) {
    if (date == null) return '';
    return '${date.day}/${date.month}/${date.year} ${date.hour}:${date.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppConstants.backgroundColor,
      appBar: AppBar(
        title: const Text(
          'LỊCH SỬ HỘI THOẠI',
          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w900, letterSpacing: 1),
        ),
        centerTitle: true,
        elevation: 0,
        backgroundColor: Colors.white,
        foregroundColor: AppConstants.secondaryColor,
      ),
      body: FutureBuilder<List<ThreadItem>>(
        future: _threadsFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text('Lỗi: ${snapshot.error}'));
          }
          final threads = snapshot.data ?? [];
          if (threads.isEmpty) {
            return const Center(child: Text('Chưa có lịch sử hội thoại nào.'));
          }

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: threads.length,
            itemBuilder: (context, index) {
              final thread = threads[index];
              return Card(
                margin: const EdgeInsets.only(bottom: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                elevation: 2,
                shadowColor: Colors.black.withOpacity(0.05),
                child: ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                  title: Text(
                    thread.title ?? 'Cuộc trò chuyện mới',
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                  ),
                  subtitle: Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      _formatDate(thread.createdAt),
                      style: TextStyle(color: Colors.grey.shade500, fontSize: 12),
                    ),
                  ),
                  trailing: const Icon(Icons.chevron_right, color: AppConstants.secondaryColor),
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => HistoryDetailScreen(
                          threadId: thread.id,
                          token: widget.token,
                          api: widget.api,
                          title: thread.title ?? 'Chi tiết',
                        ),
                      ),
                    );
                  },
                ),
              );
            },
          );
        },
      ),
    );
  }
}
