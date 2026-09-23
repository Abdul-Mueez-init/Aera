import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';

final aiRepositoryProvider = Provider<AiRepository>((ref) {
  final client = ref.watch(apiClientProvider);
  return AiRepository(client);
});

/// One AI conversation thread. `title` is null until the server derives one
/// from the first user message (ai.service.ts `deriveConversationTitle`).
class AiConversation {
  const AiConversation({
    required this.id,
    this.title,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String? title;
  final DateTime createdAt;
  final DateTime updatedAt;

  factory AiConversation.fromJson(Map<String, dynamic> json) => AiConversation(
    id: json['id'] as String,
    title: json['title'] as String?,
    createdAt:
        DateTime.tryParse(json['createdAt'] as String? ?? '') ?? DateTime.now(),
    updatedAt:
        DateTime.tryParse(json['updatedAt'] as String? ?? '') ?? DateTime.now(),
  );
}

/// Which tool the model called and with what input. The server never sends
/// the tool's *output* to the client (ai.service.ts: TOOL-role messages are
/// internal-only) — this is a transparency trail, not a data source. Render
/// it as "checked X", never as structured facts to display on their own.
class AiToolCallSummary {
  const AiToolCallSummary({required this.name, required this.input});

  final String name;
  final Map<String, dynamic> input;

  factory AiToolCallSummary.fromJson(Map<String, dynamic> json) =>
      AiToolCallSummary(
        name: json['name'] as String? ?? '',
        input: (json['input'] as Map<String, dynamic>?) ?? const {},
      );

  /// Human-readable label for the fixed Slice C tool set
  /// (backend/src/modules/ai/tools/index.ts). Falls back to the raw name
  /// for a tool added later that this client doesn't know about yet.
  String get label {
    switch (name) {
      case 'get_jobs_at_risk':
        return 'Jobs at risk';
      case 'get_customer_job_history':
        return 'Customer history';
      case 'get_schedule_workload':
        return 'Schedule workload';
      case 'get_business_metrics':
        return 'Business metrics';
      default:
        return name;
    }
  }
}

class AiMessage {
  const AiMessage({
    required this.id,
    required this.role,
    required this.content,
    required this.createdAt,
    this.toolCalls = const [],
    this.degraded = false,
  });

  final String id;

  /// "USER" or "ASSISTANT" — the only roles the API ever returns to a
  /// client (ai.service.ts `CLIENT_VISIBLE_ROLES`; TOOL messages are
  /// filtered server-side).
  final String role;
  final String content;
  final DateTime createdAt;
  final List<AiToolCallSummary> toolCalls;

  /// True if the assistant's turn ran in a degraded mode (see
  /// ai-gateway.service.ts). Shown as a small caveat, never hidden.
  final bool degraded;

  bool get isUser => role == 'USER';

  factory AiMessage.fromJson(Map<String, dynamic> json) {
    final metadata = json['metadata'] as Map<String, dynamic>?;
    final rawToolCalls = metadata?['toolCalls'] as List<dynamic>?;
    return AiMessage(
      id: json['id'] as String,
      role: json['role'] as String? ?? 'ASSISTANT',
      content: json['content'] as String? ?? '',
      createdAt:
          DateTime.tryParse(json['createdAt'] as String? ?? '') ??
          DateTime.now(),
      toolCalls:
          rawToolCalls
              ?.map(
                (t) => AiToolCallSummary.fromJson(t as Map<String, dynamic>),
              )
              .toList() ??
          const [],
      degraded: metadata?['degraded'] as bool? ?? false,
    );
  }
}

class AiConversationDetail {
  const AiConversationDetail({
    required this.conversation,
    required this.messages,
    required this.messageCount,
    required this.hasMore,
  });

  final AiConversation conversation;
  final List<AiMessage> messages;
  final int messageCount;

  /// True if there is older history beyond the bounded page this response
  /// returned (ai.service.ts never returns an unbounded list).
  final bool hasMore;

  factory AiConversationDetail.fromJson(Map<String, dynamic> json) =>
      AiConversationDetail(
        conversation: AiConversation.fromJson(
          json['conversation'] as Map<String, dynamic>,
        ),
        messages:
            (json['messages'] as List<dynamic>?)
                ?.map((m) => AiMessage.fromJson(m as Map<String, dynamic>))
                .toList() ??
            const [],
        messageCount: (json['meta']?['messageCount'] as int?) ?? 0,
        hasMore: (json['meta']?['hasMore'] as bool?) ?? false,
      );
}

class AiConversationsPage {
  const AiConversationsPage({required this.items, required this.total});

  final List<AiConversation> items;
  final int total;

  factory AiConversationsPage.fromJson(Map<String, dynamic> json) =>
      AiConversationsPage(
        items:
            (json['items'] as List<dynamic>?)
                ?.map((c) => AiConversation.fromJson(c as Map<String, dynamic>))
                .toList() ??
            const [],
        total: (json['meta']?['total'] as int?) ?? 0,
      );
}

/// Result of posting a user message. `assistantMessage` is null when the AI
/// gateway didn't respond (e.g. GEMINI_API_KEY not configured, or the
/// upstream call failed) — the user's message is still saved in that case,
/// it just has no reply yet (ai.service.ts `runAssistantTurn`).
class AiTurnResult {
  const AiTurnResult({required this.userMessage, this.assistantMessage});

  final AiMessage userMessage;
  final AiMessage? assistantMessage;

  factory AiTurnResult.fromJson(Map<String, dynamic> json) => AiTurnResult(
    userMessage: AiMessage.fromJson(
      json['userMessage'] as Map<String, dynamic>,
    ),
    assistantMessage: json['assistantMessage'] != null
        ? AiMessage.fromJson(json['assistantMessage'] as Map<String, dynamic>)
        : null,
  );
}

class AiRepository {
  AiRepository(this._client);

  final ApiClient _client;

  Future<AiConversation> createConversation({String? title}) async {
    final res = await _client.post(
      '/api/v1/ai/conversations',
      body: {if (title != null && title.isNotEmpty) 'title': title},
    );
    return AiConversation.fromJson(res as Map<String, dynamic>);
  }

  Future<AiConversationsPage> listConversations({
    int page = 1,
    int pageSize = 20,
  }) async {
    final res = await _client.get(
      '/api/v1/ai/conversations',
      queryParameters: {'page': '$page', 'pageSize': '$pageSize'},
    );
    return AiConversationsPage.fromJson(res as Map<String, dynamic>);
  }

  Future<AiConversationDetail> getConversation(
    String conversationId, {
    int limit = 50,
  }) async {
    final res = await _client.get(
      '/api/v1/ai/conversations/$conversationId',
      queryParameters: {'limit': '$limit'},
    );
    return AiConversationDetail.fromJson(res as Map<String, dynamic>);
  }

  Future<AiTurnResult> postMessage(
    String conversationId,
    String content,
  ) async {
    final res = await _client.post(
      '/api/v1/ai/conversations/$conversationId/messages',
      body: {'content': content},
    );
    return AiTurnResult.fromJson(res as Map<String, dynamic>);
  }
}
