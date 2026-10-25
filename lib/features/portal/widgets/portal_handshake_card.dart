import 'package:flutter/material.dart';

import '../../../core/theme/aera_colors.dart';
import '../../../core/theme/aera_typography.dart';
import '../../../core/widgets/aera_card.dart';
import '../data/portal_repository.dart';

/// The on-site handshake card (handoff 6.3): while the technician is en
/// route, the customer sees a large 6-digit code to hand over in person.
/// The technician never sees this code in their own app — they must ask
/// the customer for it and type it in.
class PortalHandshakeCard extends StatelessWidget {
  const PortalHandshakeCard({super.key, required this.handshake});

  final PortalHandshake handshake;

  @override
  Widget build(BuildContext context) {
    final technicianName = handshake.technicianName;
    return AeraCard(
      backgroundColor: AeraColors.accentSoft,
      borderColor: AeraColors.accent,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(
                Icons.pin_outlined,
                size: 18,
                color: AeraColors.accentDeep,
              ),
              const SizedBox(width: 6),
              Text(
                'YOUR TECHNICIAN CODE',
                style: AeraTypography.labelUpper.copyWith(
                  color: AeraColors.accentDeep,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            handshake.code,
            textAlign: TextAlign.center,
            style: AeraTypography.display.copyWith(
              fontSize: 44,
              letterSpacing: 8,
              fontWeight: FontWeight.w800,
              color: AeraColors.accentDeep,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'Give this code to the technician when they arrive. '
            'Do not share it by phone or message.',
            textAlign: TextAlign.center,
            style: AeraTypography.bodySm.copyWith(
              color: AeraColors.accentDeep,
              fontWeight: FontWeight.w600,
            ),
          ),
          if (technicianName != null && technicianName.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              'Only give it to $technicianName, your technician.',
              textAlign: TextAlign.center,
              style: AeraTypography.bodySm.copyWith(
                color: AeraColors.accentDeep,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
