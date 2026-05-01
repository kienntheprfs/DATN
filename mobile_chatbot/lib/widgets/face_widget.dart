import 'package:flutter/material.dart';
import 'package:lottie/lottie.dart' as lottie;

class FaceWidget extends StatefulWidget {
  const FaceWidget({
    super.key,
    required this.isConnected,
    required this.isSpeaking,
  });
  final bool isConnected;
  final bool isSpeaking;

  @override
  State<FaceWidget> createState() => _FaceWidgetState();
}

class _FaceWidgetState extends State<FaceWidget> with TickerProviderStateMixin {
  late final AnimationController _mouthController;
  late final AnimationController _eyeController;
  late final AnimationController _pulseController;

  @override
  void initState() {
    super.initState();
    _mouthController = AnimationController(vsync: this);
    _eyeController = AnimationController(vsync: this);
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 3),
    )..repeat(reverse: true);
  }

  @override
  void didUpdateWidget(FaceWidget oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isSpeaking) {
      if (!_mouthController.isAnimating) {
        _mouthController.repeat();
      }
      if (!_eyeController.isAnimating) _eyeController.repeat();
    } else {
      if (_mouthController.isAnimating) {
        _mouthController.stop();
        _mouthController.value = 0;
      }
      _eyeController.stop();
      _eyeController.value = 0;
    }
  }

  @override
  void dispose() {
    _mouthController.dispose();
    _eyeController.dispose();
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final topPadding = MediaQuery.of(context).padding.top;

    return Container(
      width: double.infinity,
      height: double.infinity,
      color: const Color(0xFFF8FAFC),
      child: SingleChildScrollView(
        physics: const NeverScrollableScrollPhysics(),
        child: Column(
          children: [
            SizedBox(height: topPadding + 80),

            // Hàng Mắt và Má hồng
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                _buildEyeWithBlush(context, false),
                const SizedBox(width: 180),
                _buildEyeWithBlush(context, true),
              ],
            ),
            // Miệng bự
            Transform.translate(
              offset: const Offset(0, -70),
              child: lottie.Lottie.asset(
                'mouth_animation.json',
                width: 300,
                controller: _mouthController,
                onLoaded: (composition) {
                  _mouthController.duration = composition.duration;
                  if (widget.isSpeaking) _mouthController.repeat();
                },
                frameRate: lottie.FrameRate.max,
                filterQuality: FilterQuality.high,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEyeWithBlush(BuildContext context, bool mirrored) {
    return Stack(
      alignment: Alignment.center,
      clipBehavior: Clip.none,
      children: [
        // Glow effect when connected
        if (widget.isConnected)
          AnimatedBuilder(
            animation: _pulseController,
            builder: (context, _) => SizedBox(width: 200, height: 200),
          ),
        AnimatedScale(
          scale: widget.isSpeaking ? 1.08 : 1.0,
          duration: const Duration(milliseconds: 200),
          child: Transform(
            alignment: Alignment.center,
            transform: mirrored
                ? (Matrix4.identity()..scale(-1.0, 1.0, 1.0))
                : Matrix4.identity(),
            child: lottie.Lottie.asset(
              'eye_animation.json',
              width: 180,
              controller: _eyeController,
              onLoaded: (composition) {
                _eyeController.duration = composition.duration;
                if (widget.isSpeaking) _eyeController.repeat();
              },
              frameRate: lottie.FrameRate.max,
              filterQuality: FilterQuality.high,
            ),
          ),
        ),
        Positioned(
          bottom: -20,
          left: mirrored ? null : -40,
          right: mirrored ? -40 : null,
          child: const BlushDot(),
        ),
      ],
    );
  }
}

class BlushDot extends StatelessWidget {
  const BlushDot({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 100,
      height: 100,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: RadialGradient(
          colors: [
            const Color(0xFFFDA4AF).withOpacity(0.5),
            const Color(0xFFFDA4AF).withOpacity(0.0),
          ],
        ),
      ),
    );
  }
}
