import 'dart:convert';
import 'package:flutter/material.dart';
import '../utils/constants.dart';

class ConfirmationOptionsDialog extends StatefulWidget {
  const ConfirmationOptionsDialog({
    super.key,
    required this.confirmationJson,
    required this.onConfirm,
  });

  final String confirmationJson;
  final Function(String) onConfirm;

  @override
  State<ConfirmationOptionsDialog> createState() => _ConfirmationOptionsDialogState();
}

class _ConfirmationOptionsDialogState extends State<ConfirmationOptionsDialog> {
  String? _selectedStart;
  String? _selectedEnd;
  List<String> _startOptions = [];
  List<String> _endOptions = [];
  String _startName = '';
  String _endName = '';
  bool _needsStart = false;
  bool _needsEnd = false;

  String _cleanDisplayId(String text) {
    return text.replaceAll(RegExp(r'\s*\[ID:\s*\d+\]', caseSensitive: false), '').trim();
  }

  @override
  void initState() {
    super.initState();
    try {
      final data = jsonDecode(widget.confirmationJson) as Map<String, dynamic>;
      _startName = data['start_name']?.toString() ?? '';
      _endName = data['end_name']?.toString() ?? '';
      _startOptions = (data['start_options'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          [];
      _endOptions = (data['end_options'] as List<dynamic>?)
              ?.map((e) => e.toString())
              .toList() ??
          [];
      _needsStart = _startOptions.length > 1;
      _needsEnd = _endOptions.length > 1;

      if (!_needsStart) _selectedStart = _startOptions.isNotEmpty ? _startOptions.first : _startName;
      if (!_needsEnd) _selectedEnd = _endOptions.isNotEmpty ? _endOptions.first : _endName;
    } catch (_) {}
  }

  bool get _canConfirm => (!_needsStart || _selectedStart != null) && (!_needsEnd || _selectedEnd != null);

  void _handleConfirm() {
    if (!_canConfirm) return;

    String message;
    if (_needsStart && _needsEnd) {
      message = 'Tôi muốn đi từ $_selectedStart đến $_selectedEnd';
    } else if (_needsStart && _selectedStart != null) {
      message = 'Chọn điểm bắt đầu là $_selectedStart';
    } else if (_needsEnd && _selectedEnd != null) {
      message = 'Chọn điểm đến là $_selectedEnd';
    } else {
      message = 'Xác nhận lộ trình từ $_selectedStart đến $_selectedEnd';
    }

    widget.onConfirm(message);
    Navigator.of(context, rootNavigator: true).pop();
  }

  void _handleReportMissing() {
    String message;
    if (_needsStart && _needsEnd) {
      message = 'Không tìm thấy điểm bắt đầu hoặc điểm đến phù hợp trong danh sách. Vui lòng báo cáo vấn đề này để quản trị viên kiểm tra.';
    } else if (_needsStart) {
      message = 'Không tìm thấy điểm bắt đầu phù hợp trong danh sách. Vui lòng báo cáo vấn đề này để quản trị viên kiểm tra.';
    } else if (_needsEnd) {
      message = 'Không tìm thấy điểm đến phù hợp trong danh sách. Vui lòng báo cáo vấn đề này để quản trị viên kiểm tra.';
    } else {
      message = 'Không có địa điểm nào phù hợp. Vui lòng báo cáo vấn đề này để quản trị viên kiểm tra.';
    }
    widget.onConfirm(message);
    Navigator.of(context, rootNavigator: true).pop();
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
      insetPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 40),
      child: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header
              Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: AppConstants.primaryColor.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: const Icon(
                      Icons.navigation_rounded,
                      color: AppConstants.primaryColor,
                      size: 22,
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'XÁC NHẬN ĐỊA ĐIỂM',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w900,
                            letterSpacing: -0.3,
                          ),
                        ),
                        Text(
                          'Vui lòng chọn chính xác vị trí bạn muốn',
                          style: TextStyle(
                            fontSize: 12,
                            color: AppConstants.secondaryColor,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // Start options
              if (_needsStart) ...[
                Row(
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: const BoxDecoration(
                        color: Colors.blue,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'ĐIỂM XUẤT PHÁT: "${_cleanDisplayId(_startName)}"',
                      style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w900,
                        color: Colors.blue,
                        letterSpacing: 1,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: _startOptions.map((opt) {
                    final isSelected = _selectedStart == opt;
                    return GestureDetector(
                      onTap: () => setState(() => _selectedStart = opt),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                        decoration: BoxDecoration(
                          color: isSelected ? AppConstants.primaryColor : Colors.white,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(
                            color: isSelected ? AppConstants.primaryColor : Colors.grey.shade200,
                          ),
                          boxShadow: isSelected
                              ? [
                                  BoxShadow(
                                    color: AppConstants.primaryColor.withOpacity(0.3),
                                    blurRadius: 8,
                                    offset: const Offset(0, 2),
                                  ),
                                ]
                              : null,
                        ),
                        child: Text(
                          _cleanDisplayId(opt),
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: isSelected ? Colors.white : Colors.black87,
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 20),
              ],

              // End options
              if (_needsEnd) ...[
                Row(
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: const BoxDecoration(
                        color: Colors.green,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'ĐIỂM ĐẾN: "${_cleanDisplayId(_endName)}"',
                      style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w900,
                        color: Colors.green,
                        letterSpacing: 1,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: _endOptions.map((opt) {
                    final isSelected = _selectedEnd == opt;
                    return GestureDetector(
                      onTap: () => setState(() => _selectedEnd = opt),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                        decoration: BoxDecoration(
                          color: isSelected ? AppConstants.primaryColor : Colors.white,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(
                            color: isSelected ? AppConstants.primaryColor : Colors.grey.shade200,
                          ),
                          boxShadow: isSelected
                              ? [
                                  BoxShadow(
                                    color: AppConstants.primaryColor.withOpacity(0.3),
                                    blurRadius: 8,
                                    offset: const Offset(0, 2),
                                  ),
                                ]
                              : null,
                        ),
                        child: Text(
                          _cleanDisplayId(opt),
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: isSelected ? Colors.white : Colors.black87,
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 20),
              ],

              // Confirm button
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _canConfirm ? _handleConfirm : null,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppConstants.primaryColor,
                    foregroundColor: Colors.white,
                    disabledBackgroundColor: Colors.grey.shade200,
                    disabledForegroundColor: Colors.grey.shade400,
                    minimumSize: const Size(double.infinity, 52),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                    elevation: 4,
                    shadowColor: AppConstants.primaryColor.withOpacity(0.3),
                  ),
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.check_circle_outline, size: 20),
                      SizedBox(width: 10),
                      Text(
                        'XÁC NHẬN LỘ TRÌNH',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 1,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),

              // Report missing button
              SizedBox(
                width: double.infinity,
                child: TextButton(
                  onPressed: _handleReportMissing,
                  style: TextButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.warning_amber_rounded, size: 14, color: Colors.orange.shade400),
                      const SizedBox(width: 6),
                      Text(
                        'Không có trong các lựa chọn - Báo cáo với quản trị viên',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: Colors.orange.shade400,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}