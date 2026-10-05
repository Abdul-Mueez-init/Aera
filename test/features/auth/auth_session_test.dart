import 'dart:async';
import 'dart:convert';

import 'package:aera/core/network/api_client.dart';
import 'package:aera/core/network/api_response.dart';
import 'package:aera/features/auth/data/auth_repository.dart';
import 'package:aera/features/auth/data/session_store.dart';
import 'package:aera/features/auth/providers/auth_provider.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// In-memory stand-in for the secure storage, so these tests never touch a
/// platform plugin.
class _MemoryStore implements SessionStore {
  String? value;

  @override
  Future<String?> read() async => value;

  @override
  Future<void> write(String newValue) async => value = newValue;

  @override
  Future<void> delete() async => value = null;
}

late _MemoryStore store;

const _user = {
  'id': 'user-1',
  'email': 'owner@example.com',
  'firstName': 'Sam',
  'lastName': 'Owner',
};

const _company = {
  'id': 'company-1',
  'name': 'Test HVAC Co',
  'slug': 'test-hvac-co',
};

Map<String, Object?> _storedSession({String role = 'OWNER'}) => {
      'accessToken': 'old-access',
      'refreshToken': 'old-refresh',
      'role': role,
      'user': _user,
      'company': _company,
    };

http.Response _json(int status, Object body) => http.Response(
      jsonEncode(body),
      status,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );

http.Response _ok(Object data) => _json(200, {'data': data});

http.Response _error(int status, String code) => _json(status, {
      'error': {'code': code, 'message': code},
    });

http.Response _me({String role = 'OWNER'}) =>
    _ok({'user': _user, 'company': _company, 'role': role});

void _seedSession([Map<String, Object?>? session]) {
  store.value = jsonEncode(session ?? _storedSession());
}

Future<Map<String, dynamic>?> _readStoredSession() async {
  final raw = store.value;
  return raw == null ? null : jsonDecode(raw) as Map<String, dynamic>;
}

({ApiClient client, AuthRepository repo}) _build(MockClient mock) {
  final client = ApiClient(baseUrl: 'http://test.local', client: mock);
  final repo = AuthRepository(client, store: store);
  client.setTokenRefreshCallback(repo.refreshAccessToken);
  return (client: client, repo: repo);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    store = _MemoryStore();
  });

  group('AuthRepository.restoreSession', () {
    test('returns null without any network call when nothing is saved',
        () async {
      var calls = 0;
      final mock = MockClient((request) async {
        calls++;
        return _error(500, 'SHOULD_NOT_BE_CALLED');
      });
      final built = _build(mock);

      expect(await built.repo.restoreSession(), isNull);
      expect(calls, 0);
    });

    test('keeps the session and takes the current role from /auth/me',
        () async {
      _seedSession(_storedSession(role: 'TECHNICIAN'));
      final mock = MockClient((request) async {
        if (request.url.path == '/api/v1/auth/me' &&
            request.headers['Authorization'] == 'Bearer old-access') {
          return _me(role: 'DISPATCHER');
        }
        return _error(500, 'UNEXPECTED');
      });
      final built = _build(mock);

      final session = await built.repo.restoreSession();

      expect(session, isNotNull);
      expect(session!.role, 'DISPATCHER');
      expect(session.accessToken, 'old-access');
      expect(built.client.accessToken, 'old-access');

      final stored = await _readStoredSession();
      expect(stored?['role'], 'DISPATCHER');
      expect(stored?['refreshToken'], 'old-refresh');
    });

    test('offline keeps the saved session', () async {
      _seedSession();
      final mock = MockClient((request) async {
        throw http.ClientException('offline');
      });
      final built = _build(mock);

      final session = await built.repo.restoreSession();

      expect(session, isNotNull);
      expect(session!.role, 'OWNER');
      expect(await _readStoredSession(), isNotNull);
      expect(built.client.accessToken, 'old-access');
    });

    test('a server error (503) keeps the saved session', () async {
      _seedSession();
      final mock = MockClient((request) async {
        return _error(503, 'SERVICE_UNAVAILABLE');
      });
      final built = _build(mock);

      final session = await built.repo.restoreSession();

      expect(session, isNotNull);
      expect(await _readStoredSession(), isNotNull);
    });

    test('a rejected refresh clears the session and reports it expired',
        () async {
      _seedSession();
      // Both /auth/me and /auth/refresh answer 401.
      final mock = MockClient((request) async {
        return _error(401, 'AUTH_SESSION_EXPIRED');
      });
      final built = _build(mock);

      await expectLater(
        built.repo.restoreSession(),
        throwsA(isA<SessionExpiredException>()),
      );

      expect(await _readStoredSession(), isNull);
      expect(built.client.accessToken, isNull);
    });

    test('403 from /auth/me (suspended or removed member) is expired',
        () async {
      _seedSession();
      final mock = MockClient((request) async {
        return _error(403, 'AUTH_MEMBERSHIP_SUSPENDED');
      });
      final built = _build(mock);

      await expectLater(
        built.repo.restoreSession(),
        throwsA(isA<SessionExpiredException>()),
      );

      expect(await _readStoredSession(), isNull);
      expect(built.client.accessToken, isNull);
    });

    test('rotated tokens are stored and returned after a successful refresh',
        () async {
      _seedSession();
      final mock = MockClient((request) async {
        final path = request.url.path;
        final auth = request.headers['Authorization'];
        if (path == '/api/v1/auth/me' && auth == 'Bearer new-access') {
          return _me();
        }
        if (path == '/api/v1/auth/refresh') {
          final body = jsonDecode(request.body) as Map<String, dynamic>;
          if (body['refreshToken'] == 'old-refresh') {
            return _ok({
              'accessToken': 'new-access',
              'refreshToken': 'new-refresh',
            });
          }
        }
        return _error(401, 'AUTH_SESSION_EXPIRED');
      });
      final built = _build(mock);

      final session = await built.repo.restoreSession();

      expect(session, isNotNull);
      expect(session!.accessToken, 'new-access');
      expect(session.refreshToken, 'new-refresh');
      expect(built.client.accessToken, 'new-access');

      final stored = await _readStoredSession();
      expect(stored?['accessToken'], 'new-access');
      expect(stored?['refreshToken'], 'new-refresh');
    });
  });

  group('AuthRepository.refreshAccessToken', () {
    test('returns null when there is no saved session', () async {
      final mock = MockClient((request) async => _error(500, 'UNEXPECTED'));
      final built = _build(mock);

      expect(await built.repo.refreshAccessToken(), isNull);
    });

    test('lets a 401 from the server reach the caller', () async {
      _seedSession();
      final mock = MockClient((request) async {
        return _error(401, 'AUTH_SESSION_EXPIRED');
      });
      final built = _build(mock);

      await expectLater(
        built.repo.refreshAccessToken(),
        throwsA(
          isA<ApiException>().having((e) => e.statusCode, 'statusCode', 401),
        ),
      );
    });

    test('never writes a session back after the user signed out mid-refresh',
        () async {
      _seedSession();
      final gate = Completer<void>();
      final mock = MockClient((request) async {
        if (request.url.path == '/api/v1/auth/refresh') {
          await gate.future;
          return _ok({
            'accessToken': 'new-access',
            'refreshToken': 'new-refresh',
          });
        }
        return _error(500, 'UNEXPECTED');
      });
      final built = _build(mock);

      final refreshing = built.repo.refreshAccessToken();
      await Future<void>.delayed(const Duration(milliseconds: 20));
      await built.repo.clearLocalSession();
      gate.complete();

      expect(await refreshing, isNull);
      expect(await _readStoredSession(), isNull);
      expect(built.client.accessToken, isNull);
    });
  });

  group('AuthRepository.logout', () {
    test('revokes the refresh token on the server and clears local state',
        () async {
      _seedSession();
      String? revokedToken;
      final mock = MockClient((request) async {
        if (request.url.path == '/api/v1/auth/logout') {
          final body = jsonDecode(request.body) as Map<String, dynamic>;
          revokedToken = body['refreshToken'] as String?;
          return http.Response('', 204);
        }
        return _error(500, 'UNEXPECTED');
      });
      final built = _build(mock);
      built.client.setAccessToken('old-access');

      await built.repo.logout();

      expect(revokedToken, 'old-refresh');
      expect(await _readStoredSession(), isNull);
      expect(built.client.accessToken, isNull);
    });

    test('still clears local state when the server is unreachable', () async {
      _seedSession();
      final mock = MockClient((request) async {
        throw http.ClientException('offline');
      });
      final built = _build(mock);
      built.client.setAccessToken('old-access');

      await built.repo.logout();

      expect(await _readStoredSession(), isNull);
      expect(built.client.accessToken, isNull);
    });
  });

  group('AuthNotifier', () {
    ProviderContainer containerFor(MockClient mock) {
      final client = ApiClient(baseUrl: 'http://test.local', client: mock);
      final container = ProviderContainer(
        overrides: [
          apiClientProvider.overrideWithValue(client),
          sessionStoreProvider.overrideWithValue(store),
        ],
      );
      addTearDown(container.dispose);
      return container;
    }

    Future<void> settled(ProviderContainer container) async {
      container.read(authNotifierProvider);
      while (container.read(authNotifierProvider).isLoading) {
        await Future<void>.delayed(const Duration(milliseconds: 5));
      }
    }

    test('starts signed out (no error) when nothing is saved', () async {
      final container = containerFor(
        MockClient((request) async => _error(500, 'UNEXPECTED')),
      );

      await settled(container);

      final state = container.read(authNotifierProvider);
      expect(state.hasError, isFalse);
      expect(state.value, isNull);
    });

    test('a saved session the server rejects at startup is "expired"',
        () async {
      _seedSession();
      final container = containerFor(
        MockClient((request) async => _error(401, 'AUTH_SESSION_EXPIRED')),
      );

      await settled(container);

      final state = container.read(authNotifierProvider);
      expect(state.hasError, isTrue);
      expect(state.error, isA<SessionExpiredException>());
      expect(state.value, isNull);
      expect(await _readStoredSession(), isNull);
    });

    test('a signed-in session the server later rejects becomes "expired"',
        () async {
      _seedSession();
      final container = containerFor(
        MockClient((request) async {
          if (request.url.path == '/api/v1/auth/me') return _me();
          return _error(401, 'AUTH_SESSION_EXPIRED');
        }),
      );
      await settled(container);
      expect(container.read(authNotifierProvider).value?.role, 'OWNER');

      final client = container.read(apiClientProvider);
      await expectLater(
        client.get('/api/v1/jobs'),
        throwsA(isA<ApiException>()),
      );

      final state = container.read(authNotifierProvider);
      expect(state.hasError, isTrue);
      expect(state.error, isA<SessionExpiredException>());
      expect(state.value, isNull);
      expect(await _readStoredSession(), isNull);
      expect(client.accessToken, isNull);
    });

    test('a network failure while refreshing keeps the user signed in',
        () async {
      _seedSession();
      final container = containerFor(
        MockClient((request) async {
          final path = request.url.path;
          if (path == '/api/v1/auth/me') return _me();
          if (path == '/api/v1/auth/refresh') {
            throw http.ClientException('offline');
          }
          return _error(401, 'AUTH_SESSION_EXPIRED');
        }),
      );
      await settled(container);

      final client = container.read(apiClientProvider);
      await expectLater(
        client.get('/api/v1/jobs'),
        throwsA(isA<ApiException>()),
      );

      final state = container.read(authNotifierProvider);
      expect(state.hasError, isFalse);
      expect(state.value, isNotNull);
      expect(await _readStoredSession(), isNotNull);
      expect(client.accessToken, 'old-access');
    });

    test('logout ends in a plain signed-out state (not "expired")', () async {
      _seedSession();
      final container = containerFor(
        MockClient((request) async {
          if (request.url.path == '/api/v1/auth/me') return _me();
          if (request.url.path == '/api/v1/auth/logout') {
            return http.Response('', 204);
          }
          return _error(500, 'UNEXPECTED');
        }),
      );
      await settled(container);
      expect(container.read(authNotifierProvider).value, isNotNull);

      await container.read(authNotifierProvider.notifier).logout();

      final state = container.read(authNotifierProvider);
      expect(state.hasError, isFalse);
      expect(state.isLoading, isFalse);
      expect(state.value, isNull);
      expect(await _readStoredSession(), isNull);
    });
  });

  group('SecureSessionStore', () {
    const legacyJson = '{"accessToken":"legacy-access"}';

    test('moves a session saved by the old version into secure storage',
        () async {
      FlutterSecureStorage.setMockInitialValues({});
      SharedPreferences.setMockInitialValues({
        SecureSessionStore.legacyPrefsKey: legacyJson,
      });
      final secure = SecureSessionStore();

      expect(await secure.read(), legacyJson);

      // Now in secure storage, and gone from the plain preferences file.
      expect(
        await const FlutterSecureStorage().read(
          key: SecureSessionStore.storageKey,
        ),
        legacyJson,
      );
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString(SecureSessionStore.legacyPrefsKey), isNull);
    });

    test('secure storage wins over a leftover old copy', () async {
      FlutterSecureStorage.setMockInitialValues({
        SecureSessionStore.storageKey: '{"accessToken":"secure-access"}',
      });
      SharedPreferences.setMockInitialValues({
        SecureSessionStore.legacyPrefsKey: legacyJson,
      });

      expect(
        await SecureSessionStore().read(),
        '{"accessToken":"secure-access"}',
      );
    });

    test('returns null when nothing is saved anywhere', () async {
      FlutterSecureStorage.setMockInitialValues({});
      SharedPreferences.setMockInitialValues({});

      expect(await SecureSessionStore().read(), isNull);
    });

    test('delete clears both the secure and the old copy', () async {
      FlutterSecureStorage.setMockInitialValues({
        SecureSessionStore.storageKey: '{"accessToken":"secure-access"}',
      });
      SharedPreferences.setMockInitialValues({
        SecureSessionStore.legacyPrefsKey: legacyJson,
      });
      final secure = SecureSessionStore();

      await secure.delete();

      expect(await secure.read(), isNull);
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString(SecureSessionStore.legacyPrefsKey), isNull);
    });
  });
}
