import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/network/api_response.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_button.dart';
import 'providers/ai_provider.dart';
import 'widgets/ai_message_bubble.dart';

/// Full read-back of one AI conversation.
///
/// The original mock here simulated the assistant recommending and
/// "executing" a job reassignment. The backend has no such capability —
/// ADR-010 and the AI system prompt (gateway.service.ts) are explicit that
/// the model only reports on data and can never mutate a record — so there
/// is nothing for a real "Execute Intervention" button to call. This screen
/// instead shows the real conversation (`GET /ai/conversations/:id`) and
/// hands off to the actual Job Detail screen for any follow-up action,
/// which is what the assistant itself is instructed to tell the user to do.
///
/// The route param is still named `insightId` (app_router.dart) but its
/// value is a conversation id — there is no separate "insight" entity on
/// the backend to key this screen by.
class AiInsightDetailScreen extends ConsumerWidget {
  const AiInsightDetailScreen({super.key, required this.insightId});

  final String insightId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (insightId.isEmpty) {
      return Scaffold(
        backgroundColor: AeraColors.canvas,
        appBar: const AeraAppBar(title: 'AI Analysis'),
        body: _NotFound(onStartNew: () => _startNewConversation(context, ref)),
      );
    }

    final detailAsync = ref.watch(aiConversationDetailProvider(insightId));

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AeraAppBar(
        subtitle: 'AI Analysis',
        title: detailAsync.maybeWhen(
          data: (detail) => detail.conversation.title?.isNotEmpty == true
              ? detail.conversation.title
              : 'Untitled conversation',
          orElse: () => null,
        ),
      ),
      body: detailAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) {
          // A stale/demo link (e.g. the old hardcoded '/ai-insight/ins-1'
          // shortcuts still on the dashboard and screen catalog) or a
          // conversation from another user surfaces as RESOURCE_NOT_FOUND —
          // ai.service.ts reports "not found" for both by design, so IDs
          // can't be probed. Show it as "not found", not a generic error.
          final notFound =
              error is ApiException &&
              (error.statusCode == 404 || error.code == 'RESOURCE_NOT_FOUND');
          if (notFound) {
            return _NotFound(
              onStartNew: () => _startNewConversation(context, ref),
            );
          }
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    error is ApiException
                        ? error.message
                        : 'Could not load this conversation',
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: () =>
                        ref.invalidate(aiConversationDetailProvider(insightId)),
                    child: const Text('Retry'),
                  ),
                ],
              ),
            ),
          );
        },
        data: (detail) {
          return Column(
            children: [
              Expanded(
                child: ListView.separated(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 12,
                  ),
                  itemCount: detail.messages.length + 1,
                  separatorBuilder: (_, __) => const SizedBox(height: 12),
                  itemBuilder: (context, index) {
                    if (index == 0) {
                      return Text(
                        'Started ${DateFormat('MMM d, h:mm a').format(detail.conversation.createdAt)}'
                        '${detail.hasMore ? ' · earlier messages not shown' : ''}',
                        style: AeraTypography.label.copyWith(
                          color: AeraColors.inkSoft,
                        ),
                      );
                    }
                    return AiMessageBubble(message: detail.messages[index - 1]);
                  },
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                child: Column(
                  children: [
                    AeraButton(
                      text: 'Continue Conversation',
                      icon: const Icon(
                        Icons.chat_bubble_outline,
                        size: 18,
                        color: Colors.white,
                      ),
                      onPressed: () {
                        ref
                                .read(activeAiConversationIdProvider.notifier)
                                .state =
                            insightId;
                        context.push('/ai-assistant');
                      },
                    ),
                    const SizedBox(height: 8),
                    OutlinedButton(
                      onPressed: () => context.pop(),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(48),
                        side: const BorderSide(color: AeraColors.line),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      child: const Text(
                        'Close',
                        style: TextStyle(color: AeraColors.inkSoft),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  void _startNewConversation(BuildContext context, WidgetRef ref) {
    ref.read(activeAiConversationIdProvider.notifier).state = null;
    context.push('/ai-assistant');
  }
}

class _NotFound extends StatelessWidget {
  const _NotFound({required this.onStartNew});

  final VoidCallback onStartNew;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.search_off, size: 36, color: AeraColors.outline),
            const SizedBox(height: 10),
            Text(
              'This conversation could not be found.',
              style: AeraTypography.body.copyWith(fontWeight: FontWeight.w600),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 4),
            Text(
              'It may have been opened from an out-of-date link.',
              style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            AeraButton(
              text: 'Start New Conversation',
              isFullWidth: false,
              onPressed: onStartNew,
            ),
          ],
        ),
      ),
    );
  }
}
