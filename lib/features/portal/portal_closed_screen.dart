import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import 'data/portal_repository.dart';
import 'providers/portal_provider.dart';
import 'widgets/portal_contact_tiles.dart';

/// The closed portal screen (`/p/closed`, handoff 6.3 / G6).
///
/// Shown when the link or session is dead: deactivated after the job
/// ended, already opened on another device, expired, or invalid. Whatever
/// happened, the customer always sees who to contact — the company and
/// owner/dispatcher contact tiles from the backend's 410 payload.
class PortalClosedScreen extends ConsumerWidget {
  const PortalClosedScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final closed = ref.watch(portalClosedProvider);
    final variant = closed?.variant ?? PortalClosedVariant.invalid;
    final contact = closed?.contact;
    final companyName = contact?.companyName ?? 'your service provider';

    final (icon, title, message) = switch (variant) {
      PortalClosedVariant.alreadyUsed => (
        Icons.devices_outlined,
        'Link already used',
        'This link was already opened on another device — '
            'ask $companyName to send a new one.',
      ),
      PortalClosedVariant.expired => (
        Icons.schedule_outlined,
        'Link expired',
        'This link has expired. Ask $companyName to send a new one '
            'if you still need access.',
      ),
      PortalClosedVariant.invalid => (
        Icons.link_off_outlined,
        'Link not valid',
        'This link isn\'t valid. Check the link $companyName sent you, '
            'or ask them to send a new one.',
      ),
      _ => (
        Icons.check_circle_outline,
        'Portal access deactivated',
        'Your job is done, so your portal access is deactivated. '
            'If you have any queries, please contact $companyName.',
      ),
    };

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(
                    child: Container(
                      width: 72,
                      height: 72,
                      decoration: const BoxDecoration(
                        color: AeraColors.accentSoft,
                        shape: BoxShape.circle,
                      ),
                      child: Icon(icon, size: 32, color: AeraColors.accent),
                    ),
                  ),
                  const SizedBox(height: 20),
                  Text(
                    title,
                    textAlign: TextAlign.center,
                    style: AeraTypography.h2.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    message,
                    textAlign: TextAlign.center,
                    style: AeraTypography.body.copyWith(
                      color: AeraColors.inkSoft,
                    ),
                  ),
                  if (contact != null) ...[
                    const SizedBox(height: 24),
                    Text(
                      'CONTACT ${contact.companyName.toUpperCase()}',
                      textAlign: TextAlign.center,
                      style: AeraTypography.labelUpper.copyWith(
                        color: AeraColors.inkSoft,
                      ),
                    ),
                    const SizedBox(height: 12),
                    PortalContactTiles(contact: contact),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
