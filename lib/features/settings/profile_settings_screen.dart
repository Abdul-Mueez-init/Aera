import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../auth/data/auth_repository.dart';
import '../auth/providers/auth_provider.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_card.dart';

/// Shows the signed-in user's real account details and the Sign Out action.
///
/// Everything here comes from the saved session (which is re-checked against
/// `/auth/me` on startup). There are no preference toggles yet: features such
/// as biometric lock or offline sync do not exist in the app, so the screen
/// does not pretend they do.
class ProfileSettingsScreen extends ConsumerWidget {
  const ProfileSettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final company = ref.watch(currentCompanyProvider);
    final role = ref.watch(currentRoleProvider);
    // Technicians cannot open company settings (the router blocks it), so
    // they are not shown a link to it.
    final canOpenCompanySettings = role != null && role != 'TECHNICIAN';

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AppBar(
        title: const Text('Profile & Account'),
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        children: [
          // User Identity Card
          AeraCard(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 56,
                      height: 56,
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [AeraColors.accent, AeraColors.accentSoft],
                        ),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Center(
                        child: Text(
                          user?.initials ?? '?',
                          style: AeraTypography.h3.copyWith(
                            color: AeraColors.surface,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            user?.fullName ?? 'Your account',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AeraTypography.h3.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            roleLabel(role),
                            style: AeraTypography.bodySm.copyWith(
                              color: AeraColors.inkSoft,
                            ),
                          ),
                          if (company != null) ...[
                            const SizedBox(height: 2),
                            Text(
                              company.name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: AeraTypography.label.copyWith(
                                color: AeraColors.outline,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
                if (user != null && user.email.isNotEmpty) ...[
                  const SizedBox(height: 14),
                  const Divider(color: AeraColors.line, height: 1),
                  const SizedBox(height: 10),
                  _contactRow(Icons.alternate_email, user.email),
                ],
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Company Settings Shortcut Banner
          if (canOpenCompanySettings) ...[
            InkWell(
              onTap: () => context.push('/company-settings'),
              borderRadius: BorderRadius.circular(12),
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AeraColors.accent,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: AeraColors.surface.withOpacity(0.15),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(
                        Icons.domain,
                        color: AeraColors.surface,
                        size: 24,
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'COMPANY',
                            style: AeraTypography.labelUpper.copyWith(
                              color: AeraColors.surface.withOpacity(0.8),
                              fontSize: 10,
                            ),
                          ),
                          Text(
                            company?.name ?? 'Company settings',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AeraTypography.body.copyWith(
                              color: AeraColors.surface,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          Text(
                            'Company name, timezone and currency',
                            style: AeraTypography.label.copyWith(
                              color: AeraColors.surface.withOpacity(0.75),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const Icon(
                      Icons.arrow_forward_ios,
                      color: AeraColors.surface,
                      size: 14,
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 14),
          ],

          // Sign Out Action
          OutlinedButton.icon(
            // Revokes the session on the server (best effort), clears it on
            // this device, and the router then sends the user to Welcome.
            onPressed: () => ref.read(authNotifierProvider.notifier).logout(),
            icon: const Icon(Icons.logout, size: 18, color: AeraColors.danger),
            label: const Text(
              'Sign Out of Aera OS',
              style: TextStyle(color: AeraColors.danger),
            ),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(48),
              side: const BorderSide(color: AeraColors.dangerSoft),
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

  Widget _contactRow(IconData icon, String text) {
    return Row(
      children: [
        Icon(icon, size: 16, color: AeraColors.accent),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
          ),
        ),
      ],
    );
  }
}
