import 'package:flutter/material.dart';

/// Aera Design System Colors
/// Single source of truth matching `docs/design.md` and Stitch `DESIGN.md`.
abstract final class AeraColors {
  // Brand & Core Base
  static const Color ink = Color(0xFF151917);
  static const Color inkSoft = Color(0xFF343B37);
  static const Color canvas = Color(0xFFF6F5F1);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color surfaceSubtle = Color(0xFFEEF0EC);
  static const Color line = Color(0xFFDCE0DB);

  // Accents (Deep Teal / Field Operations)
  static const Color accent = Color(0xFF1E5A58);
  static const Color accentSoft = Color(0xFFE0EEEB);
  static const Color accentDeep = Color(0xFF12403F);

  // Semantics
  static const Color success = Color(0xFF2F7D5A);
  static const Color successSoft = Color(0xFFE5F2EA);
  static const Color warning = Color(0xFF9A6A22);
  static const Color warningSoft = Color(0xFFF8EEDB);
  static const Color danger = Color(0xFFA84A46);
  static const Color dangerSoft = Color(0xFFF7E8E7);
  static const Color info = Color(0xFF4D6882);
  static const Color infoSoft = Color(0xFFE9EFF5);
  static const Color scrim = Color(0xFF151917);

  // Surface Containers (Quiet Depth Hierarchy)
  static const Color surfaceDim = Color(0xFFD8DBD7);
  static const Color surfaceBright = Color(0xFFF7FAF6);
  static const Color surfaceContainerLowest = Color(0xFFFFFFFF);
  static const Color surfaceContainerLow = Color(0xFFF1F4F1);
  static const Color surfaceContainer = Color(0xFFECEFEB);
  static const Color surfaceContainerHigh = Color(0xFFE6E9E5);
  static const Color surfaceContainerHighest = Color(0xFFE0E3E0);

  // Material 3 Mappings
  static const Color primary = Color(0xFF004240);
  static const Color onPrimary = Color(0xFFFFFFFF);
  static const Color primaryContainer = Color(0xFF1E5A58);
  static const Color onPrimaryContainer = Color(0xFF96CFCC);
  static const Color primaryFixed = Color(0xFFB3EDEA);
  static const Color primaryFixedDim = Color(0xFF97D1CE);

  static const Color secondary = Color(0xFF59605B);
  static const Color onSecondary = Color(0xFFFFFFFF);
  static const Color secondaryContainer = Color(0xFFDAE1DB);
  static const Color onSecondaryContainer = Color(0xFF5D6460);
  static const Color secondaryFixed = Color(0xFFDDE4DE);

  static const Color tertiary = Color(0xFF5A2F19);
  static const Color onTertiary = Color(0xFFFFFFFF);
  static const Color tertiaryContainer = Color(0xFF75452E);
  static const Color onTertiaryContainer = Color(0xFFF7B598);

  static const Color onSurface = Color(0xFF181C1A);
  static const Color onSurfaceVariant = Color(0xFF404848);
  static const Color outline = Color(0xFF707978);
  static const Color outlineVariant = Color(0xFFBFC8C7);
  static const Color inverseSurface = Color(0xFF2D312F);
  static const Color inverseOnSurface = Color(0xFFEEF2EE);
  static const Color background = Color(0xFFF7FAF6);
  static const Color onBackground = Color(0xFF181C1A);
}
