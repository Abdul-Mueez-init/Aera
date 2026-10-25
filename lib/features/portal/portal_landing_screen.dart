import 'package:flutter/material.dart';

import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';

/// The neutral page served at `/` on the customer surface (handoff 6.1).
///
/// Someone who visits the portal domain without a link lands here. There
/// is deliberately no login, no sign-up and no internal branding — the only
/// way in is the link the service provider sent.
class PortalLandingScreen extends StatelessWidget {
  const PortalLandingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 72,
                  height: 72,
                  decoration: const BoxDecoration(
                    color: AeraColors.accentSoft,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.mail_outlined,
                    size: 32,
                    color: AeraColors.accent,
                  ),
                ),
                const SizedBox(height: 20),
                Text(
                  'Open the link your service provider sent you.',
                  textAlign: TextAlign.center,
                  style: AeraTypography.h2.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Your service details live behind that private link — '
                  'there is nothing to sign in to here.',
                  textAlign: TextAlign.center,
                  style: AeraTypography.body.copyWith(
                    color: AeraColors.inkSoft,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
