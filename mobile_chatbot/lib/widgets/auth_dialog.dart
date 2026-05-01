import 'package:flutter/material.dart';
import '../services/api_client.dart';
import '../utils/constants.dart';

class AuthDialog extends StatefulWidget {
  const AuthDialog({super.key, required this.api});
  final ApiClient api;

  @override
  State<AuthDialog> createState() => _AuthDialogState();
}

class _AuthDialogState extends State<AuthDialog> {
  bool isRegister = false;
  bool loading = false;
  final email = TextEditingController();
  final password = TextEditingController();
  final fullname = TextEditingController();

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    fullname.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (email.text.isEmpty || password.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Vui lòng điền đầy đủ thông tin')),
      );
      return;
    }

    setState(() => loading = true);
    try {
      if (isRegister) {
        await widget.api.register(
          email: email.text.trim(),
          password: password.text,
          fullname: fullname.text.trim(),
        );
      }
      final token = await widget.api.login(
        email: email.text.trim(),
        password: password.text,
      );
      final userId = await widget.api.fetchMyUserId(token: token);
      if (mounted) Navigator.pop(context, (token, userId));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Lỗi: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              isRegister ? 'Tạo tài khoản' : 'Chào mừng trở lại',
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 8),
            Text(
              isRegister ? 'Tham gia cùng chúng tôi ngay!' : 'Đăng nhập để tiếp tục',
              style: TextStyle(color: Colors.grey.shade600),
            ),
            const SizedBox(height: 24),
            ToggleButtons(
              borderRadius: BorderRadius.circular(12),
              selectedColor: Colors.white,
              fillColor: AppConstants.primaryColor,
              isSelected: [!isRegister, isRegister],
              onPressed: (index) {
                setState(() => isRegister = index == 1);
              },
              children: const [
                Padding(
                  padding: EdgeInsets.symmetric(horizontal: 20),
                  child: Text('Đăng nhập'),
                ),
                Padding(
                  padding: EdgeInsets.symmetric(horizontal: 20),
                  child: Text('Đăng ký'),
                ),
              ],
            ),
            const SizedBox(height: 24),
            if (isRegister) ...[
              _TextField(
                controller: fullname,
                label: 'Họ và tên',
                icon: Icons.person_outline,
              ),
              const SizedBox(height: 16),
            ],
            _TextField(
              controller: email,
              label: 'Email',
              icon: Icons.email_outlined,
              keyboardType: TextInputType.emailAddress,
            ),
            const SizedBox(height: 16),
            _TextField(
              controller: password,
              label: 'Mật khẩu',
              icon: Icons.lock_outline,
              obscureText: true,
            ),
            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              height: 54,
              child: ElevatedButton(
                onPressed: loading ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppConstants.primaryColor,
                  foregroundColor: Colors.white,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
                child: loading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: Colors.white,
                        ),
                      )
                    : Text(
                        isRegister ? 'Đăng ký' : 'Đăng nhập',
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
              ),
            ),
            const SizedBox(height: 16),
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: Text(
                'Hủy bỏ',
                style: TextStyle(color: Colors.grey.shade500),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TextField extends StatelessWidget {
  const _TextField({
    required this.controller,
    required this.label,
    required this.icon,
    this.obscureText = false,
    this.keyboardType,
  });

  final TextEditingController controller;
  final String label;
  final IconData icon;
  final bool obscureText;
  final TextInputType? keyboardType;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      obscureText: obscureText,
      keyboardType: keyboardType,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: Icon(icon, size: 20),
        filled: true,
        fillColor: Colors.grey.shade100,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: AppConstants.primaryColor, width: 1.5),
        ),
      ),
    );
  }
}
