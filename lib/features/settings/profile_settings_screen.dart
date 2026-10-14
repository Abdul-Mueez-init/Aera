import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_card.dart';
import '../auth/providers/auth_provider.dart';

class ProfileSettingsScreen extends ConsumerStatefulWidget {
  const ProfileSettingsScreen({super.key});

  @override
  ConsumerState<ProfileSettingsScreen> createState() =>
      _ProfileSettingsScreenState();
}

class _ProfileSettingsScreenState extends ConsumerState<ProfileSettingsScreen> {
  bool _isSigningOut = false;

  Future<void> _handleSignOut() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign Out'),
        content: const Text('Are you sure you want to sign out of Aera?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AeraColors.danger),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Sign Out'),
          ),
        ],
      ),
    );

    if (confirm != true || !mounted) return;

    setState(() => _isSigningOut = true);
    try {
      await ref.read(authNotifierProvider.notifier).logout();
      if (mounted) {
        context.go('/welcome');
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isSigningOut = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            backgroundColor: AeraColors.danger,
            content: Text('Failed to sign out: ${e.toString()}'),
          ),
        );
      }
    }
  }

  String _getInitials(String firstName, String lastName) {
    final f = firstName.isNotEmpty ? firstName[0].toUpperCase() : '';
    final l = lastName.isNotEmpty ? lastName[0].toUpperCase() : '';
    return '$f$l'.isEmpty ? 'U' : '$f$l';
  }

  String _formatRole(String? role) {
    switch (role?.toUpperCase()) {
      case 'OWNER':
        return 'Owner';
      case 'DISPATCHER':
        return 'Dispatcher';
      case 'TECHNICIAN':
        return 'Technician';
      default:
        return role ?? 'Member';
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final company = ref.watch(currentCompanyProvider);
    final role = ref.watch(currentRoleProvider);

    if (user == null) {
      return Scaffold(
        backgroundColor: AeraColors.canvas,
        appBar: AppBar(title: const Text('Profile & Preferences')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final initials = _getInitials(user.firstName, user.lastName);
    final fullName = '${user.firstName} ${user.lastName}'.trim();
    final isOwner = role == 'OWNER';

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AppBar(
        title: const Text('Profile & Preferences'),
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
                          colors: [
                            AeraColors.accent,
                            AeraColors.accentSoft,
                          ],
                        ),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Center(
                        child: Text(
                          initials,
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
                          Row(
                            children: [
                              Flexible(
                                child: Text(
                                  fullName,
                                  style: AeraTypography.h3.copyWith(
                                    fontWeight: FontWeight.w700,
                                  ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 2,
                                ),
                                decoration: BoxDecoration(
                                  color: AeraColors.accentSoft,
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(
                                  _formatRole(role),
                                  style: AeraTypography.label.copyWith(
                                    color: AeraColors.accent,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            company?.name ?? 'Aera Company',
                            style: AeraTypography.bodySm.copyWith(
                              color: AeraColors.inkSoft,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                const Divider(color: AeraColors.line, height: 1),
                const SizedBox(height: 10),
                _contactRow(
                  Icons.alternate_email,
                  user.email,
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),

          // Company Management Shortcut Banner
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
                      color: AeraColors.surface.withValues(alpha: 0.15),
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
                          isOwner ? 'COMPANY MANAGEMENT' : 'COMPANY DETAILS',
                          style: AeraTypography.labelUpper.copyWith(
                            color: AeraColors.surface.withValues(alpha: 0.8),
                            fontSize: 10,
                          ),
                        ),
                        Text(
                          '${company?.name ?? "Company"} Settings',
                          style: AeraTypography.body.copyWith(
                            color: AeraColors.surface,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Text(
                          isOwner
                              ? 'Manage name, handle, timezone & currency'
                              : 'View company timezone & settings',
                          style: AeraTypography.label.copyWith(
                            color: AeraColors.surface.withValues(alpha: 0.75),
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
          const SizedBox(height: 20),

          // Notifications Shortcut Banner
          InkWell(
            onTap: () => context.push('/notifications'),
            borderRadius: BorderRadius.circular(12),
            child: AeraCard(
              padding: const EdgeInsets.all(14),
              child: Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: AeraColors.accentSoft,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(
                      Icons.notifications_outlined,
                      color: AeraColors.accent,
                      size: 22,
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Notifications',
                          style: AeraTypography.body.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        Text(
                          'View alerts, dispatch updates & activity',
                          style: AeraTypography.label.copyWith(
                            color: AeraColors.outline,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Icon(
                    Icons.arrow_forward_ios,
                    color: AeraColors.outline,
                    size: 14,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),

          // Sign Out Action
          OutlinedButton.icon(
            onPressed: _isSigningOut ? null : _handleSignOut,
            icon: _isSigningOut
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.logout, size: 18, color: AeraColors.danger),
            label: Text(
              _isSigningOut ? 'Signing Out...' : 'Sign Out of Aera OS',
              style: const TextStyle(color: AeraColors.danger),
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
            style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}
