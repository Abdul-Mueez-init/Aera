import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'api_response.dart';
import '../config/app_config.dart';

typedef TokenRefreshCallback = Future<String?> Function();

/// Called once when the server has definitively rejected the saved session
/// (refresh token expired, revoked, reused, or the member is no longer
/// active). It is NOT called for network errors, timeouts, 429 or 5xx:
/// offline is not the same as expired.
typedef SessionExpiredCallback = Future<void> Function();

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient();
});

class ApiClient {
  ApiClient({String? baseUrl, http.Client? client})
      : _client = client ?? http.Client(),
        baseUrl = baseUrl ?? AppConfig.apiBaseUrl;

  final http.Client _client;
  final String baseUrl;
  String? _accessToken;
  TokenRefreshCallback? _onTokenRefresh;
  SessionExpiredCallback? _onSessionExpired;

  /// The refresh that is currently running, shared by every request that hits
  /// a 401 in the meantime. The backend rotates refresh tokens and revokes the
  /// whole session chain when an old token is presented again, so two
  /// concurrent refreshes would kill a perfectly good session.
  Future<String?>? _refreshFuture;

  void setAccessToken(String? token) {
    _accessToken = token;
  }

  void setTokenRefreshCallback(TokenRefreshCallback? callback) {
    _onTokenRefresh = callback;
  }

  void setSessionExpiredCallback(SessionExpiredCallback? callback) {
    _onSessionExpired = callback;
  }

  String? get accessToken => _accessToken;

  Map<String, String> _buildHeaders([Map<String, String>? extra]) {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (_accessToken != null && _accessToken!.isNotEmpty) {
      headers['Authorization'] = 'Bearer $_accessToken';
    }
    if (extra != null) {
      headers.addAll(extra);
    }
    return headers;
  }

  Uri _buildUri(String path, [Map<String, String>? queryParameters]) {
    final cleanPath = path.startsWith('/') ? path : '/$path';
    final baseUri = Uri.parse(baseUrl);
    return baseUri.replace(
      path: '${baseUri.path}$cleanPath'.replaceAll('//', '/'),
      queryParameters: queryParameters,
    );
  }

  dynamic _processResponse(http.Response response) {
    dynamic decoded;
    try {
      decoded = response.body.isNotEmpty ? jsonDecode(response.body) : null;
    } catch (e) {
      throw ApiException(
        statusCode: response.statusCode,
        code: 'INVALID_JSON_RESPONSE',
        message: 'Could not parse response: ${response.body}',
      );
    }

    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (decoded is Map<String, dynamic> && decoded.containsKey('data')) {
        return decoded['data'];
      }
      return decoded;
    }

    if (decoded is Map<String, dynamic> && decoded.containsKey('error')) {
      final err = decoded['error'] as Map<String, dynamic>;
      throw ApiException(
        statusCode: response.statusCode,
        code: err['code']?.toString() ?? 'ERROR',
        message: err['message']?.toString() ?? 'Unknown error',
        details: err['details'],
      );
    }

    throw ApiException(
      statusCode: response.statusCode,
      code: 'HTTP_${response.statusCode}',
      message: 'Request failed with status ${response.statusCode}',
    );
  }

  /// Sends a request and, if it comes back 401, refreshes the access token
  /// once (shared between all concurrent requests) and retries it once.
  ///
  /// A refresh is only attempted when the request actually carried a bearer
  /// token and [retryOnUnauthorized] is true. That keeps a wrong-password
  /// login (401 without any token) and the refresh call itself out of the
  /// refresh machinery.
  Future<http.Response> _sendWithRefresh(
    Future<http.Response> Function() request, {
    bool retryOnUnauthorized = true,
  }) async {
    final sentToken = _accessToken;
    final response = await request();
    if (response.statusCode != 401 ||
        !retryOnUnauthorized ||
        _onTokenRefresh == null ||
        sentToken == null ||
        sentToken.isEmpty) {
      return response;
    }

    // Another request may have refreshed the token while this one was in
    // flight. Its 401 is then just a stale token: retry with the new one
    // instead of rotating the refresh token a second time.
    final currentToken = _accessToken;
    if (currentToken != null &&
        currentToken.isNotEmpty &&
        currentToken != sentToken) {
      return request();
    }

    final newToken = await _refreshAccessToken();
    if (newToken == null || newToken.isEmpty) {
      return response;
    }
    _accessToken = newToken;
    return request();
  }

  Future<String?> _refreshAccessToken() {
    return _refreshFuture ??= _performRefresh().whenComplete(() {
      _refreshFuture = null;
    });
  }

  Future<String?> _performRefresh() async {
    final refresh = _onTokenRefresh;
    if (refresh == null) return null;

    try {
      return await refresh();
    } on ApiException catch (error) {
      // 401/403 from the refresh endpoint: the session is really gone.
      // Anything else (429, 5xx, ...) is a server problem, not an expiry.
      if (error.statusCode == 401 || error.statusCode == 403) {
        await _notifySessionExpired();
      }
      return null;
    } catch (_) {
      // Offline, timeout, unreadable response: keep the session.
      return null;
    }
  }

  Future<void> _notifySessionExpired() async {
    _accessToken = null;
    final callback = _onSessionExpired;
    if (callback == null) return;
    try {
      await callback();
    } catch (_) {
      // A failing listener must never break the request that triggered it.
    }
  }

  Future<dynamic> get(
    String path, {
    Map<String, String>? queryParameters,
    Map<String, String>? headers,
  }) async {
    final uri = _buildUri(path, queryParameters);
    final response = await _sendWithRefresh(
      () => _client.get(uri, headers: _buildHeaders(headers)),
    );
    return _processResponse(response);
  }

  Future<dynamic> post(
    String path, {
    dynamic body,
    Map<String, String>? headers,
    Map<String, String>? queryParameters,
    bool retryOnUnauthorized = true,
  }) async {
    final uri = _buildUri(path, queryParameters);
    final response = await _sendWithRefresh(
      () => _client.post(
        uri,
        headers: _buildHeaders(headers),
        body: body != null ? jsonEncode(body) : null,
      ),
      retryOnUnauthorized: retryOnUnauthorized,
    );
    return _processResponse(response);
  }

  Future<dynamic> patch(
    String path, {
    dynamic body,
    Map<String, String>? headers,
  }) async {
    final uri = _buildUri(path);
    final response = await _sendWithRefresh(
      () => _client.patch(
        uri,
        headers: _buildHeaders(headers),
        body: body != null ? jsonEncode(body) : null,
      ),
    );
    return _processResponse(response);
  }

  Future<dynamic> delete(
    String path, {
    Map<String, String>? headers,
  }) async {
    final uri = _buildUri(path);
    final response = await _sendWithRefresh(
      () => _client.delete(uri, headers: _buildHeaders(headers)),
    );
    return _processResponse(response);
  }
}
