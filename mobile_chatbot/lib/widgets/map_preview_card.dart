import 'package:flutter/material.dart';
import '../models/chat_models.dart';
import '../utils/constants.dart';

class MapPreviewCard extends StatefulWidget {
  const MapPreviewCard({
    super.key,
    required this.route,
    this.onExpand,
  });

  final RouteInfo route;
  final VoidCallback? onExpand;

  @override
  State<MapPreviewCard> createState() => _MapPreviewCardState();
}

class _MapPreviewCardState extends State<MapPreviewCard> {
  int _currentStep = 0;
  static const double _mapWidth = 800;
  static const double _mapHeight = 600;

  @override
  Widget build(BuildContext context) {
    final route = widget.route;
    final totalSteps = route.steps.length;

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.grey.shade200),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  AppConstants.primaryColor.withOpacity(0.05),
                  Colors.transparent,
                ],
              ),
              border: Border(bottom: BorderSide(color: Colors.grey.shade100)),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: AppConstants.primaryColor.withOpacity(0.1),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: const Text(
                              'CHỈ ĐƯỜNG',
                                style: TextStyle(
                                fontSize: 9,
                                fontWeight: FontWeight.w900,
                                color: AppConstants.primaryColor,
                                letterSpacing: 0.5,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            route.summary,
                            style: TextStyle(
                              fontSize: 11,
                              color: AppConstants.secondaryColor,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        route.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: widget.onExpand,
                  icon: const Icon(Icons.fullscreen_rounded, size: 20),
                  color: AppConstants.primaryColor,
                  style: IconButton.styleFrom(
                    backgroundColor: AppConstants.primaryColor.withOpacity(0.1),
                  ),
                ),
              ],
            ),
          ),
          // Map Preview with 3D Tilt
          Container(
            height: 200,
            margin: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(15),
              boxShadow: [
                BoxShadow(
                  color: AppConstants.primaryColor.withOpacity(0.1),
                  blurRadius: 10,
                  offset: const Offset(0, 5),
                ),
              ],
            ),
            child: Transform(
              transform: Matrix4.identity()
                ..setEntry(3, 2, 0.001)
                ..rotateX(-0.2), // Reduced tilt for better visibility
              alignment: FractionalOffset.center,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    final scale = constraints.maxWidth / _mapWidth;
                    return Stack(
                      children: [
                        Image.network(
                          AppConstants.getFullImageUrl(route.map.imageUrl),
                          width: constraints.maxWidth,
                          height: constraints.maxHeight,
                          fit: BoxFit.fill,
                        ),
                        CustomPaint(
                          size: Size(constraints.maxWidth, constraints.maxHeight),
                          painter: _PathPainter(
                            path: route.path,
                            scale: scale,
                            color: AppConstants.primaryColor,
                          ),
                        ),
                        _buildNode(route.path.first, scale, Colors.green),
                        _buildNode(route.path.last, scale, Colors.red),
                        // Highlight current step point if available
                        if (_currentStep < route.path.length)
                          _buildNode(route.path[_currentStep], scale, Colors.blue, isCurrent: true),
                      ],
                    );
                  },
                ),
              ),
            ),
          ),

          // Steps List
          Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'HƯỚNG DẪN CHI TIẾT',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w900,
                        color: AppConstants.secondaryColor.withOpacity(0.6),
                        letterSpacing: 1,
                      ),
                    ),
                    Row(
                      children: [
                        _NavButton(
                          icon: Icons.chevron_left_rounded,
                          onPressed: _currentStep > 0 ? () => setState(() => _currentStep--) : null,
                        ),
                        const SizedBox(width: 8),
                        _NavButton(
                          icon: Icons.chevron_right_rounded,
                          onPressed: _currentStep < totalSteps - 1 ? () => setState(() => _currentStep++) : null,
                        ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                SizedBox(
                  height: 120, // Small fixed height to fit screen
                  child: ListView.builder(
                    padding: EdgeInsets.zero,
                    itemCount: totalSteps,
                    itemBuilder: (context, index) {
                      final isActive = index == _currentStep;
                      return AnimatedContainer(
                        duration: const Duration(milliseconds: 300),
                        margin: const EdgeInsets.only(bottom: 8),
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: isActive ? AppConstants.primaryColor.withOpacity(0.05) : Colors.transparent,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: isActive ? AppConstants.primaryColor.withOpacity(0.2) : Colors.transparent,
                          ),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 24,
                              height: 24,
                              decoration: BoxDecoration(
                                color: isActive ? AppConstants.primaryColor : Colors.grey.shade200,
                                shape: BoxShape.circle,
                              ),
                              child: Center(
                                child: Text(
                                  '${index + 1}',
                                  style: TextStyle(
                                    color: isActive ? Colors.white : Colors.grey.shade600,
                                    fontSize: 10,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                route.steps[index],
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: isActive ? FontWeight.bold : FontWeight.normal,
                                  color: isActive ? Colors.black87 : Colors.grey.shade600,
                                ),
                              ),
                            ),
                            if (isActive)
                              const Icon(Icons.check_circle_rounded, color: AppConstants.primaryColor, size: 16),
                          ],
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNode(Offset pos, double scale, Color color, {bool isCurrent = false}) {
    final double markerSize = isCurrent ? 18.0 : 12.0;
    return Positioned(
      left: (pos.dx * scale) - (markerSize / 2),
      top: (pos.dy * scale) - (markerSize / 2),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        width: markerSize,
        height: markerSize,
        decoration: BoxDecoration(
          color: color,
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 2),
          boxShadow: [
            BoxShadow(
              color: color.withOpacity(0.4),
              blurRadius: isCurrent ? 8 : 4,
              spreadRadius: isCurrent ? 4 : 2,
            ),
          ],
        ),
        child: isCurrent ? const Center(child: Icon(Icons.person, color: Colors.white, size: 10)) : null,
      ),
    );
  }
}

class _PathPainter extends CustomPainter {
  _PathPainter({
    required this.path,
    required this.scale,
    required this.color,
  });

  final List<Offset> path;
  final double scale;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    if (path.length < 2) return;

    final paint = Paint()
      ..color = color.withOpacity(0.8)
      ..strokeWidth = 4.0
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;

    final drawingPath = Path();
    drawingPath.moveTo(path[0].dx * scale, path[0].dy * scale);

    for (var i = 1; i < path.length; i++) {
      drawingPath.lineTo(path[i].dx * scale, path[i].dy * scale);
    }

    // Add a subtle glow/shadow to the path
    canvas.drawPath(
      drawingPath,
      Paint()
        ..color = color.withOpacity(0.2)
        ..strokeWidth = 8.0
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..style = PaintingStyle.stroke
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3),
    );

    canvas.drawPath(drawingPath, paint);
  }

  @override
  bool shouldRepaint(covariant _PathPainter oldDelegate) =>
      oldDelegate.path != path || oldDelegate.scale != scale;
}

class _NavButton extends StatelessWidget {
  const _NavButton({required this.icon, this.onPressed});
  final IconData icon;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      onPressed: onPressed,
      icon: Icon(icon),
      iconSize: 20,
      constraints: const BoxConstraints.tightFor(width: 36, height: 36),
      padding: EdgeInsets.zero,
      style: IconButton.styleFrom(
        backgroundColor: Colors.grey.shade50,
        disabledBackgroundColor: Colors.transparent,
        side: BorderSide(color: Colors.grey.shade200),
        shape: const CircleBorder(),
      ),
    );
  }
}
