import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';
import '../auth/providers/auth_provider.dart';
import 'providers/onboarding_wizard_provider.dart';

class OnboardingCompleteScreen extends ConsumerWidget {
  const OnboardingCompleteScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final wizard = ref.watch(onboardingWizardProvider);
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      body: SafeArea(child: _CompletionContent(wizard: wizard, ref: ref)),
    );
  }
}

class _CompletionContent extends StatelessWidget {
  const _CompletionContent({required this.wizard, required this.ref});
  final OnboardingWizardState wizard;
  final WidgetRef ref;

  @override
  Widget build(BuildContext context) {
    final selectedZones = [
      ...wizard.zoneObjects.map((z) => z.name),
      ...wizard.customZoneNames,
    ].join(', ');
    final selectedServices = wizard.selectedServices
        .map((s) => s.name)
        .join(', ');
    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
      children: [
        Center(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: AeraColors.successSoft,
              borderRadius: AeraRadii.borderFull,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.check_circle,
                  size: 14,
                  color: AeraColors.success,
                ),
                const SizedBox(width: 8),
                Text(
                  'WORKSPACE SETUP VERIFIED',
                  style: AeraTypography.labelUpper.copyWith(
                    color: AeraColors.success,
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
              const Icon(Icons.task_alt, color: AeraColors.success, size: 56),
              const SizedBox(height: 16),
              Text(
                'Your Aera workspace is ready.',
                textAlign: TextAlign.center,
                style: AeraTypography.display.copyWith(fontSize: 24),
              ),
              const SizedBox(height: 8),
              Text(
                '${wizard.name} is configured with the company details, service territory, and service catalog saved to your Aera workspace.',
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
              _manifestRow(Icons.corporate_fare, 'Company', wizard.name),
              const SizedBox(height: 10),
              _manifestRow(
                Icons.phone_outlined,
                'Dispatch phone',
                wizard.phone.isEmpty ? 'Not set' : wizard.phone,
              ),
              const SizedBox(height: 10),
              _manifestRow(
                Icons.share_location,
                'Headquarters',
                wizard.resolvedAddress ?? 'Not set',
              ),
              const SizedBox(height: 10),
              _manifestRow(
                Icons.radar,
                'Service coverage',
                '${wizard.radiusKm} km • ${wizard.selectedZoneIds.length + wizard.customZoneNames.length} zones',
              ),
              if (selectedZones.isNotEmpty) ...[
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
                '${wizard.selectedServices.length} selected',
              ),
              if (selectedServices.isNotEmpty) ...[
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
                wizard.currency,
              ),
              const SizedBox(height: 10),
              _manifestRow(
                Icons.sync,
                'Server status',
                'Persisted and verified',
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        AeraButton(
          text: 'Launch Dispatch Console',
          icon: const Icon(
            Icons.dashboard_outlined,
            size: 18,
            color: Colors.white,
          ),
          onPressed: () async {
            await ref.read(authNotifierProvider.notifier).refreshServerIdentity();
            ref.read(onboardingWizardProvider.notifier).reset();
            if (context.mounted) {
              context.go('/dashboard');
            }
          },
        ),
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
        const Icon(Icons.check_circle, size: 16, color: AeraColors.success),
      ],
    );
  }
}
