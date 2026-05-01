import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart' as fm;
import '../models/chat_models.dart';
import '../utils/constants.dart';

class RouteDialog extends StatelessWidget {
  const RouteDialog({super.key, required this.route});
  final RouteInfo route;

  @override
  Widget build(BuildContext context) {
    final center = route.path[route.path.length ~/ 2];
    
    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      insetPadding: const EdgeInsets.all(20),
      child: Container(
        width: double.infinity,
        height: MediaQuery.of(context).size.height * 0.7,
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        route.title,
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        route.summary,
                        style: TextStyle(color: Colors.grey.shade600),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
            const SizedBox(height: 20),
            ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: SizedBox(
                height: 240,
                child: fm.FlutterMap(
                  options: fm.MapOptions(initialCenter: center, initialZoom: 15),
                  children: [
                    fm.TileLayer(
                      urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                      userAgentPackageName: 'io.example.mobile_chatbot',
                    ),
                    fm.PolylineLayer(
                      polylines: [
                        fm.Polyline(
                          points: route.path,
                          strokeWidth: 5,
                          color: AppConstants.primaryColor,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),
            const Text(
              'Các bước di chuyển',
              style: TextStyle(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 10),
            Expanded(
              child: ListView.separated(
                itemCount: route.steps.length,
                separatorBuilder: (_, __) => Divider(color: Colors.grey.shade100),
                itemBuilder: (context, i) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 24,
                        height: 24,
                        decoration: BoxDecoration(
                          color: AppConstants.primaryColor.withOpacity(0.1),
                          shape: BoxShape.circle,
                        ),
                        alignment: Alignment.center,
                        child: Text(
                          '${i + 1}',
                          style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: AppConstants.primaryColor,
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          route.steps[i],
                          style: const TextStyle(fontSize: 14),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
