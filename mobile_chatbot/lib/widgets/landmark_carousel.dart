import 'dart:convert';
import 'package:flutter/material.dart';
import '../models/chat_models.dart';
import '../utils/constants.dart';

class LandmarkCarouselDialog extends StatefulWidget {
  const LandmarkCarouselDialog({
    super.key,
    required this.landmarks,
    required this.onConfirm,
    this.mode = 'location',
  });

  final List<Landmark> landmarks;
  final Function(Landmark) onConfirm;
  final String mode;

  @override
  State<LandmarkCarouselDialog> createState() => _LandmarkCarouselDialogState();
}

class _LandmarkCarouselDialogState extends State<LandmarkCarouselDialog> {
  final PageController _pageController = PageController();
  int _currentIndex = 0;

  String _formatDescription(String descStr) {
    if (descStr.isEmpty) return '';
    if (descStr.startsWith('{') && descStr.endsWith('}')) {
      try {
        final parsed = jsonDecode(descStr) as Map<String, dynamic>;
        final List<String> parts = [];
        if (parsed['landmarks'] != null) {
          parts.add('Đặc điểm: ${parsed['landmarks']}');
        }
        if (parsed['colors'] != null) {
          parts.add('Màu sắc: ${parsed['colors']}');
        }
        if (parsed['proximity'] != null) {
          parts.add('Vị trí: ${parsed['proximity']}');
        }
        if (parsed['signs'] != null) {
          parts.add('Biển hiệu: ${parsed['signs']}');
        }
        return parts.join(' • ');
      } catch (_) {
        return descStr;
      }
    }
    return descStr;
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final current = widget.landmarks[_currentIndex];
    final isDestinationMode = widget.mode == 'destination';
    final confirmText = isDestinationMode ? 'Chọn điểm đến này' : 'Tôi đang ở đây';

    return Dialog(
      backgroundColor: Colors.transparent,
      elevation: 0,
      insetPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 40),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            decoration: BoxDecoration(
              color: const Color(0xFF0F172A),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: Colors.white.withOpacity(0.1)),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.5),
                  blurRadius: 40,
                  spreadRadius: 5,
                ),
              ],
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                SizedBox(
                  height: 300,
                  child: Stack(
                    children: [
                      PageView.builder(
                        controller: _pageController,
                        itemCount: widget.landmarks.length,
                        onPageChanged: (index) => setState(() => _currentIndex = index),
                        itemBuilder: (context, index) {
                          final lm = widget.landmarks[index];
                          if (lm.imageUrl.isNotEmpty) {
                            return Image.network(
                              AppConstants.getFullImageUrl(lm.imageUrl),
                              fit: BoxFit.cover,
                              width: double.infinity,
                              loadingBuilder: (context, child, loadingProgress) {
                                if (loadingProgress == null) return child;
                                return const Center(
                                  child: CircularProgressIndicator(color: Colors.white54),
                                );
                              },
                              errorBuilder: (context, error, stackTrace) => _noImagePlaceholder(),
                            );
                          }
                          return _noImagePlaceholder();
                        },
                      ),
                      // Gradient overlay
                      Positioned.fill(
                        child: Container(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                              colors: [
                                Colors.black.withOpacity(0.6),
                                Colors.transparent,
                                Colors.black.withOpacity(0.85),
                              ],
                            ),
                          ),
                        ),
                      ),
                      // Info overlay
                      Positioned(
                        bottom: 12,
                        left: 16,
                        right: 16,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                             Row(
                              children: [
                                const Icon(Icons.location_on, color: Colors.white, size: 16),
                                const SizedBox(width: 6),
                                Text(
                                  current.type == 'building' ? 'LANDMARK' : 'ĐỊA ĐIỂM',
                                  style: TextStyle(
                                    color: Colors.white.withOpacity(0.9),
                                    fontSize: 10,
                                    fontWeight: FontWeight.w900,
                                    letterSpacing: 1.5,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text(
                              current.name,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            if (current.description.isNotEmpty) ...[
                              const SizedBox(height: 2),
                              Text(
                                '"${_formatDescription(current.description)}"',
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: Colors.white.withOpacity(0.7),
                                  fontSize: 12,
                                  fontStyle: FontStyle.italic,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                      // Navigation arrows
                      if (widget.landmarks.length > 1) ...[
                        Positioned(
                          left: 8,
                          top: 0,
                          bottom: 0,
                          child: Center(
                            child: _RoundNavButton(
                              icon: Icons.chevron_left_rounded,
                              onPressed: () {
                                _pageController.previousPage(
                                  duration: const Duration(milliseconds: 300),
                                  curve: Curves.easeInOut,
                                );
                              },
                            ),
                          ),
                        ),
                        Positioned(
                          right: 8,
                          top: 0,
                          bottom: 0,
                          child: Center(
                            child: _RoundNavButton(
                              icon: Icons.chevron_right_rounded,
                              onPressed: () {
                                _pageController.nextPage(
                                  duration: const Duration(milliseconds: 300),
                                  curve: Curves.easeInOut,
                                );
                              },
                            ),
                          ),
                        ),
                      ],
                      // Counter
                      Positioned(
                        top: 12,
                        right: 12,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: Colors.black45,
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: Colors.white24),
                          ),
                          child: Text(
                            '${_currentIndex + 1} / ${widget.landmarks.length}',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                // Bottom actions
                Container(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                                        const Color(0xFF0F172A),
                        const Color(0xFF0F172A),
                      ],
                    ),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      SizedBox(
                        width: double.infinity,
                        height: 44,
                        child: ElevatedButton(
                          onPressed: () => widget.onConfirm(current),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppConstants.primaryColor,
                            foregroundColor: Colors.white,
                            elevation: 8,
                            shadowColor: AppConstants.primaryColor.withOpacity(0.4),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14),
                            ),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(Icons.check_circle_outline, size: 18),
                              const SizedBox(width: 8),
                              Text(
                                confirmText.toUpperCase(),
                                style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w900,
                                  letterSpacing: 0.5,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          // Skip button
          const SizedBox(height: 8),
          TextButton(
            onPressed: () => Navigator.pop(context),
            style: TextButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
              backgroundColor: Colors.black26,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(20),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.close_rounded, size: 16, color: Colors.white.withOpacity(0.6)),
                const SizedBox(width: 6),
                Text(
                  'BỎ QUA',
                  style: TextStyle(
                    color: Colors.white.withOpacity(0.6),
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 1,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _noImagePlaceholder() {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.location_on, color: Colors.white38, size: 40),
          SizedBox(height: 8),
          Text(
            'KHÔNG CÓ HÌNH ẢNH',
            style: TextStyle(
              color: Colors.white38,
              fontSize: 10,
              fontWeight: FontWeight.bold,
              letterSpacing: 1,
            ),
          ),
        ],
      ),
    );
  }
}

class _RoundNavButton extends StatelessWidget {
  const _RoundNavButton({required this.icon, required this.onPressed});
  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.black38,
      shape: const CircleBorder(),
      child: InkWell(
        onTap: onPressed,
        customBorder: const CircleBorder(),
        child: Container(
          width: 36,
          height: 36,
          alignment: Alignment.center,
          child: Icon(icon, color: Colors.white, size: 22),
        ),
      ),
    );
  }
}
