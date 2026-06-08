import 'package:flutter/material.dart';
import '../models/chat_models.dart';
import '../utils/constants.dart';

class SettingsDialog extends StatefulWidget {
  const SettingsDialog({
    super.key,
    required this.agents,
    required this.selectedAgent,
    required this.onAgentChanged,
    required this.onAuthPressed,
    required this.isLoggedIn,
    required this.isVoiceConnected,
  });

  final List<AgentInfo> agents;
  final String selectedAgent;
  final ValueChanged<String> onAgentChanged;
  final VoidCallback onAuthPressed;
  final bool isLoggedIn;
  final bool isVoiceConnected;

  @override
  State<SettingsDialog> createState() => _SettingsDialogState();
}

class _SettingsDialogState extends State<SettingsDialog> {
  late String _tempSelectedAgent;

  @override
  void initState() {
    super.initState();
    _tempSelectedAgent = widget.selectedAgent;
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Icon(Icons.settings_outlined, color: AppConstants.primaryColor),
                SizedBox(width: 12),
                Text(
                  'Cài đặt',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800),
                ),
              ],
            ),
            const SizedBox(height: 24),
            const Text(
              'Tài khoản',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () {
                  Navigator.pop(context);
                  widget.onAuthPressed();
                },
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                icon: Icon(
                  widget.isLoggedIn
                      ? Icons.switch_account_outlined
                      : Icons.login_rounded,
                ),
                label: Text(
                  widget.isLoggedIn ? 'Đổi tài khoản' : 'Đăng nhập / Đăng ký',
                ),
              ),
            ),
            const SizedBox(height: 24),
            const Text(
              'Chọn Agent',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(
                color: Colors.grey.shade100,
                borderRadius: BorderRadius.circular(12),
              ),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: _tempSelectedAgent,
                  isExpanded: true,
                  icon: const Icon(Icons.keyboard_arrow_down_rounded),
                  items: widget.agents
                      .map(
                        (a) => DropdownMenuItem<String>(
                          value: a.key,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                a.displayName,
                                style: const TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              if (a.description != null && a.description!.isNotEmpty)
                                Text(
                                  a.description!,
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: Colors.grey.shade600,
                                  ),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                            ],
                          ),
                        ),
                      )
                      .toList(),
                  onChanged: widget.isVoiceConnected
                      ? null
                      : (value) {
                          if (value == null) return;
                          setState(() => _tempSelectedAgent = value);
                          widget.onAgentChanged(value);
                        },
                ),
              ),
            ),
            if (widget.isVoiceConnected)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  '* Ngắt kết nối để đổi agent',
                  style: TextStyle(fontSize: 11, color: Colors.orange.shade700),
                ),
              ),
            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              height: 50,
              child: FilledButton(
                onPressed: () => Navigator.pop(context),
                style: FilledButton.styleFrom(
                  backgroundColor: AppConstants.primaryColor,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text('Đóng'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
