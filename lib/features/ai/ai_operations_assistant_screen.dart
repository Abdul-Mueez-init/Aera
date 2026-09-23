import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/network/api_response.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import 'data/ai_repository.dart';
import 'providers/ai_provider.dart';
import 'widgets/ai_message_bubble.dart';

// Sentinel timestamp for the `orElse` fallback in `_ConversationThread` below
// — never rendered, since that fallback message's id is always empty and
// display is gated on a non-empty id.
final DateTime _epoch = DateTime.fromMillisecondsSinceEpoch(0);

class AiOperationsAssistantScreen extends ConsumerStatefulWidget {
  const AiOperationsAssistantScreen({super.key});

  @override
  ConsumerState<AiOperationsAssistantScreen> createState() =>
      _AiOperationsAssistantScreenState();
}

class _AiOperationsAssistantScreenState
    extends ConsumerState<AiOperationsAssistantScreen> {
  final TextEditingController _queryController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  bool _sending = false;

  static const _presets = [
    'Which jobs are at risk today?',
    'Who is running behind schedule?',
    'What does my team\'s workload look like today?',
    'Give me a business metrics summary.',
  ];

  @override
  void dispose() {
    _queryController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) return;
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    });
  }

  Future<void> _send(String text) async {
    final content = text.trim();
    if (content.isEmpty || _sending) return;

    setState(() => _sending = true);
    final repo = ref.read(aiRepositoryProvider);
    final conversationIdNotifier = ref.read(
      activeAiConversationIdProvider.notifier,
    );

    try {
      var conversationId = ref.read(activeAiConversationIdProvider);
      final isNewConversation = conversationId == null;
      if (isNewConversation) {
        final conversation = await repo.createConversation();
        conversationId = conversation.id;
        conversationIdNotifier.state = conversationId;
      }

      _queryController.clear();
      final result = await repo.postMessage(conversationId, content);
      ref.invalidate(aiConversationDetailProvider(conversationId));
      if (isNewConversation) {
        ref.invalidate(aiConversationsListProvider);
      }
      _scrollToBottom();

      if (result.assistantMessage == null && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Your message was saved, but the assistant did not reply '
              '(it may not be configured yet).',
            ),
          ),
        );
      }
    } on ApiException catch (e) {
      if (mounted) {
        final message = e.statusCode == 403
            ? 'The AI assistant is available to owners and dispatchers only.'
            : e.message;
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(message)));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not send that message')),
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _startNewConversation() {
    ref.read(activeAiConversationIdProvider.notifier).state = null;
  }

  void _resumeConversation(String conversationId) {
    ref.read(activeAiConversationIdProvider.notifier).state = conversationId;
    _scrollToBottom();
  }

  @override
  Widget build(BuildContext context) {
    final conversationId = ref.watch(activeAiConversationIdProvider);

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: AeraColors.accent,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Center(
                child: Text(
                  'A',
                  style: AeraTypography.h3.copyWith(color: AeraColors.surface),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'AERA INTELLIGENCE',
                  style: AeraTypography.labelUpper.copyWith(fontSize: 10),
                ),
                Text(
                  'AI Operations Assistant',
                  style: AeraTypography.body.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ],
        ),
        actions: [
          if (conversationId != null)
            IconButton(
              icon: const Icon(Icons.add_comment_outlined),
              tooltip: 'New conversation',
              onPressed: _startNewConversation,
            ),
          IconButton(
            icon: const Icon(Icons.apps),
            tooltip: 'Screen Catalog',
            onPressed: () => Scaffold.of(context).openEndDrawer(),
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: conversationId == null
                ? _EmptyState(
                    presets: _presets,
                    onPresetTap: _send,
                    onResume: _resumeConversation,
                  )
                : _ConversationThread(
                    conversationId: conversationId,
                    scrollController: _scrollController,
                  ),
          ),
          _InputBar(
            controller: _queryController,
            sending: _sending,
            onSubmit: _send,
          ),
        ],
      ),
    );
  }
}

class _EmptyState extends ConsumerWidget {
  const _EmptyState({
    required this.presets,
    required this.onPresetTap,
    required this.onResume,
  });

  final List<String> presets;
  final ValueChanged<String> onPresetTap;
  final ValueChanged<String> onResume;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final recent = ref.watch(aiConversationsListProvider);

    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      children: [
        const SizedBox(height: 12),
        Icon(Icons.auto_awesome, size: 32, color: AeraColors.accent),
        const SizedBox(height: 10),
        Text(
          'Ask Aera about jobs, schedule, or your team\'s workload today.',
          style: AeraTypography.body.copyWith(fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 16),
        Text(
          'TRY ASKING',
          style: AeraTypography.labelUpper.copyWith(color: AeraColors.inkSoft),
        ),
        const SizedBox(height: 8),
        ...presets.map(
          (preset) => Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: InkWell(
              onTap: () => onPresetTap(preset),
              borderRadius: BorderRadius.circular(10),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(
                  horizontal: 14,
                  vertical: 12,
                ),
                decoration: BoxDecoration(
                  color: AeraColors.surface,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AeraColors.line),
                ),
                child: Row(
                  children: [
                    Expanded(child: Text(preset, style: AeraTypography.bodySm)),
                    const Icon(
                      Icons.chevron_right,
                      size: 16,
                      color: AeraColors.outline,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
        recent.when(
          loading: () => const SizedBox.shrink(),
          error: (_, __) => const SizedBox.shrink(),
          data: (conversations) {
            if (conversations.isEmpty) return const SizedBox.shrink();
            return Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'RECENT CONVERSATIONS',
                    style: AeraTypography.labelUpper.copyWith(
                      color: AeraColors.inkSoft,
                    ),
                  ),
                  const SizedBox(height: 8),
                  ...conversations.map(
                    (c) => Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: InkWell(
                        onTap: () => onResume(c.id),
                        borderRadius: BorderRadius.circular(10),
                        child: Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 10,
                          ),
                          decoration: BoxDecoration(
                            color: AeraColors.surfaceSubtle,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Row(
                            children: [
                              const Icon(
                                Icons.chat_bubble_outline,
                                size: 15,
                                color: AeraColors.inkSoft,
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  c.title?.isNotEmpty == true
                                      ? c.title!
                                      : 'Untitled conversation',
                                  style: AeraTypography.bodySm,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        ),
      ],
    );
  }
}

class _ConversationThread extends ConsumerWidget {
  const _ConversationThread({
    required this.conversationId,
    required this.scrollController,
  });

  final String conversationId;
  final ScrollController scrollController;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detailAsync = ref.watch(aiConversationDetailProvider(conversationId));

    return detailAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => Center(
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
                onPressed: () => ref.invalidate(
                  aiConversationDetailProvider(conversationId),
                ),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      ),
      data: (detail) {
        final messages = detail.messages;
        final lastAssistantWithTools = messages.lastWhere(
          (m) => !m.isUser && m.toolCalls.isNotEmpty,
          orElse: () => AiMessage(
            id: '',
            role: 'ASSISTANT',
            content: '',
            createdAt: _epoch,
          ),
        );

        return ListView.separated(
          controller: scrollController,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          itemCount: messages.length,
          separatorBuilder: (_, __) => const SizedBox(height: 12),
          itemBuilder: (context, index) {
            final message = messages[index];
            final showFullAnalysisLink =
                message.id.isNotEmpty &&
                message.id == lastAssistantWithTools.id;

            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                AiMessageBubble(message: message),
                if (showFullAnalysisLink)
                  Padding(
                    padding: const EdgeInsets.only(top: 4, left: 36),
                    child: Align(
                      alignment: Alignment.centerLeft,
                      child: TextButton(
                        style: TextButton.styleFrom(
                          padding: const EdgeInsets.symmetric(horizontal: 4),
                          minimumSize: Size.zero,
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                        onPressed: () =>
                            context.push('/ai-insight/$conversationId'),
                        child: const Text('View full analysis'),
                      ),
                    ),
                  ),
              ],
            );
          },
        );
      },
    );
  }
}

class _InputBar extends StatelessWidget {
  const _InputBar({
    required this.controller,
    required this.sending,
    required this.onSubmit,
  });

  final TextEditingController controller;
  final bool sending;
  final ValueChanged<String> onSubmit;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: const BoxDecoration(
        color: AeraColors.surface,
        border: Border(top: BorderSide(color: AeraColors.line)),
      ),
      child: SafeArea(
        child: Row(
          children: [
            Expanded(
              child: Container(
                height: 44,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                decoration: BoxDecoration(
                  color: AeraColors.canvas,
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(color: AeraColors.line),
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.auto_awesome,
                      size: 18,
                      color: AeraColors.accent,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextField(
                        controller: controller,
                        enabled: !sending,
                        style: AeraTypography.bodySm,
                        decoration: InputDecoration(
                          hintText:
                              'Ask Aera anything about jobs, techs, revenue...',
                          hintStyle: AeraTypography.bodySm.copyWith(
                            color: AeraColors.outline,
                          ),
                          border: InputBorder.none,
                          isDense: true,
                        ),
                        onSubmitted: onSubmit,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filled(
              style: IconButton.styleFrom(backgroundColor: AeraColors.accent),
              icon: sending
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        valueColor: AlwaysStoppedAnimation<Color>(
                          AeraColors.surface,
                        ),
                      ),
                    )
                  : const Icon(
                      Icons.arrow_upward,
                      size: 20,
                      color: AeraColors.surface,
                    ),
              onPressed: sending ? null : () => onSubmit(controller.text),
            ),
          ],
        ),
      ),
    );
  }
}
