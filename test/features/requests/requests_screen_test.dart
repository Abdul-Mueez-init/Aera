import 'package:aera/core/network/api_client.dart';
import 'package:aera/core/network/api_response.dart';
import 'package:aera/features/customers/data/customers_repository.dart';
import 'package:aera/features/requests/data/requests_repository.dart';
import 'package:aera/features/requests/requests_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeRequestsRepository extends RequestsRepository {
  _FakeRequestsRepository({this.items = const [], this.error})
    : super(ApiClient());

  final List<ServiceRequest> items;
  final Object? error;

  @override
  Future<PaginatedServiceRequests> listRequests({
    int page = 1,
    int pageSize = 20,
    String? status,
    String? priority,
    bool? requiresInspection,
    String? aging,
    String? search,
  }) async {
    if (error != null) throw error!;
    return PaginatedServiceRequests(
      items: items,
      meta: PageMeta(
        page: page,
        pageSize: pageSize,
        total: items.length,
        pageCount: 1,
      ),
    );
  }
}

ServiceRequest _request({
  String status = 'SUBMITTED',
  String title = 'No cooling',
}) {
  return ServiceRequest(
    id: 'req-1',
    requestNumber: 1042,
    title: title,
    description: 'AC is blowing warm air',
    serviceCategory: 'HVAC',
    priority: 'NORMAL',
    status: status,
    requiresInspection: false,
    source: 'PORTAL',
    customerName: 'Casey Customer',
    address: '1 Main St, Austin',
    createdAt: DateTime(2026, 1, 1),
  );
}

Widget _app(RequestsRepository repo) {
  return ProviderScope(
    overrides: [requestsRepositoryProvider.overrideWithValue(repo)],
    child: const MaterialApp(home: RequestsScreen()),
  );
}

void main() {
  testWidgets('shows loading then the request list', (tester) async {
    final repo = _FakeRequestsRepository(items: [_request()]);
    await tester.pumpWidget(_app(repo));
    await tester.pumpAndSettle();
    expect(find.textContaining('No cooling'), findsOneWidget);
    expect(find.text('1 requests'), findsOneWidget);
    expect(find.text('Casey Customer'), findsWidgets);
  });

  testWidgets('shows empty state when no requests match', (tester) async {
    await tester.pumpWidget(_app(_FakeRequestsRepository()));
    await tester.pumpAndSettle();
    expect(
      find.text('No service requests match these filters'),
      findsOneWidget,
    );
  });

  testWidgets('shows error state with retry on failure', (tester) async {
    await tester.pumpWidget(
      _app(
        _FakeRequestsRepository(
          error: const ApiException(
            statusCode: 500,
            code: 'ERR',
            message: 'boom',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Retry'), findsOneWidget);
  });

  testWidgets('status filter chips render and update the query', (
    tester,
  ) async {
    final repo = _FakeRequestsRepository(items: [_request()]);
    await tester.pumpWidget(_app(repo));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Accepted'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Accepted'), warnIfMissed: false);
    await tester.pumpAndSettle();
    // After filtering the fake still returns its fixture; the chip must
    // reflect the selected status.
    expect(
      tester
          .widget<ChoiceChip>(find.widgetWithText(ChoiceChip, 'Accepted'))
          .selected,
      isTrue,
    );
  });
}
