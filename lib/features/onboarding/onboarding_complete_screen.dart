import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';
import 'data/onboarding_repository.dart';

class OnboardingCompleteScreen extends ConsumerWidget {
  const OnboardingCompleteScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profileAsync = ref.watch(onboardingProfileProvider);
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      body: SafeArea(
        child: profileAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.cloud_off,
                    color: AeraColors.danger,
                    size: 36,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Could not verify workspace setup.',
                    style: AeraTypography.h3,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Connect to the API and retry before launching the workspace.',
                    textAlign: TextAlign.center,
                    style: AeraTypography.bodySm.copyWith(
                      color: AeraColors.inkSoft,
                    ),
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: () => ref.invalidate(onboardingProfileProvider),
                    icon: const Icon(Icons.refresh),
                    label: const Text('Retry'),
                  ),
                ],
              ),
            ),
          ),
          data: (profile) => _CompletionContent(profile: profile),
        ),
      ),
    );
  }
}

class _CompletionContent extends ConsumerWidget {
  const _CompletionContent({required this.profile});
  final OnboardingProfile profile;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final complete = profile.onboardingCompletedAt != null;
    final selectedZones = profile.serviceZones
        .map((zone) => zone.name)
        .join(', ');
    final selectedServices = profile.services
        .map((service) => service.name)
        .join(', ');
    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
          children: [
            Center(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
              color: complete
                  ? AeraColors.successSoft
                  : AeraColors.danger.withValues(alpha: 0.1),
                  borderRadius: AeraRadii.borderFull,
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                Icon(
                  complete ? Icons.check_circle : Icons.error_outline,
                  size: 14,
                  color: complete ? AeraColors.success : AeraColors.danger,
                    ),
                    const SizedBox(width: 8),
                    Text(
                  complete ? 'WORKSPACE SETUP VERIFIED' : 'SETUP INCOMPLETE',
                      style: AeraTypography.labelUpper.copyWith(
                    color: complete ? AeraColors.success : AeraColors.danger,
                        fontSize: 10,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),
            AeraCard(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
              child: Column(
                children: [
              Icon(
                complete ? Icons.task_alt : Icons.pending_actions,
                color: complete ? AeraColors.success : AeraColors.outline,
                size: 56,
                  ),
                  const SizedBox(height: 16),
                  Text(
                complete
                    ? 'Your Aera workspace is ready.'
                    : 'A few setup items still need attention.',
                    textAlign: TextAlign.center,
                    style: AeraTypography.display.copyWith(fontSize: 24),
                  ),
                  const SizedBox(height: 8),
                  Text(
                complete
                    ? '${profile.name} is configured with the company details, service territory, and service catalog saved to your Aera workspace.'
                    : 'The API has not marked this workspace complete. Return to onboarding and finish the required company profile, verified service zones, and service selections.',
                    textAlign: TextAlign.center,
                    style: AeraTypography.bodySm.copyWith(
                      color: AeraColors.inkSoft,
                      height: 1.4,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            AeraCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                'SAVED CONFIGURATION',
                        style: AeraTypography.labelUpper.copyWith(
                          fontSize: 10,
                          color: AeraColors.inkSoft,
                        ),
                      ),
              const SizedBox(height: 12),
              _manifestRow(Icons.corporate_fare, 'Company', profile.name),
              const SizedBox(height: 10),
              _manifestRow(
                Icons.phone_outlined,
                'Dispatch phone',
                profile.phone ?? 'Not set',
                        ),
              const SizedBox(height: 10),
              _manifestRow(
                Icons.share_location,
                'Headquarters',
                profile.headquartersAddress ?? 'Not set',
              ),
              const SizedBox(height: 10),
              _manifestRow(
                Icons.radar,
                'Service coverage',
                profile.serviceRadiusKm == null
                    ? 'Not set'
                    : '${profile.serviceRadiusKm} km • ${profile.serviceZones.length} verified zones',
              ),
              if (profile.serviceZones.isNotEmpty) ...[
                const SizedBox(height: 6),
                Padding(
                  padding: const EdgeInsets.only(left: 44),
                        child: Text(
                    selectedZones,
                          style: AeraTypography.label.copyWith(
                      color: AeraColors.inkSoft,
                          ),
                        ),
                      ),
                    ],
                  const SizedBox(height: 10),
                  _manifestRow(
                Icons.home_repair_service_outlined,
                'Services',
                '${profile.services.length} selected',
              ),
              if (profile.services.isNotEmpty) ...[
                const SizedBox(height: 6),
                Padding(
                  padding: const EdgeInsets.only(left: 44),
                  child: Text(
                    selectedServices,
                    style: AeraTypography.label.copyWith(
                      color: AeraColors.inkSoft,
                    ),
                  ),
                ),
              ],
                  const SizedBox(height: 10),
                  _manifestRow(
                Icons.payments_outlined,
                'Currency',
                profile.defaultCurrency,
                  ),
                  const SizedBox(height: 10),
                  _manifestRow(
                Icons.sync,
                'Server status',
                complete ? 'Persisted and verified' : 'Not complete',
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            AeraButton(
          text: complete
              ? 'Launch Dispatch Console'
              : 'Complete required setup first',
          icon: const Icon(
            Icons.dashboard_outlined,
            size: 18,
            color: Colors.white,
          ),
          onPressed: complete
              ? () {
                context.go('/dashboard');
                }
              : null,
            ),
        if (!complete) ...[
          const SizedBox(height: 8),
          Center(
            child: TextButton(
              onPressed: () => context.go('/onboarding/business-basics'),
              child: const Text('Return to onboarding'),
        ),
      ),
        ],
        const SizedBox(height: 20),
      ],
    );
  }

  Widget _manifestRow(IconData icon, String title, String subtitle) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
        children: [
        Icon(icon, size: 20, color: AeraColors.accent),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                style: AeraTypography.labelUpper.copyWith(
                  fontSize: 10,
                  color: AeraColors.inkSoft,
                ),
                ),
                Text(
                  subtitle,
                  style: AeraTypography.bodySm.copyWith(
                    fontWeight: FontWeight.w600,
                    color: AeraColors.ink,
                  ),
                ),
              ],
            ),
          ),
        Icon(
          profile.onboardingCompletedAt != null
              ? Icons.check_circle
              : Icons.radio_button_unchecked,
          size: 16,
          color: profile.onboardingCompletedAt != null
              ? AeraColors.success
              : AeraColors.outline,
      ),
      ],
    );
  }
}
