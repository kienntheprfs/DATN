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
  int _activeFloorIdx = 0;
  static const double _mapWidth = 800;

  @override
  Widget build(BuildContext context) {
    final route = widget.route;
    final totalSteps = route.steps.length;
    final estimatedMinutes = route.totalDistanceM > 0
        ? (route.totalDistanceM / 80).ceil()
        : null;
    final hasMultiFloor = route.routeMaps != null && route.routeMaps!.length > 1;
    final activeInstruction = route.instructions != null && _currentStep < route.instructions!.length
        ? route.instructions![_currentStep]
        : null;
    final currentCoord = activeInstruction?.coordinate;

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
          _buildHeader(route, estimatedMinutes, hasMultiFloor),
          _buildMap(route, currentCoord),
          _buildStepControl(route, _currentStep, totalSteps),
          if (hasMultiFloor) _buildFloorTabs(route),
        ],
      ),
    );
  }

  Widget _buildHeader(RouteInfo route, int? estimatedMinutes, bool hasMultiFloor) {
    return Container(
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
                      '${route.totalDistanceM.round()}m',
                      style: TextStyle(
                        fontSize: 11,
                        color: AppConstants.secondaryColor,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (estimatedMinutes != null) ...[
                      const SizedBox(width: 4),
                      Text(
                        '• $estimatedMinutes phút',
                        style: TextStyle(
                          fontSize: 11,
                          color: AppConstants.secondaryColor,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                    if (hasMultiFloor) ...[
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                        decoration: BoxDecoration(
                          color: Colors.amber.shade50,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          '${widget.route.routeMaps!.length} tầng',
                          style: TextStyle(
                            fontSize: 8,
                            fontWeight: FontWeight.w800,
                            color: Colors.amber.shade700,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 4),
                if (route.startName != null || route.endName != null)
                  Text(
                    '${route.startName ?? ''} → ${route.endName ?? ''}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                    ),
                  )
                else
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
          if (widget.onExpand != null)
            IconButton(
              onPressed: widget.onExpand,
              icon: const Icon(Icons.fullscreen_rounded, size: 20),
              color: AppConstants.primaryColor,
              style: IconButton.styleFrom(
                backgroundColor: AppConstants.primaryColor.withOpacity(0.1),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildMap(RouteInfo route, Offset? currentCoord) {
    return Container(
      height: 200,
      color: Colors.grey.shade50,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final scale = constraints.maxWidth / _mapWidth;
          return Stack(
            children: [
              if (route.map.imageUrl.isNotEmpty)
                Positioned.fill(
                  child: Image.network(
                    AppConstants.getFullImageUrl(route.map.imageUrl),
                    fit: BoxFit.fill,
                    errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                  ),
                ),
              CustomPaint(
                size: Size(constraints.maxWidth, constraints.maxHeight),
                painter: _PathPainter(
                  path: route.path,
                  scale: scale,
                  color: AppConstants.primaryColor,
                ),
              ),
              if (route.path.isNotEmpty) ...[
                _buildNode(route.path.first, scale, Colors.green),
                _buildNode(route.path.last, scale, Colors.red),
              ],
              if (currentCoord != null)
                _buildCurrentNode(currentCoord, scale),
            ],
          );
        },
      ),
    );
  }

  Widget _buildStepControl(RouteInfo route, int currentStep, int totalSteps) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: Colors.grey.shade100)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Bước ${currentStep + 1} / $totalSteps',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w900,
                    color: AppConstants.secondaryColor.withOpacity(0.6),
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  currentStep < route.steps.length ? route.steps[currentStep] : '',
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Row(
            children: [
              _NavButton(
                icon: Icons.chevron_left_rounded,
                onPressed: currentStep > 0
                    ? () => setState(() {
                          _currentStep--;
                          _updateActiveFloor(route);
                        })
                    : null,
              ),
              const SizedBox(width: 6),
              _NavButton(
                icon: Icons.chevron_right_rounded,
                onPressed: currentStep < totalSteps - 1
                    ? () => setState(() {
                          _currentStep++;
                          _updateActiveFloor(route);
                        })
                    : null,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildFloorTabs(RouteInfo route) {
    final routeMaps = route.routeMaps!;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.grey.shade50,
        border: Border(top: BorderSide(color: Colors.grey.shade100)),
      ),
      child: Row(
        children: [
          const Icon(Icons.layers_rounded, size: 14, color: Colors.grey),
          const SizedBox(width: 6),
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: routeMaps.asMap().entries.map((entry) {
                  final idx = entry.key;
                  final rm = entry.value;
                  final isActive = idx == _activeFloorIdx;
                  return Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: GestureDetector(
                      onTap: () => setState(() => _activeFloorIdx = idx),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                        decoration: BoxDecoration(
                          color: isActive ? AppConstants.primaryColor : Colors.white,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(
                            color: isActive ? AppConstants.primaryColor : Colors.grey.shade200,
                          ),
                        ),
                        child: Text(
                          rm.map.floorLevel == null ? 'Campus' : 'Tầng ${rm.map.floorLevel}',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                            color: isActive ? Colors.white : AppConstants.secondaryColor,
                          ),
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _updateActiveFloor(RouteInfo route) {
    if (route.routeMaps == null || route.routeMaps!.isEmpty) return;
    final instruction = route.instructions != null && _currentStep < route.instructions!.length
        ? route.instructions![_currentStep]
        : null;
    if (instruction?.coordinate == null) return;
    final coord = instruction!.coordinate!;
    for (var i = 0; i < route.routeMaps!.length; i++) {
      final nodes = route.routeMaps![i].nodes;
      final match = nodes.any((n) =>
          (n.x - coord.dx).abs() < 5 && (n.y - coord.dy).abs() < 5);
      if (match) {
        _activeFloorIdx = i;
        break;
      }
    }
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
          boxShadow: [
            BoxShadow(
              color: color.withOpacity(0.3),
              blurRadius: 4,
              spreadRadius: 1,
            ),
          ],
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
          border: Border.all(color: Colors.white, width: 2.5),
          boxShadow: [
            BoxShadow(
              color: Colors.blue.withOpacity(0.4),
              blurRadius: 8,
              spreadRadius: 2,
            ),
          ],
        ),
        child: const Center(child: Icon(Icons.person, color: Colors.white, size: 10)),
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
      ..strokeWidth = 5.0
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke;

    final glowPaint = Paint()
      ..color = color.withOpacity(0.15)
      ..strokeWidth = 10.0
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4);

    final drawingPath = Path();
    drawingPath.moveTo(path[0].dx * scale, path[0].dy * scale);
    for (var i = 1; i < path.length; i++) {
      drawingPath.lineTo(path[i].dx * scale, path[i].dy * scale);
    }

    canvas.drawPath(drawingPath, glowPaint);
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
      iconSize: 18,
      constraints: const BoxConstraints.tightFor(width: 32, height: 32),
      padding: EdgeInsets.zero,
      style: IconButton.styleFrom(
        backgroundColor: Colors.grey.shade50,
        disabledBackgroundColor: Colors.transparent,
        side: BorderSide(color: Colors.grey.shade200),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
        ),
      ),
    );
  }
}
