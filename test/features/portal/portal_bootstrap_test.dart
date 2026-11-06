import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import 'package:aera/features/portal/data/portal_repository.dart';
import 'package:aera/features/portal/data/portal_session_store.dart';
import 'package:aera/features/portal/providers/portal_provider.dart';

class _FakeStore extends PortalSessionStore {
  @override
  Future<String?> read() async => null;
  @override
  Future<void> write(String sessionToken) async {}
  @override
  Future<void> clear() async {}
}

/// Repository stub: every transport method is overridden, so the http
/// client and store are never touched.
class FakePortalRepository extends PortalRepository {
  FakePortalRepository()
    : super(
        baseUrl: 'http://test',
        client: http.Client(),
        store: _FakeStore(),
        forceWebTransport: true,
      );

  PortalResult sessionResult = const PortalInvalid();
  PortalResult exchangeResult = const PortalInvalid();
  PortalResult workspaceResult = const PortalFailure('no workspace');
  PortalResult jobResult = const PortalFailure('no job');

  int sessionCalls = 0;
  int exchangeCalls = 0;
  String? lastExchangeToken;

  @override
  Future<PortalResult> session() async {
    sessionCalls++;
    return sessionResult;
  }

  @override
  Future<PortalResult> exchange(String token) async {
    exchangeCalls++;
    lastExchangeToken = token;
    return exchangeResult;
  }

  @override
  Future<PortalResult> workspace() async => workspaceResult;

  @override
  Future<PortalResult> job() async => jobResult;
}

PortalSessionActive _workspaceActive() => const PortalSessionActive(
  workspace: {'customer': {'id': 'cust-1'}},
);

void main() {
  late FakePortalRepository repository;
  late ProviderContainer container;

  PortalSessionController controller() =>
      container.read(portalSessionControllerProvider.notifier);

  setUp(() {
    repository = FakePortalRepository();
    container = ProviderContainer(
      overrides: [portalRepositoryProvider.overrideWithValue(repository)],
    );
    addTearDown(container.dispose);
  });

  group('PortalSessionController.bootstrap', () {
    test(
      'a new link exchanges FIRST and replaces the stale session — the '
      'existing session is never even probed',
      () async {
        // An old session exists on this device…
        repository.sessionResult = const PortalSessionActive();
        repository.workspaceResult = _workspaceActive();
        // …and the customer taps a NEW link.
        repository.exchangeResult = const PortalSessionActive();

        final outcome = await controller().bootstrap(fragmentToken: 'new-tok');

        expect(outcome, PortalBootstrapOutcome.active);
        expect(repository.exchangeCalls, 1);
        expect(repository.lastExchangeToken, 'new-tok');
        // Exchange-first means the stale session probe never ran: old
        // workspace data cannot render under the new link.
        expect(repository.sessionCalls, 0);
      },
    );

    test('dead link + live session keeps the session (re-opened link)', () async {
      repository.exchangeResult = const PortalClosed(
        variant: PortalClosedVariant.alreadyUsed,
      );
      repository.sessionResult = const PortalSessionActive();
      repository.workspaceResult = _workspaceActive();

      final outcome = await controller().bootstrap(fragmentToken: 'used-tok');

      expect(outcome, PortalBootstrapOutcome.active);
      expect(repository.exchangeCalls, 1);
      expect(repository.sessionCalls, 1);
    });

    test('dead link + dead session shows the link closed state', () async {
      repository.exchangeResult = const PortalClosed(
        variant: PortalClosedVariant.expired,
      );
      repository.sessionResult = const PortalInvalid();

      final outcome = await controller().bootstrap(fragmentToken: 'old-tok');

      expect(outcome, PortalBootstrapOutcome.closed);
      expect(
        container.read(portalClosedProvider)?.variant,
        PortalClosedVariant.expired,
      );
    });

    test('no token probes the existing session as before', () async {
      repository.sessionResult = const PortalSessionActive();
      repository.workspaceResult = _workspaceActive();

      final outcome = await controller().bootstrap();

      expect(outcome, PortalBootstrapOutcome.active);
      expect(repository.exchangeCalls, 0);
      expect(repository.sessionCalls, 1);
    });

    test('exchange network failure + no session is a retryable error', () async {
      repository.exchangeResult = const PortalFailure('offline');
      repository.sessionResult = const PortalInvalid();

      final outcome = await controller().bootstrap(fragmentToken: 'tok');

      expect(outcome, PortalBootstrapOutcome.error);
    });
  });
}
