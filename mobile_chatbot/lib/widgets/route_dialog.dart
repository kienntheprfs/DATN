import 'package:flutter/material.dart';
import '../models/chat_models.dart';
import '../utils/constants.dart';

class RouteDialog extends StatefulWidget {
  const RouteDialog({super.key, required this.route});
  final RouteInfo route;

  @override
  State<RouteDialog> createState() => _RouteDialogState();
}

class _RouteDialogState extends State<RouteDialog> {
  int _currentStep = 0;
  static const double _mapWidth = 800;

  @override
  Widget build(BuildContext context) {
    final route = widget.route;
    final totalSteps = route.steps.length;

    return Dialog(
      backgroundColor: Colors.white,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 20, 16, 12),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          route.title,
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w900,
                            letterSpacing: -0.5,
                          ),
                        ),
                        Text(
                          'Khoảng cách: ${route.summary}',
                          style: TextStyle(
                            color: AppConstants.secondaryColor,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close_rounded, size: 20),
                    style: IconButton.styleFrom(
                      backgroundColor: Colors.grey.shade100,
                    ),
                  ),
                ],
              ),
            ),

            // Map Area
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Container(
                height: 220, // Constrain height for mobile
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.05),
                      blurRadius: 10,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(20),
                  child: InteractiveViewer(
                    maxScale: 3.0,
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
                              painter: _RoutePainter(
                                path: route.path,
                                scale: scale,
                                color: AppConstants.primaryColor,
                              ),
                            ),
                            _buildNode(route.path.first, scale, Colors.green),
                            _buildNode(route.path.last, scale, Colors.red),
                            // Current location marker
                            if (_currentStep < route.path.length)
                              _buildCurrentNode(route.path[_currentStep], scale),
                          ],
                        );
                      },
                    ),
                  ),
                ),
              ),
            ),

            // Steps Timeline
            Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'CÁC BƯỚC DI CHUYỂN',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w900,
                          color: AppConstants.secondaryColor.withOpacity(0.6),
                          letterSpacing: 1.2,
                        ),
                      ),
                      Text(
                        '${_currentStep + 1} / $totalSteps',
                        style: const TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                          color: AppConstants.primaryColor,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    height: 140, // Fixed height for steps scroll
                    child: ListView.builder(
                      padding: EdgeInsets.zero,
                      itemCount: totalSteps,
                      itemBuilder: (context, index) {
                        final isActive = index == _currentStep;
                        return IntrinsicHeight(
                          child: Row(
                            children: [
                              Column(
                                children: [
                                  Container(
                                    width: 10,
                                    height: 10,
                                    decoration: BoxDecoration(
                                      color: isActive ? AppConstants.primaryColor : Colors.grey.shade300,
                                      shape: BoxShape.circle,
                                    ),
                                  ),
                                  if (index < totalSteps - 1)
                                    Expanded(
                                      child: Container(
                                        width: 2,
                                        color: Colors.grey.shade100,
                                      ),
                                    ),
                                ],
                              ),
                              const SizedBox(width: 16),
                              Expanded(
                                child: GestureDetector(
                                  onTap: () => setState(() => _currentStep = index),
                                  child: Container(
                                    margin: const EdgeInsets.only(bottom: 12),
                                    padding: const EdgeInsets.all(12),
                                    decoration: BoxDecoration(
                                      color: isActive ? AppConstants.primaryColor.withOpacity(0.05) : Colors.transparent,
                                      borderRadius: BorderRadius.circular(12),
                                      border: Border.all(
                                        color: isActive ? AppConstants.primaryColor.withOpacity(0.1) : Colors.transparent,
                                      ),
                                    ),
                                    child: Text(
                                      route.steps[index],
                                      style: TextStyle(
                                        fontSize: 13,
                                        fontWeight: isActive ? FontWeight.bold : FontWeight.normal,
                                        color: isActive ? Colors.black87 : Colors.grey.shade600,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
            
            // Footer Controls
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
              child: Row(
                children: [
                  Expanded(
                    child: ElevatedButton(
                      onPressed: _currentStep > 0 ? () => setState(() => _currentStep--) : null,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.grey.shade50,
                        foregroundColor: Colors.black87,
                        elevation: 0,
                        minimumSize: const Size(0, 44),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      child: const Text('TRƯỚC', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: _currentStep < totalSteps - 1 ? () => setState(() => _currentStep++) : null,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppConstants.primaryColor,
                        foregroundColor: Colors.white,
                        elevation: 0,
                        minimumSize: const Size(0, 44),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      child: const Text('TIẾP THEO', style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildNode(Offset pos, double scale, Color color) {
    return Positioned(
      left: pos.dx * scale - 6,
      top: pos.dy * scale - 6,
      child: Container(
        width: 12,
        height: 12,
        decoration: BoxDecoration(
          color: color,
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 2),
        ),
      ),
    );
  }

  Widget _buildCurrentNode(Offset pos, double scale) {
    return Positioned(
      left: pos.dx * scale - 9,
      top: pos.dy * scale - 9,
      child: Container(
        width: 18,
        height: 18,
        decoration: BoxDecoration(
          color: Colors.blue,
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white, width: 2),
          boxShadow: [
            BoxShadow(
              color: Colors.blue.withOpacity(0.3),
              blurRadius: 6,
              spreadRadius: 2,
            ),
          ],
        ),
        child: const Center(child: Icon(Icons.person, color: Colors.white, size: 10)),
      ),
    );
  }
}

class _NavBtn extends StatelessWidget {
  const _NavBtn({required this.icon, this.onPressed});
  final IconData icon;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      onPressed: onPressed,
      icon: Icon(icon, size: 24),
      style: IconButton.styleFrom(
        backgroundColor: Colors.grey.shade100,
        disabledBackgroundColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        side: BorderSide(color: Colors.grey.shade200),
      ),
    );
  }
}

class _RoutePainter extends CustomPainter {
  _RoutePainter({
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
      ..color = color
      ..strokeWidth = 5.0
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;

    final drawingPath = Path();
    drawingPath.moveTo(path[0].dx * scale, path[0].dy * scale);

    for (var i = 1; i < path.length; i++) {
      drawingPath.lineTo(path[i].dx * scale, path[i].dy * scale);
    }

    canvas.drawPath(drawingPath, paint);
  }

  @override
  bool shouldRepaint(covariant _RoutePainter oldDelegate) => true;
}
