import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../auth/data/auth_repository.dart';
import '../auth/providers/auth_provider.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_card.dart';

class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final company = ref.watch(currentCompanyProvider);
    final role = ref.watch(currentRoleProvider);

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AppBar(
        title: const Text('Operations Hub'),
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
                        user?.initials ?? '?',
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
                            Flexible(
                              child: Text(
                                user?.fullName ?? 'Your account',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: AeraTypography.bodySm.copyWith(
                                  fontWeight: FontWeight.w700,
                                ),
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
                                roleLabel(role),
                                style: AeraTypography.label.copyWith(
                                  color: AeraColors.accent,
                                  fontSize: 10,
                                ),
                              ),
                            ),
                          ],
                        ),
                        Text(
                          company?.name ?? '',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
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
            subtitle: 'Create, send and track customer quotes',
            route: '/quotes',
          ),
          _navItem(
            context,
            icon: Icons.receipt_long,
            title: 'Invoices & Receivables',
            subtitle: 'Issue invoices and record payments',
            route: '/invoices',
          ),
          const SizedBox(height: 14),

          // Section 2: AI
          _sectionHeader('INTELLIGENCE'),
          _navItem(
            context,
            icon: Icons.auto_awesome,
            title: 'Aera AI Operations Assistant',
            subtitle: 'Ask about today\'s jobs, workload and risks',
            route: '/ai-assistant',
          ),
          const SizedBox(height: 14),

          // Section 3: Settings & Administration
          _sectionHeader('SETTINGS & MANAGEMENT'),
          _navItem(
            context,
            icon: Icons.notifications,
            title: 'Notification Center',
            subtitle: 'Updates on dispatch and billing',
            route: '/notifications',
          ),
          _navItem(
            context,
            icon: Icons.domain,
            title: 'Company Settings',
            subtitle: 'Company name, timezone and currency',
            route: '/company-settings',
          ),
          _navItem(
            context,
            icon: Icons.person,
            title: 'Profile & Account',
            subtitle: 'Your details and sign out',
            route: '/profile-settings',
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
