import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_card.dart';

class TechnicianTrackingScreen extends StatelessWidget {
  const TechnicianTrackingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AppBar(
        title: const Text('Live Technician Tracking'),
        actions: [
          IconButton(
            icon: const Icon(Icons.share_outlined),
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Live tracking link shared')),
              );
            },
          ),
          IconButton(
            icon: const Icon(Icons.apps),
            tooltip: 'Screen Catalog',
            onPressed: () => Scaffold.of(context).openEndDrawer(),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        children: [
          // Beacon Live Dispatch Bar
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                decoration: BoxDecoration(
                  color: AeraColors.successSoft,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: const BoxDecoration(
                        color: AeraColors.success,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'LIVE DISPATCH ACTIVE',
                      style: AeraTypography.labelUpper.copyWith(
                        color: AeraColors.success,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              Text(
                'Job #JOB-8492',
                style: AeraTypography.bodySm.copyWith(
                  color: AeraColors.inkSoft,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Focal ETA Card
          AeraCard(
            padding: const EdgeInsets.all(18),
            child: Column(
              crossAxisAlignment: CrossAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.between,
                  children: [
                    Text(
                      'TECHNICIAN EN ROUTE',
                      style: AeraTypography.labelUpper.copyWith(color: AeraColors.inkSoft),
                    ),
                    Row(
                      children: [
                        const Icon(Icons.schedule, size: 14, color: AeraColors.success),
                        const SizedBox(width: 4),
                        Text(
                          'On Schedule',
                          style: AeraTypography.label.copyWith(
                            color: AeraColors.success,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  crossAxisAlignment: CrossAlignment.baseline,
                  textBaseline: TextBaseline.alphabetic,
                  children: [
                    Text(
                      '18',
                      style: AeraTypography.display.copyWith(
                        fontSize: 48,
                        fontWeight: FontWeight.w700,
                        color: AeraColors.accent,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'min away',
                      style: AeraTypography.h3.copyWith(
                        color: AeraColors.inkSoft,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
                Row(
                  children: [
                    Text(
                      '09:24 AM',
                      style: AeraTypography.body.copyWith(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      width: 4,
                      height: 4,
                      decoration: const BoxDecoration(
                        color: AeraColors.outline,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'Estimated arrival window',
                      style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: AeraColors.surfaceSubtle,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.local_shipping, size: 18, color: AeraColors.accent),
                      const SizedBox(width: 8),
                      Text(
                        'Ahmed Raza is piloting Van #12',
                        style: AeraTypography.bodySm.copyWith(fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Contextual Live Map Simulation Card
          AeraCard(
            padding: const EdgeInsets.all(12),
            child: Column(
              children: [
                Container(
                  height: 180,
                  width: double.infinity,
                  decoration: BoxDecoration(
                    color: const Color(0xFFE8ECE9),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: AeraColors.line),
                  ),
                  child: Stack(
                    children: [
                      // Road Grid Graphic Lines
                      CustomPaint(
                        size: const Size(double.infinity, 180),
                        painter: _MapGridPainter(),
                      ),

                      // Speed & Route tag
                      Positioned(
                        top: 10,
                        left: 10,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: AeraColors.surface.withOpacity(0.92),
                            borderRadius: BorderRadius.circular(20),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withOpacity(0.06),
                                blurRadius: 4,
                              ),
                            ],
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.traffic, size: 14, color: AeraColors.accent),
                              const SizedBox(width: 4),
                              Text(
                                'Clear along Canal Bank Rd',
                                style: AeraTypography.label.copyWith(fontWeight: FontWeight.w600),
                              ),
                            ],
                          ),
                        ),
                      ),

                      // Moving Van Marker
                      Positioned(
                        left: 80,
                        top: 60,
                        child: Column(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: AeraColors.ink,
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Text(
                                '35 km/h',
                                style: AeraTypography.label.copyWith(
                                  color: AeraColors.surface,
                                  fontSize: 10,
                                ),
                              ),
                            ),
                            const SizedBox(height: 2),
                            Container(
                              width: 36,
                              height: 36,
                              decoration: BoxDecoration(
                                color: AeraColors.accent,
                                shape: BoxShape.circle,
                                border: Border.all(color: AeraColors.surface, width: 3),
                                boxShadow: [
                                  BoxShadow(
                                    color: AeraColors.accent.withOpacity(0.4),
                                    blurRadius: 8,
                                  ),
                                ],
                              ),
                              child: const Icon(Icons.directions_car, color: AeraColors.surface, size: 18),
                            ),
                          ],
                        ),
                      ),

                      // Destination House Marker
                      Positioned(
                        right: 40,
                        bottom: 30,
                        child: Column(
                          children: [
                            Container(
                              width: 36,
                              height: 36,
                              decoration: BoxDecoration(
                                color: AeraColors.surface,
                                shape: BoxShape.circle,
                                border: Border.all(color: AeraColors.accent, width: 2),
                                boxShadow: [
                                  BoxShadow(
                                    color: Colors.black.withOpacity(0.1),
                                    blurRadius: 6,
                                  ),
                                ],
                              ),
                              child: const Icon(Icons.home_pin, color: AeraColors.accent, size: 20),
                            ),
                            const SizedBox(height: 2),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: AeraColors.surface,
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                'House 42-B',
                                style: AeraTypography.label.copyWith(fontWeight: FontWeight.w700),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.pin_drop, size: 18, color: AeraColors.inkSoft),
                        const SizedBox(width: 6),
                        Text(
                          'House 42-B, Block K, Gulberg III',
                          style: AeraTypography.bodySm.copyWith(fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: AeraColors.surfaceSubtle,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        '3.4 km',
                        style: AeraTypography.label.copyWith(
                          color: AeraColors.accent,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Route Condition Note
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AeraColors.warningSoft.withOpacity(0.6),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AeraColors.warning.withOpacity(0.3)),
            ),
            child: Row(
              children: [
                const Icon(Icons.info_outline, color: AeraColors.warning, size: 20),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAlignment.start,
                    children: [
                      Text(
                        'ROUTE CONDITION',
                        style: AeraTypography.labelUpper.copyWith(color: AeraColors.warning),
                      ),
                      Text(
                        'Moderate traffic around Ferozepur Rd underpass. Ahmed is maintaining normal ETA buffer.',
                        style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Technician Contact Card
          AeraCard(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                Row(
                  children: [
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: AeraColors.accentSoft,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Center(
                        child: Text(
                          'AR',
                          style: AeraTypography.h3.copyWith(
                            color: AeraColors.accent,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(
                                'Ahmed Raza',
                                style: AeraTypography.h3.copyWith(fontWeight: FontWeight.w700),
                              ),
                              const SizedBox(width: 6),
                              const Icon(Icons.verified, size: 16, color: AeraColors.accent),
                            ],
                          ),
                          Text(
                            'Master HVAC Specialist • Van #12',
                            style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
                          ),
                          Row(
                            children: [
                              const Icon(Icons.star, size: 14, color: Colors.amber),
                              const SizedBox(width: 4),
                              Text(
                                '4.9 (328 jobs completed)',
                                style: AeraTypography.label.copyWith(color: AeraColors.inkSoft),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    Expanded(
                      child: ElevatedButton.icon(
                        onPressed: () {},
                        icon: const Icon(Icons.call, size: 16),
                        label: const Text('Call Ahmed'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AeraColors.accent,
                          foregroundColor: AeraColors.surface,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () {},
                        icon: const Icon(Icons.message, size: 16, color: AeraColors.accent),
                        label: const Text('Message'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AeraColors.ink,
                          side: const BorderSide(color: AeraColors.line),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Real-time Service Execution Steps
          AeraCard(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAlignment.start,
              children: [
                Text(
                  'TODAY\'S SERVICE PLAN',
                  style: AeraTypography.labelUpper.copyWith(color: AeraColors.inkSoft),
                ),
                const SizedBox(height: 12),
                _stepRow('1', 'Parts Loaded & Transit', 'OEM Compressor & Nitrogen in Van #12', true, false),
                _stepRow('2', 'Site Arrival & Physical Diagnostics', 'Pressure manifold calibration check', false, true),
                _stepRow('3', 'Evacuation & Nitrogen Pressure Test', 'Hold 450 PSI to guarantee no micro leaks', false, false),
                _stepRow('4', 'Vacuum Deep Pull & Virgin R410A Fill', 'Calibrate subcooling to factory specs', false, false),
              ],
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _stepRow(String num, String title, String desc, bool completed, bool inProgress) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAlignment.start,
        children: [
          Container(
            width: 24,
            height: 24,
            decoration: BoxDecoration(
              color: completed
                  ? AeraColors.accent
                  : inProgress
                      ? AeraColors.accentSoft
                      : AeraColors.surfaceSubtle,
              shape: BoxShape.circle,
            ),
            child: Center(
              child: completed
                  ? const Icon(Icons.check, size: 14, color: AeraColors.surface)
                  : Text(
                      num,
                      style: AeraTypography.label.copyWith(
                        color: inProgress ? AeraColors.accent : AeraColors.inkSoft,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAlignment.start,
              children: [
                Text(
                  title,
                  style: AeraTypography.bodySm.copyWith(
                    fontWeight: inProgress ? FontWeight.w700 : FontWeight.w500,
                    color: inProgress ? AeraColors.accent : AeraColors.ink,
                  ),
                ),
                Text(
                  desc,
                  style: AeraTypography.label.copyWith(color: AeraColors.outline),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MapGridPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final roadPaint = Paint()
      ..color = Colors.white
      ..strokeWidth = 6
      ..style = PaintingStyle.stroke;

    final routePaint = Paint()
      ..color = AeraColors.accent
      ..strokeWidth = 4
      ..style = PaintingStyle.stroke;

    // Background road lines
    final path1 = Path()
      ..moveTo(20, 20)
      ..cubicTo(100, 60, 160, 100, size.width - 30, size.height - 40);
    canvas.drawPath(path1, roadPaint);

    final path2 = Path()
      ..moveTo(0, size.height * 0.7)
      ..lineTo(size.width, size.height * 0.3);
    canvas.drawPath(path2, roadPaint);

    // Active route overlay
    canvas.drawPath(path1, routePaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
