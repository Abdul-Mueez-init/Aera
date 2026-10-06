import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';

/// Onboarding "Team" step.
///
/// The previous version of this screen kept an in-memory list of people and
/// sent invitations in a loop, but it threw away the invitation code the
/// server returns, so nobody it invited could ever join. Inviting is now done
/// only on the real Team screen (`/team`), which shows the code once and lets
/// the owner copy or share it.
///
/// This screen stays as a thin pointer until the whole onboarding flow is
/// removed in its own patch (Aera_Handoff_Doc, decision D3).
class TeamSetupScreen extends StatelessWidget {
  const TeamSetupScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: const AeraAppBar(
        title: 'Team Setup',
        subtitle: 'Step 04 / 04',
        showBrand: true,
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          children: [
            Text('Invite your crew', style: AeraTypography.h2),
            const SizedBox(height: 8),
            Text(
              'Technicians and dispatchers join with an invitation code. '
              'You create and share those codes from the Team screen.',
              style: AeraTypography.body.copyWith(color: AeraColors.inkSoft),
            ),
            const SizedBox(height: 20),
            AeraCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('How it works', style: AeraTypography.h3),
                  const SizedBox(height: 8),
                  Text(
                    '1. Open Team and tap invite.\n'
                    '2. Copy the code or send it on WhatsApp.\n'
                    '3. They choose "I have an invitation" in the app and '
                    'set a password.\n'
                    'Once they have joined, they appear in the technician '
                    'list when you dispatch a job.',
                    style: AeraTypography.bodySm,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            AeraButton(
              text: 'Open Team',
              icon: const Icon(
                Icons.group_outlined,
                size: 18,
                color: Colors.white,
              ),
              onPressed: () => context.push('/team'),
            ),
            const SizedBox(height: 12),
            AeraButton(
              text: 'Continue',
              variant: AeraButtonVariant.outline,
              onPressed: () => context.push('/onboarding/complete'),
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }
}
