import 'package:flutter/material.dart';

import '../theme/aera_colors.dart';
import '../theme/aera_radii.dart';
import '../theme/aera_typography.dart';

/// Shows a small "type some text" dialog and returns the trimmed text, or
/// null when the user cancels.
///
/// The [TextEditingController] is owned by the dialog's own [State] and is
/// disposed only when the dialog route is fully gone. Disposing a controller
/// created by the caller (right after `showDialog` returns, or inside a
/// button handler before `Navigator.pop`) leaves the TextField alive for the
/// dialog's exit animation, which throws "A TextEditingController was used
/// after being disposed" and cascades into layout/overlay assertions.
Future<String?> showTextPromptDialog(
  BuildContext context, {
  required String title,
  required String hintText,
  required String confirmLabel,
  String? message,
  int minLength = 1,
  int? maxLength,
  int maxLines = 3,
  bool autofocus = false,
}) {
  return showDialog<String>(
    context: context,
    builder: (dialogContext) => _TextPromptDialog(
      title: title,
      hintText: hintText,
      confirmLabel: confirmLabel,
      message: message,
      minLength: minLength,
      maxLength: maxLength,
      maxLines: maxLines,
      autofocus: autofocus,
    ),
  );
}

class _TextPromptDialog extends StatefulWidget {
  const _TextPromptDialog({
    required this.title,
    required this.hintText,
    required this.confirmLabel,
    required this.minLength,
    required this.maxLines,
    required this.autofocus,
    this.message,
    this.maxLength,
  });

  final String title;
  final String hintText;
  final String confirmLabel;
  final String? message;
  final int minLength;
  final int? maxLength;
  final int maxLines;
  final bool autofocus;

  @override
  State<_TextPromptDialog> createState() => _TextPromptDialogState();
}

class _TextPromptDialogState extends State<_TextPromptDialog> {
  final TextEditingController _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  bool _isValid(String raw) {
    final length = raw.trim().length;
    if (length < widget.minLength) return false;
    final max = widget.maxLength;
    return max == null || length <= max;
  }

  @override
  Widget build(BuildContext context) {
    final message = widget.message;
    return AlertDialog(
      backgroundColor: AeraColors.surface,
      shape: RoundedRectangleBorder(borderRadius: AeraRadii.borderLg),
      title: Text(widget.title, style: AeraTypography.h3.copyWith(fontSize: 17)),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (message != null) ...[
            Text(message, style: AeraTypography.bodySm),
            const SizedBox(height: 12),
          ],
          TextField(
            controller: _controller,
            maxLength: widget.maxLength,
            maxLines: widget.maxLines,
            autofocus: widget.autofocus,
            decoration: InputDecoration(hintText: widget.hintText),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(
            'Cancel',
            style: AeraTypography.bodyMedium.copyWith(
              color: AeraColors.inkSoft,
            ),
          ),
        ),
        ValueListenableBuilder<TextEditingValue>(
          valueListenable: _controller,
          builder: (context, value, _) {
            final valid = _isValid(value.text);
            return TextButton(
              onPressed: valid
                  ? () => Navigator.of(context).pop(value.text.trim())
                  : null,
              child: Text(
                widget.confirmLabel,
                style: AeraTypography.bodyMedium.copyWith(
                  color: valid ? AeraColors.accent : AeraColors.inkSoft,
                  fontWeight: FontWeight.w700,
                ),
              ),
            );
          },
        ),
      ],
    );
  }
}
