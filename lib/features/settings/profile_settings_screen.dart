import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_card.dart';

class ProfileSettingsScreen extends StatefulWidget {
  const ProfileSettingsScreen({super.key});

  @override
  State<ProfileSettingsScreen> createState() => _ProfileSettingsScreenState();
}

class _ProfileSettingsScreenState extends State<ProfileSettingsScreen> {
  bool _hapticFeedback = true;
  bool _offlineCache = true;
  bool _autoInterventions = true;
  bool _biometrics = true;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AppBar(
        title: const Text('Profile & Preferences'),
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
          // User Identity Card
          AeraCard(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAlignment.start,
              children: [
                Row(
                  children: [
                    Stack(
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
                              'MV',
                              style: AeraTypography.h3.copyWith(
                                color: AeraColors.surface,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ),
                        Positioned(
                          right: 0,
                          bottom: 0,
                          child: Container(
                            width: 16,
                            height: 16,
                            decoration: const BoxDecoration(
                              color: AeraColors.success,
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(Icons.bolt, size: 10, color: AeraColors.surface),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(
                                'Marcus Vance',
                                style: AeraTypography.h3.copyWith(fontWeight: FontWeight.w700),
                              ),
                              const SizedBox(width: 6),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: AeraColors.accentSoft,
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(
                                  'Lead',
                                  style: AeraTypography.label.copyWith(
                                    color: AeraColors.accent,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          Text(
                            'Owner & Lead Dispatcher',
                            style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'Northstar Fleet #01 • PKT (UTC+5)',
                            style: AeraTypography.label.copyWith(color: AeraColors.outline),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                const Divider(color: AeraColors.line, height: 1),
                const SizedBox(height: 10),
                _contactRow(Icons.alternate_email, 'marcus@northstarclimate.com'),
                const SizedBox(height: 6),
                _contactRow(Icons.phone_iphone, '+92 (300) 238-9041', verified: true),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Company Settings Shortcut Banner
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
                    child: const Icon(Icons.domain, color: AeraColors.surface, size: 24),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAlignment.start,
                      children: [
                        Text(
                          'COMPANY MANAGEMENT',
                          style: AeraTypography.labelUpper.copyWith(
                            color: AeraColors.surface.withOpacity(0.8),
                            fontSize: 10,
                          ),
                        ),
                        Text(
                          'Northstar Climate Settings',
                          style: AeraTypography.body.copyWith(
                            color: AeraColors.surface,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Text(
                          'Manage team, territories, labor rates & billing',
                          style: AeraTypography.label.copyWith(
                            color: AeraColors.surface.withOpacity(0.75),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const Icon(Icons.arrow_forward_ios, color: AeraColors.surface, size: 14),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),

          // Group: App Experience
          Text(
            'APP EXPERIENCE',
            style: AeraTypography.labelUpper.copyWith(color: AeraColors.inkSoft),
          ),
          const SizedBox(height: 8),
          AeraCard(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            child: Column(
              children: [
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text('Haptic & Sound Feedback', style: AeraTypography.bodySm.copyWith(fontWeight: FontWeight.w600)),
                  subtitle: Text('Vibrate on job status updates', style: AeraTypography.label.copyWith(color: AeraColors.outline)),
                  value: _hapticFeedback,
                  activeColor: AeraColors.accent,
                  onChanged: (val) => setState(() => _hapticFeedback = val),
                ),
                const Divider(color: AeraColors.line, height: 1),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text('Offline Field Sync', style: AeraTypography.bodySm.copyWith(fontWeight: FontWeight.w600)),
                  subtitle: Text('Cache jobs & diagnostics when offline', style: AeraTypography.label.copyWith(color: AeraColors.outline)),
                  value: _offlineCache,
                  activeColor: AeraColors.accent,
                  onChanged: (val) => setState(() => _offlineCache = val),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),

          // Group: Dispatch & AI Autonomous Mode
          Text(
            'AI DISPATCH & TELEMETRY',
            style: AeraTypography.labelUpper.copyWith(color: AeraColors.inkSoft),
          ),
          const SizedBox(height: 8),
          AeraCard(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            child: Column(
              children: [
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text('Auto-Intervention Suggestions', style: AeraTypography.bodySm.copyWith(fontWeight: FontWeight.w600)),
                  subtitle: Text('Alert on arrival SLA breaches > 15 min', style: AeraTypography.label.copyWith(color: AeraColors.outline)),
                  value: _autoInterventions,
                  activeColor: AeraColors.accent,
                  onChanged: (val) => setState(() => _autoInterventions = val),
                ),
                const Divider(color: AeraColors.line, height: 1),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text('Biometric Security Lock', style: AeraTypography.bodySm.copyWith(fontWeight: FontWeight.w600)),
                  subtitle: Text('Require Face/Fingerprint on app open', style: AeraTypography.label.copyWith(color: AeraColors.outline)),
                  value: _biometrics,
                  activeColor: AeraColors.accent,
                  onChanged: (val) => setState(() => _biometrics = val),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),

          // Sign Out Action
          OutlinedButton.icon(
            onPressed: () => context.go('/login'),
            icon: const Icon(Icons.logout, size: 18, color: AeraColors.danger),
            label: const Text('Sign Out of Aera OS', style: TextStyle(color: AeraColors.danger)),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(48),
              side: const BorderSide(color: AeraColors.dangerSoft),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _contactRow(IconData icon, String text, {bool verified = false}) {
    return Row(
      children: [
        Icon(icon, size: 16, color: AeraColors.accent),
        const SizedBox(width: 8),
        Text(text, style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft)),
        if (verified) ...[
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
            decoration: BoxDecoration(
              color: AeraColors.successSoft,
              borderRadius: BorderRadius.circular(4),
            ),
            child: Text(
              'Verified',
              style: AeraTypography.label.copyWith(
                color: AeraColors.success,
                fontWeight: FontWeight.w600,
                fontSize: 10,
              ),
            ),
          ),
        ],
      ],
    );
  }
}
