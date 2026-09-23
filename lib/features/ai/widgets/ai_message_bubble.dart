import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../../core/theme/aera_colors.dart';
import '../../../core/theme/aera_typography.dart';
import '../data/ai_repository.dart';

/// Renders one [AiMessage] as a chat bubble. Shared by
/// [AiOperationsAssistantScreen] and [AiInsightDetailScreen] so a
/// conversation looks identical whether you're mid-chat or reviewing it
/// afterwards.
class AiMessageBubble extends StatelessWidget {
  const AiMessageBubble({super.key, required this.message});

  final AiMessage message;

  @override
  Widget build(BuildContext context) {
    return message.isUser ? _userBubble() : _assistantBubble();
  }

  Widget _userBubble() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.end,
      children: [
        Flexible(
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AeraColors.surfaceSubtle,
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(14),
                topRight: Radius.circular(4),
                bottomLeft: Radius.circular(14),
                bottomRight: Radius.circular(14),
              ),
              border: Border.all(color: AeraColors.line),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  DateFormat('MMM d, h:mm a').format(message.createdAt),
                  style: AeraTypography.label.copyWith(
                    color: AeraColors.inkSoft,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  message.content,
                  style: AeraTypography.body.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(width: 8),
        const CircleAvatar(
          radius: 14,
          backgroundColor: AeraColors.accentSoft,
          child: Icon(Icons.person, size: 16, color: AeraColors.accent),
        ),
      ],
    );
  }

  Widget _assistantBubble() {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 28,
          height: 28,
          decoration: BoxDecoration(
            color: AeraColors.accent,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Center(
            child: Text(
              'A',
              style: AeraTypography.bodySm.copyWith(
                color: AeraColors.surface,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AeraColors.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AeraColors.line),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  message.content.isEmpty
                      ? 'No response text was returned.'
                      : message.content,
                  style: AeraTypography.bodySm.copyWith(color: AeraColors.ink),
                ),
                if (message.toolCalls.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: message.toolCalls
                        .map(
                          (call) => Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 3,
                            ),
                            decoration: BoxDecoration(
                              color: AeraColors.surfaceSubtle,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(
                                  Icons.fact_check,
                                  size: 12,
                                  color: AeraColors.inkSoft,
                                ),
                                const SizedBox(width: 4),
                                Text(
                                  'Checked: ${call.label}',
                                  style: AeraTypography.label,
                                ),
                              ],
                            ),
                          ),
                        )
                        .toList(),
                  ),
                ],
                if (message.degraded) ...[
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      const Icon(
                        Icons.info_outline,
                        size: 13,
                        color: AeraColors.warning,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        'Answered with limited data',
                        style: AeraTypography.label.copyWith(
                          color: AeraColors.warning,
                        ),
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: 4),
                Text(
                  DateFormat('MMM d, h:mm a').format(message.createdAt),
                  style: AeraTypography.label.copyWith(
                    color: AeraColors.outline,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
