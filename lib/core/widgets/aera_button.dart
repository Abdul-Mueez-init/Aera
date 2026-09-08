import 'package:flutter/material.dart';
import '../theme/aera_colors.dart';
import '../theme/aera_radii.dart';
import '../theme/aera_typography.dart';

enum AeraButtonVariant {
  primary,
  secondary,
  outline,
  danger,
}

class AeraButton extends StatelessWidget {
  const AeraButton({
    super.key,
    required this.text,
    this.onPressed,
    this.variant = AeraButtonVariant.primary,
    this.icon,
    this.isLoading = false,
    this.isFullWidth = true,
    this.height = 48.0,
  });

  final String text;
  final VoidCallback? onPressed;
  final AeraButtonVariant variant;
  final Widget? icon;
  final bool isLoading;
  final bool isFullWidth;
  final double height;

  @override
  Widget build(BuildContext context) {
    Color bg;
    Color fg;
    BorderSide border = BorderSide.none;

    switch (variant) {
      case AeraButtonVariant.primary:
        bg = AeraColors.accent;
        fg = AeraColors.surface;
        break;
      case AeraButtonVariant.secondary:
        bg = AeraColors.surfaceSubtle;
        fg = AeraColors.ink;
        break;
      case AeraButtonVariant.outline:
        bg = Colors.transparent;
        fg = AeraColors.ink;
        border = const BorderSide(color: AeraColors.line, width: 1);
        break;
      case AeraButtonVariant.danger:
        bg = AeraColors.dangerSoft;
        fg = AeraColors.danger;
        break;
    }

    if (onPressed == null && !isLoading) {
      bg = bg.withOpacity(0.4);
      fg = fg.withOpacity(0.5);
    }

    Widget content = isLoading
        ? SizedBox(
            height: 20,
            width: 20,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              valueColor: AlwaysStoppedAnimation<Color>(fg),
            ),
          )
        : Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (icon != null) ...[
                icon!,
                const SizedBox(width: 8),
              ],
              Text(
                text,
                style: AeraTypography.bodyMedium.copyWith(
                  color: fg,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          );

    final buttonWidget = Material(
      color: bg,
      shape: RoundedRectangleBorder(
        borderRadius: AeraRadii.borderMd,
        side: border,
      ),
      child: InkWell(
        onTap: (isLoading || onPressed == null) ? null : onPressed,
        borderRadius: AeraRadii.borderMd,
        child: Container(
          height: height,
          padding: const EdgeInsets.symmetric(horizontal: 20),
          alignment: Alignment.center,
          child: content,
        ),
      ),
    );

    if (isFullWidth) {
      return SizedBox(width: double.infinity, child: buttonWidget);
    }
    return buttonWidget;
  }
}
