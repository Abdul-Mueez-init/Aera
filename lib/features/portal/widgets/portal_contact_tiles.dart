import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/theme/aera_colors.dart';
import '../../../core/theme/aera_typography.dart';
import '../../../core/widgets/aera_card.dart';
import '../data/portal_repository.dart';

/// Tap-to-call / tap-to-email tiles for the closed portal screen
/// (handoff 6.3): even though access has ended, the customer can always
/// reach the business — the company phone plus each owner/dispatcher
/// contact the backend included in the 410 payload.
class PortalContactTiles extends StatelessWidget {
  const PortalContactTiles({super.key, required this.contact});

  final CompanyContactInfo contact;

  Future<void> _open(Uri uri) async {
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final tiles = <Widget>[];

    final companyPhone = contact.companyPhone;
    if (companyPhone != null && companyPhone.isNotEmpty) {
      tiles.add(
        _ContactTile(
          icon: Icons.business_outlined,
          title: contact.companyName,
          subtitle: companyPhone,
          onTap: () => _open(Uri(scheme: 'tel', path: companyPhone)),
        ),
      );
    }

    for (final person in contact.contacts) {
      final roleLabel = person.role == 'DISPATCHER' ? 'Dispatcher' : 'Owner';
      final phone = person.phone;
      if (phone != null && phone.isNotEmpty) {
        tiles.add(
          _ContactTile(
            icon: Icons.call_outlined,
            title: person.name,
            subtitle: '$roleLabel • $phone',
            onTap: () => _open(Uri(scheme: 'tel', path: phone)),
          ),
        );
      }
      final email = person.email;
      if (email != null && email.isNotEmpty) {
        tiles.add(
          _ContactTile(
            icon: Icons.mail_outlined,
            title: person.name,
            subtitle: '$roleLabel • $email',
            onTap: () => _open(Uri(scheme: 'mailto', path: email)),
          ),
        );
      }
    }

    if (tiles.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (var i = 0; i < tiles.length; i++) ...[
          if (i > 0) const SizedBox(height: 8),
          tiles[i],
        ],
      ],
    );
  }
}

class _ContactTile extends StatelessWidget {
  const _ContactTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AeraCard(
      padding: const EdgeInsets.all(14),
      onTap: onTap,
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: const BoxDecoration(
              color: AeraColors.accentSoft,
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: AeraColors.accent, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: AeraTypography.body.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                Text(
                  subtitle,
                  style: AeraTypography.bodySm.copyWith(
                    color: AeraColors.inkSoft,
                  ),
                ),
              ],
            ),
          ),
          const Icon(Icons.chevron_right, color: AeraColors.outline),
        ],
      ),
    );
  }
}
