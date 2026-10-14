import 'package:aera/core/network/api_client.dart';
import 'package:aera/core/network/api_response.dart';
import 'package:aera/features/ai/ai_insight_detail_screen.dart';
import 'package:aera/features/ai/data/ai_repository.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeAiDetailRepo extends AiRepository {
  _FakeAiDetailRepo({this.error, this.detail}) : super(ApiClient());

  final Object? error;
  final AiConversationDetail? detail;

  @override
  Future<AiConversationDetail> getConversation(
    String conversationId, {
    int limit = 50,
  }) async {
    if (error != null) throw error!;
    return detail!;
  }
}

void main() {
  testWidgets('renders conversation detail and links to referenced job', (
    tester,
  ) async {
    final detail = AiConversationDetail(
      conversation: AiConversation(
        id: 'conv-999',
        title: 'Dispatch risk review',
        createdAt: DateTime(2026, 10, 15, 10, 0),
        updatedAt: DateTime(2026, 10, 15, 10, 5),
      ),
      messages: [
        AiMessage(
          id: 'm-1',
          role: 'USER',
          content: 'What jobs are stalled?',
          createdAt: DateTime(2026, 10, 15, 10, 0),
        ),
        AiMessage(
          id: 'm-2',
          role: 'ASSISTANT',
          content: 'Attention required: JOB-000042 is past scheduled start time.',
          createdAt: DateTime(2026, 10, 15, 10, 1),
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

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          aiRepositoryProvider.overrideWithValue(
            _FakeAiDetailRepo(detail: detail),
          ),
        ],
        child: const MaterialApp(
          home: AiInsightDetailScreen(insightId: 'conv-999'),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Dispatch risk review'), findsOneWidget);
    expect(find.text('What jobs are stalled?'), findsOneWidget);
    expect(find.text('Attention required: JOB-000042 is past scheduled start time.'), findsOneWidget);
    expect(find.text('Checked: Jobs at risk'), findsOneWidget);
    expect(find.text('View JOB-000042'), findsOneWidget);
    expect(find.text('Continue Conversation'), findsOneWidget);
  });

  testWidgets('renders friendly not found state when conversation is 404', (
    tester,
  ) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          aiRepositoryProvider.overrideWithValue(
            _FakeAiDetailRepo(
              error: const ApiException(
                statusCode: 404,
                code: 'RESOURCE_NOT_FOUND',
                message: 'AI conversation not found',
              ),
            ),
          ),
        ],
        child: const MaterialApp(
          home: AiInsightDetailScreen(insightId: 'non-existent-conv'),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('This conversation could not be found.'), findsOneWidget);
    expect(find.text('Start New Conversation'), findsOneWidget);
  });
}
