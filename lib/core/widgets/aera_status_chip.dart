import 'package:flutter/material.dart';
import '../theme/aera_colors.dart';
import '../theme/aera_radii.dart';
import '../theme/aera_typography.dart';

enum AeraStatusType {
  newStatus,
  inProgress,
  enRoute,
  scheduled,
  completed,
  atRisk,
  alert,
  paid,
  pending,
  neutral,
  success,
  warning,
  danger,
  info,
}

class AeraStatusChip extends StatelessWidget {
  const AeraStatusChip({
    super.key,
    required this.label,
    this.type = AeraStatusType.neutral,
    this.icon,
    this.showDot = false,
  });

  final String label;
  final AeraStatusType type;
  final IconData? icon;
  final bool showDot;

  @override
  Widget build(BuildContext context) {
    Color bg;
    Color fg;
    Color dotColor;

    switch (type) {
      case AeraStatusType.newStatus:
      case AeraStatusType.info:
        bg = AeraColors.infoSoft;
        fg = AeraColors.info;
        dotColor = AeraColors.info;
        break;
      case AeraStatusType.inProgress:
      case AeraStatusType.enRoute:
        bg = AeraColors.accentSoft;
        fg = AeraColors.accent;
        dotColor = AeraColors.accent;
        break;
      case AeraStatusType.scheduled:
      case AeraStatusType.neutral:
        bg = AeraColors.surfaceSubtle;
        fg = AeraColors.inkSoft;
        dotColor = AeraColors.inkSoft;
        break;
      case AeraStatusType.completed:
      case AeraStatusType.paid:
      case AeraStatusType.success:
        bg = AeraColors.successSoft;
        fg = AeraColors.success;
        dotColor = AeraColors.success;
        break;
      case AeraStatusType.atRisk:
      case AeraStatusType.alert:
      case AeraStatusType.warning:
      case AeraStatusType.pending:
        bg = AeraColors.warningSoft;
        fg = AeraColors.warning;
        dotColor = AeraColors.warning;
        break;
      case AeraStatusType.danger:
        bg = AeraColors.dangerSoft;
        fg = AeraColors.danger;
        dotColor = AeraColors.danger;
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: AeraRadii.borderFull,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          if (showDot) ...[
            Container(
              width: 6,
              height: 6,
              decoration: BoxDecoration(
                color: dotColor,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 5),
          ] else if (icon != null) ...[
            Icon(icon, size: 12, color: fg),
            const SizedBox(width: 4),
          ],
          Text(
            label.toUpperCase(),
            style: AeraTypography.labelUpper.copyWith(
              color: fg,
              fontSize: 10,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}
