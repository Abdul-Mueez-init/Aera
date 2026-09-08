import 'package:flutter/material.dart';
import '../theme/aera_colors.dart';
import '../theme/aera_typography.dart';

class AeraAppBar extends StatelessWidget implements PreferredSizeWidget {
  const AeraAppBar({
    super.key,
    this.title,
    this.subtitle,
    this.showBrand = false,
    this.showBack = true,
    this.onBack,
    this.actions,
  });

  final String? title;
  final String? subtitle;
  final bool showBrand;
  final bool showBack;
  final VoidCallback? onBack;
  final List<Widget>? actions;

  @override
  Size get preferredSize => const Size.fromHeight(60);

  @override
  Widget build(BuildContext context) {
    final canPop = Navigator.of(context).canPop();

    return AppBar(
      backgroundColor: AeraColors.surface.withOpacity(0.85),
      elevation: 0,
      scrolledUnderElevation: 1,
      centerTitle: false,
      leading: (showBack && canPop)
          ? IconButton(
              icon: const Icon(Icons.arrow_back_ios_new, size: 18, color: AeraColors.ink),
              onPressed: onBack ?? () => Navigator.of(context).maybePop(),
            )
          : null,
      title: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (showBrand) ...[
            Container(
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                color: AeraColors.accent,
                borderRadius: BorderRadius.circular(6),
              ),
              child: const Icon(Icons.ac_unit, color: Colors.white, size: 16),
            ),
            const SizedBox(width: 10),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (subtitle != null) ...[
                  Text(
                    subtitle!.toUpperCase(),
                    style: AeraTypography.labelUpper.copyWith(
                      fontSize: 10,
                      color: AeraColors.inkSoft,
                    ),
                  ),
                  const SizedBox(height: 1),
                ],
                if (title != null)
                  Text(
                    title!,
                    style: AeraTypography.h3.copyWith(
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                      color: AeraColors.ink,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
              ],
            ),
          ),
        ],
      ),
      actions: actions != null
          ? [
              ...actions!,
              const SizedBox(width: 8),
            ]
          : null,
    );
  }
}
