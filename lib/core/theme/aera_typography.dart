import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import 'aera_colors.dart';

/// Aera Typography Tokens
/// Single source of truth using GoogleFonts.inter matching `docs/design.md`.
abstract final class AeraTypography {
  static TextStyle get display => GoogleFonts.inter(
        fontSize: 36,
        fontWeight: FontWeight.w700,
        height: 1.08,
        letterSpacing: -0.03 * 36,
        color: AeraColors.ink,
      );

  static TextStyle get h1 => GoogleFonts.inter(
        fontSize: 30,
        fontWeight: FontWeight.w700,
        height: 1.12,
        letterSpacing: -0.025 * 30,
        color: AeraColors.ink,
      );

  static TextStyle get h2 => GoogleFonts.inter(
        fontSize: 24,
        fontWeight: FontWeight.w600,
        height: 1.2,
        letterSpacing: -0.02 * 24,
        color: AeraColors.ink,
      );

  static TextStyle get h3 => GoogleFonts.inter(
        fontSize: 18,
        fontWeight: FontWeight.w600,
        height: 1.25,
        letterSpacing: -0.01 * 18,
        color: AeraColors.ink,
      );

  static TextStyle get body => GoogleFonts.inter(
        fontSize: 16,
        fontWeight: FontWeight.w400,
        height: 1.5,
        color: AeraColors.ink,
      );

  static TextStyle get bodyMedium => GoogleFonts.inter(
        fontSize: 14,
        fontWeight: FontWeight.w500,
        height: 1.45,
        color: AeraColors.inkSoft,
      );

  static TextStyle get bodySm => GoogleFonts.inter(
        fontSize: 14,
        fontWeight: FontWeight.w400,
        height: 1.45,
        color: AeraColors.inkSoft,
      );

  static TextStyle get label => GoogleFonts.inter(
        fontSize: 12,
        fontWeight: FontWeight.w600,
        height: 1.25,
        letterSpacing: 0.01 * 12,
        color: AeraColors.inkSoft,
      );

  static TextStyle get labelUpper => GoogleFonts.inter(
        fontSize: 11,
        fontWeight: FontWeight.w700,
        height: 1.2,
        letterSpacing: 0.08 * 11,
        color: AeraColors.inkSoft,
      );

  static TextStyle get money => GoogleFonts.inter(
        fontSize: 28,
        fontWeight: FontWeight.w700,
        height: 1.05,
        letterSpacing: -0.025 * 28,
        color: AeraColors.ink,
      );
}
