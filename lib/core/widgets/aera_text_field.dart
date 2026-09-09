import 'package:flutter/material.dart';
import '../theme/aera_colors.dart';
import '../theme/aera_radii.dart';
import '../theme/aera_typography.dart';

class AeraTextField extends StatelessWidget {
  const AeraTextField({
    super.key,
    this.label,
    this.hintText,
    this.controller,
    this.onChanged,
    this.obscureText = false,
    this.keyboardType,
    this.prefixIcon,
    this.suffixIcon,
    this.maxLines = 1,
    this.validator,
    this.readOnly = false,
    this.onTap,
  });

  final String? label;
  final String? hintText;
  final TextEditingController? controller;
  final ValueChanged<String>? onChanged;
  final bool obscureText;
  final TextInputType? keyboardType;
  final Widget? prefixIcon;
  final Widget? suffixIcon;
  final int maxLines;
  final FormFieldValidator<String>? validator;
  final bool readOnly;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (label != null) ...[
          Text(
            label!,
            style: AeraTypography.label.copyWith(
              color: AeraColors.inkSoft,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 6),
        ],
        TextFormField(
          controller: controller,
          onChanged: onChanged,
          obscureText: obscureText,
          keyboardType: keyboardType,
          maxLines: maxLines,
          validator: validator,
          readOnly: readOnly,
          onTap: onTap,
          style: AeraTypography.body.copyWith(
            fontSize: 15,
            color: AeraColors.ink,
          ),
          decoration: InputDecoration(
            hintText: hintText,
            hintStyle: AeraTypography.bodySm.copyWith(
              color: AeraColors.outline,
            ),
            prefixIcon: prefixIcon,
            suffixIcon: suffixIcon,
            filled: true,
            fillColor: AeraColors.surface,
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 14,
            ),
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
          ),
        ),
      ],
    );
  }
}
