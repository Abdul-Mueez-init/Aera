import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          children: [
            // Top Bar: Logo & Status
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Container(
                      width: 32,
                      height: 32,
                      decoration: BoxDecoration(
                        color: AeraColors.accent,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Icon(Icons.ac_unit, color: Colors.white, size: 20),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'AERA',
                      style: AeraTypography.h3.copyWith(
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1.5,
                      ),
                    ),
                  ],
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AeraColors.accentSoft,
                    borderRadius: AeraRadii.borderFull,
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 6,
                        height: 6,
                        decoration: const BoxDecoration(
                          color: AeraColors.accent,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 6),
                      Text(
                        'v2.4 Live',
                        style: AeraTypography.label.copyWith(
                          color: AeraColors.accent,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 28),

            // Tag & Headline
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                  decoration: BoxDecoration(
                    color: AeraColors.surfaceSubtle,
                    borderRadius: AeraRadii.borderFull,
                  ),
                  child: Text(
                    'OPERATIONAL PLATFORM',
                    style: AeraTypography.labelUpper.copyWith(
                      color: AeraColors.inkSoft,
                      fontSize: 10,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              'Run your HVAC operation from lead to final payment.',
              style: AeraTypography.display.copyWith(fontSize: 30),
            ),
            const SizedBox(height: 10),
            Text(
              'A unified system built for owners, dispatchers, and field technicians. Fast, clear, and uncompromisingly reliable.',
              style: AeraTypography.body.copyWith(
                color: AeraColors.inkSoft,
                height: 1.45,
              ),
            ),
            const SizedBox(height: 24),

            // Hero Badge Card
            Container(
              height: 140,
              decoration: BoxDecoration(
                color: AeraColors.accentDeep,
                borderRadius: AeraRadii.borderXl,
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    Color(0xFF1E5A58),
                    Color(0xFF12403F),
                  ],
                ),
              ),
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.15),
                          borderRadius: AeraRadii.borderMd,
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.verified, color: Colors.white, size: 14),
                            const SizedBox(width: 6),
                            Text(
                              'Commercial & Residential Ready',
                              style: AeraTypography.label.copyWith(
                                color: Colors.white,
                                fontSize: 11,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Row(
                        children: [
                          Container(
                            width: 6,
                            height: 6,
                            decoration: const BoxDecoration(
                              color: Color(0xFF68D391),
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            '99.98% Field Uptime',
                            style: AeraTypography.label.copyWith(
                              color: Colors.white,
                              fontSize: 11,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                  Text(
                    'Precision Dispatch & Field Telemetry',
                    style: AeraTypography.h2.copyWith(
                      color: Colors.white,
                      fontSize: 20,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // 3 Operational Pillars
            _FeatureRow(
              icon: Icons.alt_route,
              title: 'Dispatch & Scheduling',
              tag: 'Real-Time',
              tagColor: AeraColors.accent,
              description: 'Live technician routing, route optimization, and instant reassignment on map.',
            ),
            const SizedBox(height: 12),
            _FeatureRow(
              icon: Icons.receipt_long,
              title: 'Job Evidence & Invoicing',
              tag: 'Tap & Sign',
              tagColor: AeraColors.accent,
              description: 'Diagnostic photos, field notes, custom checklists, and one-tap customer approvals.',
            ),
            const SizedBox(height: 12),
            _FeatureRow(
              icon: Icons.insights,
              title: 'Real-Time Cash Flow',
              tag: 'Automated',
              tagColor: AeraColors.success,
              description: 'Track work-in-progress, unbilled margin, overdue revenue, and instantaneous payouts.',
            ),
            const SizedBox(height: 32),

            // CTAs
            AeraButton(
              text: 'Create Workspace',
              icon: const Icon(Icons.arrow_forward, size: 18, color: Colors.white),
              onPressed: () => context.push('/sign-up'),
            ),
            const SizedBox(height: 12),
            AeraButton(
              text: 'Sign In to Existing Account',
              variant: AeraButtonVariant.secondary,
              onPressed: () => context.push('/login'),
            ),
            const SizedBox(height: 24),

            // Trust Footnote
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                ...List.generate(
                  5,
                  (index) => const Icon(Icons.star, size: 16, color: AeraColors.warning),
                ),
                const SizedBox(width: 8),
                Text(
                  '4.9 / 5.0 • SOC2 Type II Certified',
                  style: AeraTypography.bodySm.copyWith(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: AeraColors.inkSoft,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }
}

class _FeatureRow extends StatelessWidget {
  const _FeatureRow({
    required this.icon,
    required this.title,
    required this.tag,
    required this.tagColor,
    required this.description,
  });

  final IconData icon;
  final String title;
  final String tag;
  final Color tagColor;
  final String description;

  @override
  Widget build(BuildContext context) {
    return AeraCard(
      padding: const EdgeInsets.all(14),
      borderRadius: AeraRadii.borderMd,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AeraColors.accentSoft,
              borderRadius: AeraRadii.borderMd,
            ),
            child: Icon(icon, color: AeraColors.accent, size: 20),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      title,
                      style: AeraTypography.h3.copyWith(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      tag,
                      style: AeraTypography.label.copyWith(
                        fontSize: 11,
                        color: tagColor,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  description,
                  style: AeraTypography.bodySm.copyWith(
                    fontSize: 13,
                    color: AeraColors.inkSoft,
                    height: 1.35,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
