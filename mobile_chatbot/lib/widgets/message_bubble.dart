import 'package:flutter/material.dart';
import '../models/chat_models.dart';
import '../services/api_client.dart';
import '../utils/constants.dart';

class MessageBubble extends StatefulWidget {
  const MessageBubble({
    super.key,
    required this.message,
    required this.api,
    required this.onError,
    required this.agentId,
    required this.threadId,
    required this.token,
    this.onOpenRoute,
  });

  final ChatMessage message;
  final ApiClient api;
  final void Function(String) onError;
  final String agentId;
  final String? threadId;
  final String? token;
  final VoidCallback? onOpenRoute;

  @override
  State<MessageBubble> createState() => _MessageBubbleState();
}

class _MessageBubbleState extends State<MessageBubble> {
  Rating? rating;

  Future<void> _submitRating(Rating value) async {
    if (widget.token == null ||
        widget.threadId == null ||
        widget.message.runId == null) {
      widget.onError('Cần đăng nhập để đánh giá');
      return;
    }
    try {
      await widget.api.submitRating(
        token: widget.token!,
        runId: widget.message.runId!,
        threadId: widget.threadId!,
        agentId: widget.agentId,
        rating: value,
      );
      setState(() => rating = value);
    } catch (e) {
      widget.onError('Gửi rating lỗi: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final isUser = widget.message.role == Role.user;
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        constraints: const BoxConstraints(maxWidth: 320),
        decoration: BoxDecoration(
          color: isUser ? AppConstants.primaryColor : Colors.white,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(20),
            topRight: const Radius.circular(20),
            bottomLeft: Radius.circular(isUser ? 20 : 4),
            bottomRight: Radius.circular(isUser ? 4 : 20),
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.05),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              isUser ? 'Bạn' : 'Chatbot',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: isUser ? Colors.white70 : AppConstants.secondaryColor,
                letterSpacing: 0.5,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              widget.message.text,
              style: TextStyle(
                color: isUser ? Colors.white : Colors.black87,
                fontSize: 15,
                height: 1.4,
              ),
            ),
            if (widget.message.route != null) ...[
              const SizedBox(height: 12),
              ElevatedButton.icon(
                onPressed: widget.onOpenRoute,
                style: ElevatedButton.styleFrom(
                  backgroundColor: isUser ? Colors.white24 : Colors.blue.shade50,
                  foregroundColor: isUser ? Colors.white : Colors.blue.shade700,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                icon: const Icon(Icons.map_outlined, size: 18),
                label: const Text('Xem chỉ đường'),
              ),
            ],
            if (!isUser) ...[
              const SizedBox(height: 12),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _RatingButton(
                    onPressed: () => _submitRating(Rating.like),
                    icon: Icons.thumb_up_rounded,
                    isActive: rating == Rating.like,
                    activeColor: Colors.green,
                  ),
                  const SizedBox(width: 8),
                  _RatingButton(
                    onPressed: () => _submitRating(Rating.dislike),
                    icon: Icons.thumb_down_rounded,
                    isActive: rating == Rating.dislike,
                    activeColor: Colors.redAccent,
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _RatingButton extends StatelessWidget {
  const _RatingButton({
    required this.onPressed,
    required this.icon,
    required this.isActive,
    required this.activeColor,
  });

  final VoidCallback onPressed;
  final IconData icon;
  final bool isActive;
  final Color activeColor;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onPressed,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.all(6),
        decoration: BoxDecoration(
          color: isActive ? activeColor.withOpacity(0.1) : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: isActive ? activeColor : Colors.grey.shade200,
          ),
        ),
        child: Icon(
          icon,
          size: 16,
          color: isActive ? activeColor : Colors.grey.shade400,
        ),
      ),
    );
  }
}
