import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_card.dart';

class MoreScreen extends StatelessWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AppBar(
        title: const Text('Operations Hub'),
        actions: [
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
          // Operator Banner
          InkWell(
            onTap: () => context.push('/profile-settings'),
            borderRadius: BorderRadius.circular(12),
            child: AeraCard(
              padding: const EdgeInsets.all(14),
              child: Row(
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: AeraColors.accentSoft,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Center(
                      child: Text(
                        'MV',
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
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text(
                              'Marcus Vance',
                              style: AeraTypography.bodySm.copyWith(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(width: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 6,
                                vertical: 1,
                              ),
                              decoration: BoxDecoration(
                                color: AeraColors.accentSoft,
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                'Dispatcher',
                                style: AeraTypography.label.copyWith(
                                  color: AeraColors.accent,
                                  fontSize: 10,
                                ),
                              ),
                            ),
                          ],
                        ),
                        Text(
                          'Northstar Climate Solutions • Lahore Hub',
                          style: AeraTypography.label.copyWith(
                            color: AeraColors.outline,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Icon(
                    Icons.arrow_forward_ios,
                    size: 14,
                    color: AeraColors.outline,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),

          // Section 1: Commercial Workflows
          _sectionHeader('COMMERCIAL & REVENUE'),
          _navItem(
            context,
            icon: Icons.request_quote,
            title: 'Quotes & Proposals',
            subtitle: '5 active estimates • Rs 56,700 pending',
            route: '/quotes',
          ),
          _navItem(
            context,
            icon: Icons.receipt_long,
            title: 'Invoices & Receivables',
            subtitle: 'Rs 84,300 outstanding • 3 pending settlement',
            route: '/invoices',
          ),
          _navItem(
            context,
            icon: Icons.draw,
            title: 'Client Quote Approval Portal',
            subtitle: 'Digital sign & scope authorization view',
            route: '/quote-approval',
          ),
          _navItem(
            context,
            icon: Icons.payments,
            title: 'Client Invoice Payment Portal',
            subtitle: 'Raast IBFT & Card checkout view',
            route: '/invoice-payment',
          ),
          const SizedBox(height: 14),

          // Section 2: Field Telemetry & AI
          _sectionHeader('FIELD OPERATIONS & INTELLIGENCE'),
          _navItem(
            context,
            icon: Icons.auto_awesome,
            title: 'Aera AI Operations Assistant',
            subtitle: 'Operational risk analysis & recommendations',
            route: '/ai-assistant',
          ),
          _navItem(
            context,
            icon: Icons.crisis_alert,
            title: 'AI Insight & Algorithmic Trace',
            subtitle: 'Live SLA buffer breach simulation',
            route: '/ai-insight/ins-1',
          ),
          _navItem(
            context,
            icon: Icons.location_on,
            title: 'Live Technician GPS Tracking',
            subtitle: 'Van #12 (Ahmed Raza) • 18 min away',
            route: '/technician-tracking',
          ),
          _navItem(
            context,
            icon: Icons.engineering,
            title: 'Technician Home',
            subtitle: "Today's assigned jobs & field execution",
            route: '/technician-home',
          ),
          const SizedBox(height: 14),

          // Section 3: Settings & Administration
          _sectionHeader('SETTINGS & MANAGEMENT'),
          _navItem(
            context,
            icon: Icons.notifications,
            title: 'Notification Center',
            subtitle: '6 updates across dispatch & billing',
            route: '/notifications',
          ),
          _navItem(
            context,
            icon: Icons.domain,
            title: 'Company Settings & Fleet',
            subtitle: 'Manage 4 vans, 35 km radius, labor rates',
            route: '/company-settings',
          ),
          _navItem(
            context,
            icon: Icons.person,
            title: 'Profile & App Preferences',
            subtitle: 'Offline sync, haptics, security locks',
            route: '/profile-settings',
          ),
          const SizedBox(height: 14),

          // Screen Catalog Shortcut
          OutlinedButton.icon(
            onPressed: () => Scaffold.of(context).openEndDrawer(),
            icon: const Icon(Icons.apps, size: 18, color: AeraColors.accent),
            label: const Text(
              'Open Full 34-Screen Catalog Drawer',
              style: TextStyle(
                color: AeraColors.accent,
                fontWeight: FontWeight.w600,
              ),
            ),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(48),
              side: const BorderSide(color: AeraColors.accent),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _sectionHeader(String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6, left: 2),
      child: Text(
        title,
        style: AeraTypography.labelUpper.copyWith(
          color: AeraColors.inkSoft,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }

  Widget _navItem(
    BuildContext context, {
    required IconData icon,
    required String title,
    required String subtitle,
    required String route,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: () => context.push(route),
        borderRadius: BorderRadius.circular(12),
        child: AeraCard(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: AeraColors.surfaceSubtle,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, color: AeraColors.accent, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: AeraTypography.bodySm.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      subtitle,
                      style: AeraTypography.label.copyWith(
                        color: AeraColors.outline,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(
                Icons.arrow_forward_ios,
                size: 12,
                color: AeraColors.outline,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
