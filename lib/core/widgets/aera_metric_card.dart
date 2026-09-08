import 'package:flutter/material.dart';
import '../theme/aera_colors.dart';
import '../theme/aera_radii.dart';
import '../theme/aera_typography.dart';
import 'aera_card.dart';

class AeraMetricCard extends StatelessWidget {
  const AeraMetricCard({
    super.key,
    required this.label,
    required this.value,
    this.sublabel,
    this.icon,
    this.badge,
    this.iconColor = AeraColors.accent,
    this.iconBgColor = AeraColors.surfaceSubtle,
    this.valueColor = AeraColors.ink,
    this.onTap,
  });

  final String label;
  final String value;
  final String? sublabel;
  final IconData? icon;
  final Widget? badge;
  final Color iconColor;
  final Color iconBgColor;
  final Color valueColor;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return AeraCard(
      padding: const EdgeInsets.all(14),
      borderRadius: AeraRadii.borderMd,
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                label,
                style: AeraTypography.bodySm.copyWith(
                  fontWeight: FontWeight.w500,
                  color: AeraColors.inkSoft,
                ),
              ),
              if (badge != null)
                badge!
              else if (icon != null)
                Container(
                  width: 24,
                  height: 24,
                  decoration: BoxDecoration(
                    color: iconBgColor,
                    borderRadius: AeraRadii.borderXs,
                  ),
                  child: Icon(icon, size: 14, color: iconColor),
                ),
            ],
          ),
          const SizedBox(height: 10),
          Column(
            crossAxisAlignment: CrossAlignment.start,
            children: [
              Text(
                value,
                style: AeraTypography.money.copyWith(
                  color: valueColor,
                  fontSize: 26,
                ),
              ),
              if (sublabel != null) ...[
                const SizedBox(height: 2),
                Text(
                  sublabel!,
                  style: AeraTypography.bodySm.copyWith(
                    fontSize: 12,
                    color: AeraColors.inkSoft,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}
