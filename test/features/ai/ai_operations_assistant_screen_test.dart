import 'package:aera/core/network/api_client.dart';
import 'package:aera/features/ai/ai_operations_assistant_screen.dart';
import 'package:aera/features/ai/data/ai_repository.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeAiRepository extends AiRepository {
  _FakeAiRepository() : super(ApiClient());

  int createCalls = 0;
  int postCalls = 0;

  @override
  Future<AiConversation> createConversation({String? title}) async {
    createCalls++;
    return AiConversation(
      id: 'conv-123',
      title: title ?? 'New Conversation',
      createdAt: DateTime.now(),
      updatedAt: DateTime.now(),
    );
  }

  @override
  Future<AiConversationsPage> listConversations({
    int page = 1,
    int pageSize = 20,
  }) async {
    return AiConversationsPage(
      items: [
        AiConversation(
          id: 'conv-123',
          title: 'Risks summary',
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        ),
      ],
      total: 1,
    );
  }

  @override
  Future<AiTurnResult> postMessage(
    String conversationId,
    String content,
  ) async {
    postCalls++;
    return AiTurnResult(
      userMessage: AiMessage(
        id: 'msg-u1',
        role: 'USER',
        content: content,
        createdAt: DateTime.now(),
      ),
      assistantMessage: AiMessage(
        id: 'msg-a1',
        role: 'ASSISTANT',
        content: 'There is 1 job at risk: JOB-000001 due to unassigned technician.',
        createdAt: DateTime.now(),
        toolCalls: [
          const AiToolCallSummary(
            name: 'get_jobs_at_risk',
            input: {},
          ),
        ],
      ),
    );
  }

  @override
  Future<AiConversationDetail> getConversation(
    String conversationId, {
    int limit = 50,
  }) async {
    return AiConversationDetail(
      conversation: AiConversation(
        id: conversationId,
        title: 'Risks summary',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      ),
      messages: [
        AiMessage(
          id: 'msg-u1',
          role: 'USER',
          content: 'Which jobs are at risk today?',
          createdAt: DateTime.now(),
        ),
        AiMessage(
          id: 'msg-a1',
          role: 'ASSISTANT',
          content: 'There is 1 job at risk: JOB-000001 due to unassigned technician.',
          createdAt: DateTime.now(),
          toolCalls: [
            const AiToolCallSummary(
              name: 'get_jobs_at_risk',
              input: {},
            ),
          ],
        ),
      ],
      messageCount: 2,
      hasMore: false,
    );
  }
}

void main() {
  testWidgets('renders preset questions on empty state', (tester) async {
    final fakeRepo = _FakeAiRepository();

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          aiRepositoryProvider.overrideWithValue(fakeRepo),
        ],
        child: const MaterialApp(home: AiOperationsAssistantScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('AI Operations Assistant'), findsOneWidget);
    expect(find.text('Which jobs are at risk today?'), findsWidgets);
    expect(find.text('Who is running behind schedule?'), findsOneWidget);
    expect(find.text('Give me a business metrics summary.'), findsOneWidget);
  });

  testWidgets('tapping a preset question creates conversation and renders reply with link to job', (
    tester,
  ) async {
    final fakeRepo = _FakeAiRepository();

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          aiRepositoryProvider.overrideWithValue(fakeRepo),
        ],
        child: const MaterialApp(home: AiOperationsAssistantScreen()),
      ),
    );
    await tester.pumpAndSettle();

    // Tap first preset
    await tester.tap(find.text('Which jobs are at risk today?').first);
    await tester.pumpAndSettle();

    expect(fakeRepo.createCalls, 1);
    expect(fakeRepo.postCalls, 1);

    // Verify messages and tool call badge
    expect(find.text('There is 1 job at risk: JOB-000001 due to unassigned technician.'), findsOneWidget);
    expect(find.text('Checked: Jobs at risk'), findsOneWidget);
    // Verify job detail linking chip
    expect(find.text('View JOB-000001'), findsOneWidget);
  });
}
