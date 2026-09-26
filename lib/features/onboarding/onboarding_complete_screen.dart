import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';
import '../auth/providers/auth_provider.dart';

class OnboardingCompleteScreen extends ConsumerStatefulWidget {
  const OnboardingCompleteScreen({super.key});

  @override
  ConsumerState<OnboardingCompleteScreen> createState() => _OnboardingCompleteScreenState();
}

class _OnboardingCompleteScreenState extends ConsumerState<OnboardingCompleteScreen> {
  String _companyName = 'Your Company';
  String _serviceRadius = 'Not configured';
  int _serviceCount = 0;
  int _zoneCount = 0;
  int _invitedMembers = 0;

  @override
  void initState() {
    super.initState();
    _loadOnboardingData();
  }

  Future<void> _loadOnboardingData() async {
    final prefs = await SharedPreferences.getInstance();
    final companyName = prefs.getString('onboarding_business_name');
    final radius = prefs.getDouble('onboarding_service_radius');
    final zones = prefs.getStringList('onboarding_service_zones');
    final services = prefs.getStringList('onboarding_services');
    final invited = prefs.getInt('onboarding_invited_count');

    setState(() {
      _companyName = companyName ?? ref.read(currentCompanyProvider)?.name ?? 'Your Company';
      _serviceRadius = radius != null ? '${radius.toInt()} km' : 'Not configured';
      _serviceCount = services?.length ?? 0;
      _zoneCount = zones?.length ?? 0;
      _invitedMembers = invited ?? 0;
    });
  }

  Future<void> _clearOnboardingData() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('onboarding_service_radius');
    await prefs.remove('onboarding_service_zones');
    await prefs.remove('onboarding_services');
    await prefs.remove('onboarding_invited_count');
  }

  @override
  Widget build(BuildContext context) {
    final companyName = _companyName;
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
          children: [
            // Top Operational Status Chip
            Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
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
                        color: AeraColors.success,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'WORKSPACE READY • DISPATCH ONLINE',
                      style: AeraTypography.labelUpper.copyWith(
                        color: AeraColors.accentDeep,
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),

            // Hero Celebration Card
            AeraCard(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
              child: Column(
                children: [
                  Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      color: AeraColors.accentSoft,
                      shape: BoxShape.circle,
                      border: Border.all(color: AeraColors.line),
                    ),
                    child: Center(
                      child: Container(
                        width: 48,
                        height: 48,
                        decoration: const BoxDecoration(
                          color: AeraColors.primary,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.check, color: Colors.white, size: 28),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Your Aera workspace is ready.',
                    textAlign: TextAlign.center,
                    style: AeraTypography.display.copyWith(fontSize: 24),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '$companyName is configured for real-time dispatch, field evidence, and instant customer billing.',
                    textAlign: TextAlign.center,
                    style: AeraTypography.bodySm.copyWith(
                      color: AeraColors.inkSoft,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 14),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: AeraColors.surfaceSubtle,
                      borderRadius: AeraRadii.borderFull,
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.verified_user, size: 14, color: AeraColors.accent),
                        const SizedBox(width: 6),
                        Text(
                          'Deployment ID #AER-9402-LHE',
                          style: AeraTypography.label.copyWith(fontSize: 11),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Configuration Manifest Card
            AeraCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Configuration Manifest',
                        style: AeraTypography.labelUpper.copyWith(
                          fontSize: 10,
                          color: AeraColors.inkSoft,
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: AeraColors.successSoft,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          'Synced',
                          style: AeraTypography.label.copyWith(
                            color: AeraColors.success,
                            fontSize: 10,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),

                  _manifestRow(
                    Icons.corporate_fare,
                    'Organization & Base',
                    companyName,
                  ),
                  const SizedBox(height: 10),
                  _manifestRow(
                    Icons.share_location,
                    'Service Perimeter',
                    '$_serviceRadius radius • $_zoneCount zones configured',
                  ),
                  const SizedBox(height: 10),
                  _manifestRow(
                    Icons.hvac,
                    'Catalog Configured',
                    '$_serviceCount service offerings configured',
                  ),
                  const SizedBox(height: 10),
                  _manifestRow(
                    Icons.badge,
                    'Field Crew Ready',
                    '$_invitedMembers team members invited',
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Launch Dashboard CTA
            AeraButton(
              text: 'Launch Dispatch Console',
              icon: const Icon(Icons.dashboard_outlined, size: 18, color: Colors.white),
              onPressed: () async {
                await _clearOnboardingData();
                if (mounted) {
                  context.go('/dashboard');
                }
              },
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _manifestRow(IconData icon, String title, String subtitle) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AeraColors.surfaceSubtle.withOpacity(0.6),
        borderRadius: AeraRadii.borderMd,
      ),
      child: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: AeraColors.surface,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, size: 18, color: AeraColors.accent),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: AeraTypography.labelUpper.copyWith(fontSize: 10),
                ),
                Text(
                  subtitle,
                  style: AeraTypography.bodySm.copyWith(
                    fontWeight: FontWeight.w600,
                    fontSize: 12,
                    color: AeraColors.ink,
                  ),
                ),
              ],
            ),
          ),
          const Icon(Icons.check_circle, size: 16, color: AeraColors.success),
        ],
      ),
    );
  }
}
