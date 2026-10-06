import 'dart:convert';

import 'package:aera/core/network/api_client.dart';
import 'package:aera/features/settings/data/notifications_repository.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('lists notifications through the shared client: /api/v1 path + bearer token',
      () async {
    late http.Request seen;
    final mock = MockClient((request) async {
      seen = request;
      return http.Response(
        jsonEncode({
          'data': {
            'items': [],
            'meta': {
              'page': 1,
              'pageSize': 20,
              'total': 0,
              'pageCount': 0,
              'unreadCount': 0,
            },
          },
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    });
    final client = ApiClient(baseUrl: 'http://test.local', client: mock)
      ..setAccessToken('token-123');

    final result = await NotificationsRepository(apiClient: client)
        .listNotifications();

    expect(seen.url.path, '/api/v1/notifications');
    expect(seen.headers['Authorization'], 'Bearer token-123');
    expect(result.items, isEmpty);
    expect(result.meta.unreadCount, 0);
  });

  test('marks a notification read on the /api/v1 path', () async {
    late http.Request seen;
    final mock = MockClient((request) async {
      seen = request;
      return http.Response(
        jsonEncode({
          'data': {
            'id': 'n1',
            'type': 'JOB_ASSIGNED',
            'payload': null,
            'readAt': '2026-10-07T08:00:00.000Z',
            'createdAt': '2026-10-07T07:00:00.000Z',
          },
        }),
        200,
        headers: {'content-type': 'application/json'},
      );
    });
    final client = ApiClient(baseUrl: 'http://test.local', client: mock)
      ..setAccessToken('token-123');

    final n = await NotificationsRepository(apiClient: client).markAsRead('n1');

    expect(seen.url.path, '/api/v1/notifications/n1/read');
    expect(seen.method, 'POST');
    expect(n.isUnread, isFalse);
  });
}
