import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/ai_repository.dart';

/// The conversation currently open in [AiOperationsAssistantScreen], if any.
/// Session-local only (not persisted) — starting the app always opens to a
/// fresh "ask a question" state, same as the pre-wiring screen did.
final activeAiConversationIdProvider = StateProvider<String?>((ref) => null);

/// Not autoDispose: a conversation viewed once stays cached for the rest of
/// the session, bounded by the number of distinct conversations opened —
/// mirrors `quoteDetailProvider` / `jobDetailProvider`. Sending a message or
/// starting a new conversation explicitly `ref.invalidate`s this.
final aiConversationDetailProvider =
    FutureProvider.family<AiConversationDetail, String>((
      ref,
      conversationId,
    ) async {
      final repo = ref.watch(aiRepositoryProvider);
      return repo.getConversation(conversationId);
    });

/// Recent conversations, shown so a user can resume one instead of always
/// starting fresh. Not autoDispose, same rationale as `quotesListProvider` —
/// invalidated whenever a new conversation is created.
final aiConversationsListProvider = FutureProvider<List<AiConversation>>((
  ref,
) async {
  final repo = ref.watch(aiRepositoryProvider);
  final page = await repo.listConversations(pageSize: 10);
  return page.items;
});
