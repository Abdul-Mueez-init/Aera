import 'package:flutter/material.dart';
import 'aera_colors.dart';
import 'aera_radii.dart';
import 'aera_typography.dart';

abstract final class AeraTheme {
  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      scaffoldBackgroundColor: AeraColors.canvas,
      colorScheme: const ColorScheme(
        brightness: Brightness.light,
        primary: AeraColors.accent,
        onPrimary: AeraColors.surface,
        primaryContainer: AeraColors.accentSoft,
        onPrimaryContainer: AeraColors.accentDeep,
        secondary: AeraColors.inkSoft,
        onSecondary: AeraColors.surface,
        secondaryContainer: AeraColors.surfaceSubtle,
        onSecondaryContainer: AeraColors.ink,
        error: AeraColors.danger,
        onError: AeraColors.surface,
        errorContainer: AeraColors.dangerSoft,
        onErrorContainer: AeraColors.danger,
        surface: AeraColors.surface,
        onSurface: AeraColors.ink,
        onSurfaceVariant: AeraColors.inkSoft,
        outline: AeraColors.line,
        outlineVariant: AeraColors.surfaceContainerHigh,
      ),
      fontFamily: 'Inter',
      textTheme: TextTheme(
        displayLarge: AeraTypography.display,
        headlineLarge: AeraTypography.h1,
        headlineMedium: AeraTypography.h2,
        headlineSmall: AeraTypography.h3,
        bodyLarge: AeraTypography.body,
        bodyMedium: AeraTypography.bodyMedium,
        bodySmall: AeraTypography.bodySm,
        labelLarge: AeraTypography.label,
        labelMedium: AeraTypography.labelUpper,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        iconTheme: const IconThemeData(color: AeraColors.ink),
        titleTextStyle: AeraTypography.h3,
      ),
      cardTheme: CardThemeData(
        color: AeraColors.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: AeraRadii.borderLg,
          side: const BorderSide(color: AeraColors.line, width: 1),
        ),
      ),
      dividerTheme: const DividerThemeData(
        color: AeraColors.line,
        thickness: 1,
        space: 1,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AeraColors.surface,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: AeraRadii.borderMd,
          borderSide: const BorderSide(color: AeraColors.line, width: 1),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: AeraRadii.borderMd,
          borderSide: const BorderSide(color: AeraColors.line, width: 1),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: AeraRadii.borderMd,
          borderSide: const BorderSide(color: AeraColors.accent, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: AeraRadii.borderMd,
          borderSide: const BorderSide(color: AeraColors.danger, width: 1),
        ),
        labelStyle: AeraTypography.bodySm,
        hintStyle: AeraTypography.bodySm.copyWith(color: AeraColors.outline),
      ),
    );
  }
}
