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
            // Logo
            Row(
              children: [
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: AeraColors.accent,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(
                    Icons.ac_unit,
                    color: Colors.white,
                    size: 20,
                  ),
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
            const SizedBox(height: 32),

            // Headline
            Text(
              'Run your HVAC business from first call to final payment.',
              style: AeraTypography.display.copyWith(fontSize: 30),
            ),
            const SizedBox(height: 10),
            Text(
              'One place for customers, jobs, scheduling, technicians, quotes, and invoices.',
              style: AeraTypography.body.copyWith(
                color: AeraColors.inkSoft,
                height: 1.45,
              ),
            ),
            const SizedBox(height: 28),

            // Feature rows
            const _FeatureRow(
              icon: Icons.calendar_month_outlined,
              title: 'Scheduling & Dispatch',
              description:
                  'Schedule jobs, assign technicians, and reschedule without losing job history.',
            ),
            const SizedBox(height: 12),
            const _FeatureRow(
              icon: Icons.camera_alt_outlined,
              title: 'Job Evidence',
              description:
                  'Technicians add notes, photos, and parts used, then complete the job from their phone.',
            ),
            const SizedBox(height: 12),
            const _FeatureRow(
              icon: Icons.receipt_long_outlined,
              title: 'Quotes & Invoices',
              description:
                  'Send quotes for customer approval, issue invoices, and record payments.',
            ),
            const SizedBox(height: 32),

            // CTAs
            AeraButton(
              text: 'Create Account',
              icon: const Icon(
                Icons.arrow_forward,
                size: 18,
                color: Colors.white,
              ),
              onPressed: () => context.push('/sign-up'),
            ),
            const SizedBox(height: 12),
            AeraButton(
              text: 'Sign In',
              variant: AeraButtonVariant.secondary,
              onPressed: () => context.push('/login'),
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
    required this.description,
  });

  final IconData icon;
  final String title;
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
                Text(
                  title,
                  style: AeraTypography.h3.copyWith(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
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
