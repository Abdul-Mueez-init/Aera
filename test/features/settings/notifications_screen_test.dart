import 'package:aera/core/network/api_client.dart';
import 'package:aera/features/settings/data/notifications_repository.dart'
    as notif;
import 'package:aera/features/settings/notifications_screen.dart';
import 'package:aera/features/settings/providers/notifications_provider.dart';
import 'package:flutter/material.dart' hide Notification;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeNotificationsRepository extends notif.NotificationsRepository {
  _FakeNotificationsRepository(this._response)
      : super(apiClient: ApiClient());

  final notif.NotificationListResponse _response;

  @override
  Future<notif.NotificationListResponse> listNotifications({
    int page = 1,
    int pageSize = 20,
    bool unreadOnly = false,
  }) async {
    return _response;
  }
}

void main() {
  testWidgets('renders empty state when there are no notifications', (
    tester,
  ) async {
    final emptyResponse = notif.NotificationListResponse(
      items: [],
      meta: notif.NotificationMeta(
        page: 1,
        pageSize: 20,
        total: 0,
        pageCount: 0,
        unreadCount: 0,
      ),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          notificationsRepositoryProvider.overrideWithValue(
            _FakeNotificationsRepository(emptyResponse),
          ),
        ],
        child: const MaterialApp(home: NotificationsScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('No notifications yet'), findsOneWidget);
    expect(find.text('You are all caught up!'), findsOneWidget);
    expect(find.textContaining('Ahmed Raza'), findsNothing);
    expect(find.textContaining('Van #12'), findsNothing);
  });

  testWidgets('renders real notifications and unread indicators', (
    tester,
  ) async {
    final responseWithItems = notif.NotificationListResponse(
      items: [
        notif.Notification(
          id: 'n-1',
          type: 'JOB_ASSIGNED',
          payload: {'jobId': 'job-abc-123'},
          readAt: null,
          createdAt: DateTime.now().subtract(const Duration(minutes: 5)),
        ),
      ],
      meta: notif.NotificationMeta(
        page: 1,
        pageSize: 20,
        total: 1,
        pageCount: 1,
        unreadCount: 1,
      ),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          notificationsRepositoryProvider.overrideWithValue(
            _FakeNotificationsRepository(responseWithItems),
          ),
        ],
        child: const MaterialApp(home: NotificationsScreen()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Job Assigned'), findsOneWidget);
    expect(find.text('Job: job-abc-123'), findsOneWidget);
    expect(find.text('Unread (1)'), findsOneWidget);
  });
}
