import 'dart:convert';
import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'api_response.dart';

typedef TokenRefreshCallback = Future<String?> Function();

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient();
});

class ApiClient {
  ApiClient({String? baseUrl, http.Client? client})
      : _client = client ?? http.Client(),
        baseUrl = baseUrl ?? _defaultBaseUrl();

  final http.Client _client;
  final String baseUrl;
  String? _accessToken;
  TokenRefreshCallback? _onTokenRefresh;
  bool _refreshInFlight = false;

  static String _defaultBaseUrl() {
    if (kIsWeb) {
      return 'http://127.0.0.1:4000';
    }
    try {
      if (Platform.isAndroid) {
        return 'http://10.0.2.2:4000';
      }
    } catch (_) {
      // Platform check may throw in some environments
    }
    return 'http://127.0.0.1:4000';
  }

  void setAccessToken(String? token) {
    _accessToken = token;
  }

  void setTokenRefreshCallback(TokenRefreshCallback? callback) {
    _onTokenRefresh = callback;
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

  Future<http.Response> _sendWithRefresh(
    Future<http.Response> Function() request,
  ) async {
    var response = await request();
    if (response.statusCode != 401 ||
        _onTokenRefresh == null ||
        _refreshInFlight) {
      return response;
    }

    _refreshInFlight = true;
    try {
      final newToken = await _onTokenRefresh!();
      if (newToken == null || newToken.isEmpty) {
        return response;
      }
      _accessToken = newToken;
      response = await request();
    } finally {
      _refreshInFlight = false;
    }
    return response;
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
  }) async {
    final uri = _buildUri(path, queryParameters);
    final response = await _sendWithRefresh(
      () => _client.post(
        uri,
        headers: _buildHeaders(headers),
        body: body != null ? jsonEncode(body) : null,
      ),
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
