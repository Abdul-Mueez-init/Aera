import 'dart:async';
import 'dart:convert';

import 'package:aera/core/network/api_client.dart';
import 'package:aera/core/network/api_response.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response _json(int status, Object body) => http.Response(
      jsonEncode(body),
      status,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );

http.Response _unauthorized() => _json(401, {
      'error': {'code': 'AUTH_SESSION_EXPIRED', 'message': 'expired'},
    });

http.Response _ok() => _json(200, {
      'data': {'ok': true},
    });

/// Runs [action] and returns the error it threw (or null if it succeeded).
Future<Object?> _errorOf(Future<dynamic> action) async {
  try {
    await action;
    return null;
  } catch (error) {
    return error;
  }
}

ApiClient _client(MockClient mock) =>
    ApiClient(baseUrl: 'http://test.local', client: mock);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('ApiClient token refresh', () {
    test('concurrent 401s share ONE refresh and all retry with the new token',
        () async {
      var refreshCalls = 0;
      final mock = MockClient((request) async {
        return request.headers['Authorization'] == 'Bearer new'
            ? _ok()
            : _unauthorized();
      });
      final client = _client(mock)
        ..setAccessToken('old')
        ..setTokenRefreshCallback(() async {
          refreshCalls++;
          await Future<void>.delayed(const Duration(milliseconds: 30));
          return 'new';
        });

      final results = await Future.wait([
        client.get('/a'),
        client.get('/b'),
        client.get('/c'),
      ]);

      expect(refreshCalls, 1);
      expect(results, everyElement(equals({'ok': true})));
      expect(client.accessToken, 'new');
    });

    test(
        'a 401 that arrives after another request already refreshed retries '
        'with the new token without refreshing again', () async {
      var refreshCalls = 0;
      final mock = MockClient((request) async {
        if (request.headers['Authorization'] == 'Bearer new') return _ok();
        if (request.url.path == '/slow') {
          await Future<void>.delayed(const Duration(milliseconds: 80));
        }
        return _unauthorized();
      });
      final client = _client(mock)
        ..setAccessToken('old')
        ..setTokenRefreshCallback(() async {
          refreshCalls++;
          await Future<void>.delayed(const Duration(milliseconds: 10));
          return 'new';
        });

      final results = await Future.wait([
        client.get('/fast'),
        client.get('/slow'),
      ]);

      expect(refreshCalls, 1);
      expect(results, everyElement(equals({'ok': true})));
    });

    test('a later 401 triggers a fresh refresh (single-flight is released)',
        () async {
      var refreshCalls = 0;
      final mock = MockClient((request) async {
        final auth = request.headers['Authorization'];
        if (auth == 'Bearer new2') return _ok();
        if (auth == 'Bearer new1' && request.url.path == '/first') {
          return _ok();
        }
        return _unauthorized();
      });
      final client = _client(mock)
        ..setAccessToken('old')
        ..setTokenRefreshCallback(() async {
          refreshCalls++;
          return 'new$refreshCalls';
        });

      await client.get('/first');
      expect(refreshCalls, 1);

      await client.get('/second');
      expect(refreshCalls, 2);
      expect(client.accessToken, 'new2');
    });

    test('a request that is still 401 after a refresh does not loop', () async {
      var refreshCalls = 0;
      final mock = MockClient((request) async => _unauthorized());
      final client = _client(mock)
        ..setAccessToken('old')
        ..setTokenRefreshCallback(() async {
          refreshCalls++;
          return 'new';
        });

      final error = await _errorOf(client.get('/a'));

      expect(error, isA<ApiException>());
      expect((error as ApiException).statusCode, 401);
      expect(refreshCalls, 1);
    });

    test('a request without a bearer token never triggers a refresh',
        () async {
      var refreshCalls = 0;
      final mock = MockClient((request) async => _unauthorized());
      final client = _client(mock)
        ..setTokenRefreshCallback(() async {
          refreshCalls++;
          return 'new';
        });

      final error = await _errorOf(
        client.post('/api/v1/auth/login', body: {'email': 'a@b.co'}),
      );

      expect(error, isA<ApiException>());
      expect((error as ApiException).statusCode, 401);
      expect(refreshCalls, 0);
    });

    test('retryOnUnauthorized: false skips the refresh', () async {
      var refreshCalls = 0;
      final mock = MockClient((request) async => _unauthorized());
      final client = _client(mock)
        ..setAccessToken('old')
        ..setTokenRefreshCallback(() async {
          refreshCalls++;
          return 'new';
        });

      final error = await _errorOf(
        client.post('/api/v1/auth/refresh', retryOnUnauthorized: false),
      );

      expect(error, isA<ApiException>());
      expect(refreshCalls, 0);
    });
  });

  group('ApiClient session expiry', () {
    for (final status in [401, 403]) {
      test(
          'refresh rejected with $status expires the session exactly once, '
          'even with concurrent requests', () async {
        var expiredCalls = 0;
        final mock = MockClient((request) async => _unauthorized());
        final client = _client(mock)
          ..setAccessToken('old')
          ..setTokenRefreshCallback(() async {
            await Future<void>.delayed(const Duration(milliseconds: 10));
            throw ApiException(
              statusCode: status,
              code: 'AUTH_SESSION_EXPIRED',
              message: 'gone',
            );
          })
          ..setSessionExpiredCallback(() async {
            expiredCalls++;
          });

        final errors = await Future.wait([
          _errorOf(client.get('/a')),
          _errorOf(client.get('/b')),
        ]);

        expect(expiredCalls, 1);
        expect(client.accessToken, isNull);
        for (final error in errors) {
          expect(error, isA<ApiException>());
          expect((error as ApiException).statusCode, 401);
        }
      });
    }

    final transientFailures = <String, Object>{
      'a network error': http.ClientException('offline'),
      'a timeout': TimeoutException('too slow'),
      'rate limiting (429)': const ApiException(
        statusCode: 429,
        code: 'RATE_LIMITED',
        message: 'slow down',
      ),
      'a server error (503)': const ApiException(
        statusCode: 503,
        code: 'HTTP_503',
        message: 'down',
      ),
    };

    for (final entry in transientFailures.entries) {
      test('${entry.key} while refreshing does NOT expire the session',
          () async {
        var expiredCalls = 0;
        final mock = MockClient((request) async => _unauthorized());
        final client = _client(mock)
          ..setAccessToken('old')
          ..setTokenRefreshCallback(() async {
            throw entry.value;
          })
          ..setSessionExpiredCallback(() async {
            expiredCalls++;
          });

        final error = await _errorOf(client.get('/a'));

        expect(error, isA<ApiException>());
        expect((error as ApiException).statusCode, 401);
        expect(expiredCalls, 0);
        expect(client.accessToken, 'old');
      });
    }

    test('a failing expiry listener never breaks the request', () async {
      final mock = MockClient((request) async => _unauthorized());
      final client = _client(mock)
        ..setAccessToken('old')
        ..setTokenRefreshCallback(() async {
          throw const ApiException(
            statusCode: 401,
            code: 'AUTH_SESSION_EXPIRED',
            message: 'gone',
          );
        })
        ..setSessionExpiredCallback(() async {
          throw StateError('listener bug');
        });

      final error = await _errorOf(client.get('/a'));

      expect(error, isA<ApiException>());
      expect((error as ApiException).statusCode, 401);
    });
  });
}
