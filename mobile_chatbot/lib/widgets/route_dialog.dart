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
  int _activeFloorIdx = 0;
  static const double _refMapWidth = 800;
  static const double _refMapHeight = 600;
  final _transformationController = TransformationController();
  final _mapKey = GlobalKey();
  Size _mapSize = const Size(300, 300);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _updateActiveFloorForStep(0);
      _centerOnCurrentStep();
    });
  }

  @override
  void dispose() {
    _transformationController.dispose();
    super.dispose();
  }

  void _centerOnCoord(Offset coord) {
    if (_mapSize.width <= 0 || _mapSize.height <= 0) return;
    const S = 1.3;
    final dx = _mapSize.width / 2 - coord.dx * S;
    final dy = _mapSize.height / 2 - coord.dy * S;
    _transformationController.value = Matrix4.identity()
      ..translate(dx, dy)
      ..scale(S);
  }

  void _centerOnCurrentStep() {
    final instructions = widget.route.instructions ?? [];
    if (_currentStep < instructions.length) {
      final coord = instructions[_currentStep].coordinate;
      if (coord != null) _centerOnCoord(coord);
    }
  }

  String? get _activeMapImageUrl {
    final routeMaps = widget.route.routeMaps;
    if (routeMaps != null && _activeFloorIdx < routeMaps.length) {
      return routeMaps[_activeFloorIdx].map.imageUrl;
    }
    return widget.route.map.imageUrl;
  }

  void _updateActiveFloorForStep(int stepIdx) {
    final route = widget.route;
    final instructions = route.instructions;
    if (instructions == null || stepIdx >= instructions.length) return;
    final coord = instructions[stepIdx].coordinate;
    if (coord == null || route.routeMaps == null) return;

    for (var i = 0; i < route.routeMaps!.length; i++) {
      final match = route.routeMaps![i].nodes.any((n) =>
          (n.x - coord.dx).abs() < 5 && (n.y - coord.dy).abs() < 5);
      if (match) {
        _activeFloorIdx = i;
        break;
      }
    }
  }

  List<Offset> _currentFloorPath() {
    final route = widget.route;

    // Priority 1: use floors data if available (already has per-floor path)
    if (route.floors != null && _activeFloorIdx < route.floors!.length) {
      final floor = route.floors![_activeFloorIdx];
      if (floor.path.length >= 2) return floor.path;
    }

    // Priority 2: filter full path by matching nodes on this floor
    if (route.routeMaps != null && _activeFloorIdx < route.routeMaps!.length) {
      final floorNodes = route.routeMaps![_activeFloorIdx].nodes;
      if (floorNodes.length >= 2) {
        final result = <Offset>[];
        for (final pt in route.path) {
          final isOnFloor = floorNodes.any((n) =>
              (pt.dx - n.x).abs() < 3 && (pt.dy - n.y).abs() < 3);
          if (isOnFloor) result.add(pt);
        }
        if (result.length >= 2) return result;
      }
    }

    // Fallback: full path
    return route.path;
  }

  @override
  Widget build(BuildContext context) {
    final route = widget.route;
    final hasMultiFloor = route.routeMaps != null && route.routeMaps!.length > 1;
    final estimatedMinutes = route.totalDistanceM > 0
        ? (route.totalDistanceM / 80).ceil()
        : null;
    final instructions = route.instructions ?? [];
    final totalSteps = instructions.length;
    final activeInstruction = _currentStep < instructions.length
        ? instructions[_currentStep]
        : null;

    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 20),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(24),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.1),
              blurRadius: 30,
              offset: const Offset(0, 10),
            ),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            _buildHeader(route, estimatedMinutes),
            _buildMap(activeInstruction?.coordinate),
            _buildStepControl(instructions, totalSteps),
            if (hasMultiFloor) _buildFloorTabs(route),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(RouteInfo route, int? estimatedMinutes) {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 16, 12, 16),
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
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: AppConstants.primaryColor.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(6),
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
                        fontSize: 12,
                        color: AppConstants.secondaryColor,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (estimatedMinutes != null) ...[
                      const SizedBox(width: 4),
                      Text(
                        '• $estimatedMinutes phút',
                        style: TextStyle(
                          fontSize: 12,
                          color: AppConstants.secondaryColor,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 6),
                if (route.startName != null || route.endName != null)
                  Text(
                    '${route.startName ?? 'Bắt đầu'} → ${route.endName ?? 'Kết thúc'}',
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w900,
                      letterSpacing: -0.3,
                    ),
                  )
                else
                  Text(
                    route.title,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w900,
                      letterSpacing: -0.3,
                    ),
                  ),
              ],
            ),
          ),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              IconButton(
                onPressed: () => Navigator.pop(context),
                icon: const Icon(Icons.close_rounded, size: 20),
                style: IconButton.styleFrom(
                  backgroundColor: Colors.grey.shade100,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildMap(Offset? currentCoord) {
    return SizedBox(
      key: _mapKey,
      height: 300,
      child: InteractiveViewer(
        transformationController: _transformationController,
        maxScale: 3.0,
        child: LayoutBuilder(
          builder: (context, constraints) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (constraints.hasBoundedWidth) {
                _mapSize = constraints.biggest;
              }
            });
            final scaleX = constraints.maxWidth / _refMapWidth;
            final scaleY = constraints.maxHeight / _refMapHeight;
            return ClipRect(
              child: AnimatedSwitcher(
              duration: const Duration(milliseconds: 300),
              child: Stack(
                key: ValueKey('map-$_activeFloorIdx'),
                clipBehavior: Clip.hardEdge,
                children: [
                  if (_activeMapImageUrl != null)
                    Positioned.fill(
                      child: Image.network(
                        AppConstants.getFullImageUrl(_activeMapImageUrl!),
                        fit: BoxFit.contain,
                        errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                      ),
                    ),
                  ..._buildFloorPaths(scaleX, scaleY),
                  ..._buildStartEndNodes(scaleX, scaleY),
                  if (currentCoord != null)
                    _buildCurrentNode(currentCoord, scaleX, scaleY),
                ],
              ),
            ),
            );
          },
        ),
      ),
    );
  }

  List<Widget> _buildFloorPaths(double scaleX, double scaleY) {
    final floorPath = _currentFloorPath();
    if (floorPath.length < 2) return [];

    return [
      Positioned.fill(
        child: CustomPaint(
          painter: _RoutePainter(
            path: floorPath,
            scaleX: scaleX,
            scaleY: scaleY,
            color: AppConstants.primaryColor,
          ),
        ),
      ),
    ];
  }

  List<Widget> _buildStartEndNodes(double scaleX, double scaleY) {
    final floorPath = _currentFloorPath();
    if (floorPath.length < 2) return [];

    return [
      _buildNode(floorPath.first, scaleX, scaleY, Colors.green),
      _buildNode(floorPath.last, scaleX, scaleY, Colors.red),
    ];
  }

  Widget _buildNode(Offset pos, double scaleX, double scaleY, Color color) {
    return Positioned(
      left: pos.dx * scaleX - 6,
      top: pos.dy * scaleY - 6,
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

  Widget _buildCurrentNode(Offset pos, double scaleX, double scaleY) {
    return Positioned(
      left: pos.dx * scaleX - 9,
      top: pos.dy * scaleY - 9,
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

  Widget _buildStepControl(List<InstructionStep> instructions, int totalSteps) {
    final activeInstruction = _currentStep < instructions.length
        ? instructions[_currentStep]
        : null;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: Colors.grey.shade100)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Text(
                    'Bước ${_currentStep + 1} / $totalSteps',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w900,
                      color: AppConstants.secondaryColor.withOpacity(0.6),
                      letterSpacing: 0.5,
                    ),
                  ),
                  if (activeInstruction?.distanceM != null) ...[
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.blue.shade50,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        '${activeInstruction!.distanceM!.round()}m',
                        style: TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w800,
                          color: Colors.blue.shade600,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
              Row(
                children: [
                  _NavButton(
                    icon: Icons.chevron_left_rounded,
                    onPressed: _currentStep > 0
                        ? () => setState(() {
                              _currentStep--;
                              _updateActiveFloorForStep(_currentStep);
                              _centerOnCurrentStep();
                            })
                        : null,
                  ),
                  const SizedBox(width: 8),
                  _NavButton(
                    icon: Icons.chevron_right_rounded,
                    onPressed: _currentStep < totalSteps - 1
                        ? () => setState(() {
                              _currentStep++;
                              _updateActiveFloorForStep(_currentStep);
                              _centerOnCurrentStep();
                            })
                        : null,
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 10),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.grey.shade50,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.grey.shade200),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  margin: const EdgeInsets.only(top: 2),
                  width: 6,
                  height: 6,
                  decoration: BoxDecoration(
                    color: Colors.blue.shade400,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: Colors.blue.shade400.withOpacity(0.4),
                        blurRadius: 4,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    activeInstruction?.text ?? 'Bắt đầu di chuyển',
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      height: 1.4,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFloorTabs(RouteInfo route) {
    final routeMaps = route.routeMaps!;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.grey.shade50,
        border: Border(top: BorderSide(color: Colors.grey.shade100)),
      ),
      child: Row(
        children: [
          Icon(Icons.layers_rounded, size: 14, color: AppConstants.secondaryColor),
          const SizedBox(width: 8),
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: routeMaps.asMap().entries.map((entry) {
                  final idx = entry.key;
                  final rm = entry.value;
                  final isActive = idx == _activeFloorIdx;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: GestureDetector(
                      onTap: () => setState(() {
                        _activeFloorIdx = idx;
                        _updateActiveFloorForStep(_currentStep);
                        _centerOnCurrentStep();
                      }),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                        decoration: BoxDecoration(
                          color: isActive ? AppConstants.primaryColor : Colors.white,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(
                            color: isActive ? AppConstants.primaryColor : Colors.grey.shade200,
                          ),
                        ),
                        child: Text(
                          rm.map.floorLevel == null ? 'Campus' : 'Tầng ${rm.map.floorLevel}',
                          style: TextStyle(
                            fontSize: 11,
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
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
        ),
      ),
    );
  }
}

class _RoutePainter extends CustomPainter {
  _RoutePainter({
    required this.path,
    required this.scaleX,
    required this.scaleY,
    required this.color,
  });

  final List<Offset> path;
  final double scaleX;
  final double scaleY;
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

    final glowPaint = Paint()
      ..color = color.withOpacity(0.15)
      ..strokeWidth = 10.0
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..style = PaintingStyle.stroke
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4);

    final drawingPath = Path();
    drawingPath.moveTo(path[0].dx * scaleX, path[0].dy * scaleY);
    for (var i = 1; i < path.length; i++) {
      drawingPath.lineTo(path[i].dx * scaleX, path[i].dy * scaleY);
    }

    canvas.drawPath(drawingPath, glowPaint);
    canvas.drawPath(drawingPath, paint);
  }

  @override
  bool shouldRepaint(covariant _RoutePainter oldDelegate) => true;
}
