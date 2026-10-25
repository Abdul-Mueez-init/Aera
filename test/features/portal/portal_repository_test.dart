import 'dart:convert';

import 'package:aera/features/portal/data/portal_repository.dart';
import 'package:aera/features/portal/data/portal_session_store.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// In-memory [PortalSessionStore] — no platform keystore in tests.
class _MemoryPortalSessionStore extends PortalSessionStore {
  String? value;

  @override
  Future<String?> read() async => value;

  @override
  Future<void> write(String sessionToken) async => value = sessionToken;

  @override
  Future<void> clear() async => value = null;
}

http.Response _json(int status, Map<String, dynamic> body) =>
    http.Response(jsonEncode(body), status);

Map<String, dynamic> _closedBody(String code) => {
  'error': {'code': code, 'message': 'closed'},
  'data': {
    'state': 'DEACTIVATED',
    'company': {'name': 'Acme HVAC', 'phone': '+1555000111'},
    'contacts': [
      {
        'role': 'OWNER',
        'name': 'Olivia Owner',
        'phone': '+1555000222',
        'email': 'olivia@acme.example',
      },
    ],
  },
};

void main() {
  group('parsePortalFragment', () {
    test('extracts the t parameter', () {
      expect(parsePortalFragment('t=abc123'), 'abc123');
      expect(parsePortalFragment('#t=abc123'), 'abc123');
    });

    test('finds t among other parameters', () {
      expect(parsePortalFragment('a=1&t=xyz&b=2'), 'xyz');
    });

    test('returns null when missing or empty', () {
      expect(parsePortalFragment(''), isNull);
      expect(parsePortalFragment('#'), isNull);
      expect(parsePortalFragment('x=1'), isNull);
      expect(parsePortalFragment('t='), isNull);
      expect(parsePortalFragment('token=abc'), isNull);
    });

    test('decodes percent-encoding', () {
      expect(parsePortalFragment('t=a%2Bb%3D'), 'a+b=');
    });
  });

  group('PortalRepository.exchange', () {
    test('web (cookie) mode: posts deliver=cookie, sends X-Aera-Portal, '
        'stores nothing', () async {
      late http.Request captured;
      final client = MockClient((request) async {
        captured = request;
        return _json(200, {
          'data': {'state': 'ACTIVE'},
        });
      });
      final store = _MemoryPortalSessionStore();
      final repo = PortalRepository(
        baseUrl: 'https://api.test',
        client: client,
        store: store,
        forceWebTransport: true,
      );

      final result = await repo.exchange('link-token');

      expect(result, isA<PortalSessionActive>());
      expect(captured.url.path, '/api/v1/portal/exchange');
      expect(captured.headers['x-aera-portal'], '1');
      final body = jsonDecode(captured.body) as Map<String, dynamic>;
      expect(body['token'], 'link-token');
      expect(body['deliver'], 'cookie');
      expect(store.value, isNull);
    });

    test('mobile (bearer) mode: posts deliver=bearer, stores the session '
        'token, and sends it on later calls', () async {
      final requests = <http.BaseRequest>[];
      final client = MockClient((request) async {
        requests.add(request);
        if (request.url.path.endsWith('/exchange')) {
          return _json(200, {
            'data': {'state': 'ACTIVE', 'sessionToken': 'sess-123'},
          });
        }
        return _json(200, {
          'data': {'state': 'ACTIVE'},
        });
      });
      final store = _MemoryPortalSessionStore();
      final repo = PortalRepository(
        baseUrl: 'https://api.test',
        client: client,
        store: store,
        forceWebTransport: false,
      );

      final exchangeResult = await repo.exchange('link-token');
      expect(exchangeResult, isA<PortalSessionActive>());
      final exchangeBody =
          jsonDecode((requests.first as http.Request).body)
              as Map<String, dynamic>;
      expect(exchangeBody['deliver'], 'bearer');
      expect(store.value, 'sess-123');

      final sessionResult = await repo.session();
      expect(sessionResult, isA<PortalSessionActive>());
      expect(requests.last.headers['authorization'], 'Bearer sess-123');
      expect(requests.last.headers['x-aera-portal'], '1');
    });

    test('410 PORTAL_ACCESS_DEACTIVATED maps to PortalClosed(deactivated) '
        'with contacts', () async {
      final client = MockClient(
        (_) async => _json(410, _closedBody('PORTAL_ACCESS_DEACTIVATED')),
      );
      final repo = PortalRepository(
        baseUrl: 'https://api.test',
        client: client,
        store: _MemoryPortalSessionStore(),
        forceWebTransport: true,
      );

      final result = await repo.exchange('link-token');

      expect(result, isA<PortalClosed>());
      final closed = result as PortalClosed;
      expect(closed.variant, PortalClosedVariant.deactivated);
      expect(closed.contact, isNotNull);
      expect(closed.contact!.companyName, 'Acme HVAC');
      expect(closed.contact!.companyPhone, '+1555000111');
      expect(closed.contact!.contacts, hasLength(1));
      expect(closed.contact!.contacts.first.name, 'Olivia Owner');
      expect(closed.contact!.contacts.first.role, 'OWNER');
    });

    test('410 PORTAL_LINK_EXPIRED maps to PortalClosed(expired)', () async {
      final client = MockClient(
        (_) async => _json(410, _closedBody('PORTAL_LINK_EXPIRED')),
      );
      final repo = PortalRepository(
        baseUrl: 'https://api.test',
        client: client,
        store: _MemoryPortalSessionStore(),
        forceWebTransport: true,
      );

      final result = await repo.exchange('link-token');

      expect(result, isA<PortalClosed>());
      expect((result as PortalClosed).variant, PortalClosedVariant.expired);
      expect(result.contact, isNotNull);
    });

    test(
      '409 PORTAL_LINK_ALREADY_USED maps to PortalClosed(alreadyUsed)',
      () async {
        final client = MockClient(
          (_) async => _json(409, _closedBody('PORTAL_LINK_ALREADY_USED')),
        );
        final repo = PortalRepository(
          baseUrl: 'https://api.test',
          client: client,
          store: _MemoryPortalSessionStore(),
          forceWebTransport: true,
        );

        final result = await repo.exchange('link-token');

        expect(result, isA<PortalClosed>());
        expect(
          (result as PortalClosed).variant,
          PortalClosedVariant.alreadyUsed,
        );
      },
    );

    test('401 PORTAL_LINK_INVALID maps to PortalInvalid', () async {
      final client = MockClient(
        (_) async => _json(401, {
          'error': {'code': 'PORTAL_LINK_INVALID', 'message': 'Invalid link'},
        }),
      );
      final repo = PortalRepository(
        baseUrl: 'https://api.test',
        client: client,
        store: _MemoryPortalSessionStore(),
        forceWebTransport: true,
      );

      final result = await repo.exchange('nope');

      expect(result, isA<PortalInvalid>());
    });

    test('a network error maps to PortalFailure', () async {
      final client = MockClient((_) async {
        throw http.ClientException('boom');
      });
      final repo = PortalRepository(
        baseUrl: 'https://api.test',
        client: client,
        store: _MemoryPortalSessionStore(),
        forceWebTransport: true,
      );

      final result = await repo.exchange('link-token');

      expect(result, isA<PortalFailure>());
    });

    test(
      'session() with no live session (401) maps to PortalInvalid',
      () async {
        final client = MockClient(
          (_) async => _json(401, {
            'error': {
              'code': 'PORTAL_SESSION_REQUIRED',
              'message': 'Portal session required',
            },
          }),
        );
        final repo = PortalRepository(
          baseUrl: 'https://api.test',
          client: client,
          store: _MemoryPortalSessionStore(),
          forceWebTransport: true,
        );

        expect(await repo.session(), isA<PortalInvalid>());
      },
    );

    test(
      'an unexpected 500 maps to PortalFailure with the server message',
      () async {
        final client = MockClient(
          (_) async => _json(500, {
            'error': {'code': 'INTERNAL', 'message': 'Something broke'},
          }),
        );
        final repo = PortalRepository(
          baseUrl: 'https://api.test',
          client: client,
          store: _MemoryPortalSessionStore(),
          forceWebTransport: true,
        );

        final result = await repo.session();

        expect(result, isA<PortalFailure>());
        expect((result as PortalFailure).message, 'Something broke');
      },
    );
  });

  group('PortalRepository.job', () {
    test('parses the snapshot contract (money as strings, handshake, '
        'review)', () async {
      final client = MockClient(
        (_) async => _json(200, {
          'data': {
            'job': {
              'jobNumber': 1042,
              'serviceType': 'AC Repair',
              'problemDescription': 'Not cooling',
              'status': 'EN_ROUTE',
              'scheduledStart': '2026-10-25T09:00:00.000Z',
              'scheduledEnd': '2026-10-25T10:00:00.000Z',
              'completedAt': null,
              'address': {
                'line1': '1 Main St',
                'line2': null,
                'city': 'Austin',
                'region': 'TX',
                'postalCode': '78701',
              },
              'technician': {'firstName': 'Mike', 'lastName': 'Tech'},
              'handshake': {'code': '483920', 'technicianName': 'Mike'},
            },
            'quotes': [
              {
                'id': 'q1',
                'status': 'SENT',
                'subtotalMinor': '10000',
                'discountMinor': '0',
                'taxMinor': '800',
                'taxRateBps': 800,
                'totalMinor': '10800',
                'currency': 'USD',
                'expiresAt': null,
                'items': [
                  {
                    'id': 'i1',
                    'description': 'Capacitor',
                    'quantity': '1',
                    'unitPriceMinor': '10000',
                    'totalMinor': '10000',
                  },
                ],
              },
            ],
            'invoices': <dynamic>[],
            'review': null,
            'company': {'name': 'Acme HVAC'},
          },
        }),
      );
      final repo = PortalRepository(
        baseUrl: 'https://api.test',
        client: client,
        store: _MemoryPortalSessionStore(),
        forceWebTransport: true,
      );

      final result = await repo.job();

      expect(result, isA<PortalSessionActive>());
      final snapshot = (result as PortalSessionActive).snapshot!;
      expect(snapshot.job.jobNumber, 1042);
      expect(snapshot.job.status, 'EN_ROUTE');
      expect(snapshot.job.address!.city, 'Austin');
      expect(snapshot.job.technician!.fullName, 'Mike Tech');
      expect(snapshot.job.handshake!.code, '483920');
      expect(snapshot.quotes.single.totalMinor, 10800);
      expect(snapshot.quotes.single.items.single.totalMinor, 10000);
      expect(snapshot.review, isNull);
      expect(snapshot.company.name, 'Acme HVAC');
    });

    test(
      '401 PORTAL_SESSION_EXPIRED maps job() to PortalClosed(expired)',
      () async {
        final client = MockClient(
          (_) async => _json(401, {
            'error': {
              'code': 'PORTAL_SESSION_EXPIRED',
              'message': 'Session expired',
            },
          }),
        );
        final repo = PortalRepository(
          baseUrl: 'https://api.test',
          client: client,
          store: _MemoryPortalSessionStore(),
          forceWebTransport: true,
        );

        final result = await repo.job();

        expect(result, isA<PortalClosed>());
        expect((result as PortalClosed).variant, PortalClosedVariant.expired);
      },
    );

    test('a deactivated session maps job() to PortalClosed', () async {
      final client = MockClient(
        (_) async => _json(410, _closedBody('PORTAL_ACCESS_DEACTIVATED')),
      );
      final repo = PortalRepository(
        baseUrl: 'https://api.test',
        client: client,
        store: _MemoryPortalSessionStore(),
        forceWebTransport: true,
      );

      final result = await repo.job();

      expect(result, isA<PortalClosed>());
      expect((result as PortalClosed).variant, PortalClosedVariant.deactivated);
    });
  });
}
