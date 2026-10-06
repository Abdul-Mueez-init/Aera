import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/api_response.dart';
import 'session_store.dart';

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  final client = ref.watch(apiClientProvider);
  final repo = AuthRepository(client, store: ref.watch(sessionStoreProvider));
  client.setTokenRefreshCallback(repo.refreshAccessToken);
  return repo;
});

/// Thrown by [AuthRepository.restoreSession] when the saved session was
/// rejected by the server (expired, revoked, user suspended or removed).
/// The auth state carries it as its error so the router can send the user
/// to Login instead of Welcome.
class SessionExpiredException implements Exception {
  const SessionExpiredException();

  @override
  String toString() => 'SessionExpiredException';
}

class AuthUser {
  final String id;
  final String email;
  final String firstName;
  final String lastName;

  const AuthUser({
    required this.id,
    required this.email,
    required this.firstName,
    required this.lastName,
  });

  factory AuthUser.fromJson(Map<String, dynamic> json) => AuthUser(
    id: json['id'] as String,
    email: json['email'] as String? ?? '',
    firstName: json['firstName'] as String? ?? '',
    lastName: json['lastName'] as String? ?? '',
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'email': email,
    'firstName': firstName,
    'lastName': lastName,
  };

  /// "First Last", falling back to the email when no name is set.
  String get fullName {
    final name = '$firstName $lastName'.trim();
    return name.isNotEmpty ? name : email;
  }

  /// Up to two capital letters for avatars.
  String get initials {
    final first = firstName.trim();
    final last = lastName.trim();
    final letters = [
      if (first.isNotEmpty) first[0],
      if (last.isNotEmpty) last[0],
    ].join();
    if (letters.isNotEmpty) return letters.toUpperCase();
    return email.isNotEmpty ? email[0].toUpperCase() : '?';
  }
}

/// Human-readable name for a backend role value.
String roleLabel(String? role) {
  switch (role) {
    case 'OWNER':
      return 'Owner';
    case 'DISPATCHER':
      return 'Dispatcher';
    case 'TECHNICIAN':
      return 'Technician';
    default:
      return 'Team member';
  }
}

class AuthCompany {
  final String id;
  final String name;
  final String slug;

  const AuthCompany({
    required this.id,
    required this.name,
    required this.slug,
  });

  factory AuthCompany.fromJson(Map<String, dynamic> json) => AuthCompany(
    id: json['id'] as String,
    name: json['name'] as String? ?? '',
    slug: json['slug'] as String? ?? '',
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'slug': slug,
  };
}

class AuthSession {
  final String accessToken;
  final String refreshToken;
  final AuthUser user;
  final AuthCompany company;
  final String role;

  const AuthSession({
    required this.accessToken,
    required this.refreshToken,
    required this.user,
    required this.company,
    required this.role,
  });

  factory AuthSession.fromJson(Map<String, dynamic> json) => AuthSession(
    accessToken: json['accessToken'] as String,
    refreshToken: json['refreshToken'] as String? ?? '',
    user: AuthUser.fromJson(json['user'] as Map<String, dynamic>),
    company: AuthCompany.fromJson(json['company'] as Map<String, dynamic>),
    role: json['role'] as String? ?? 'OWNER',
  );
}

class AuthRepository {
  AuthRepository(this._client, {SessionStore? store})
      : _store = store ?? SecureSessionStore();

  final ApiClient _client;
  final SessionStore _store;

  /// Upper bound for the startup check, so a dead network can never keep the
  /// app on the splash screen.
  static const _startupValidationTimeout = Duration(seconds: 8);

  /// Upper bound for the best-effort server-side revoke, so Sign Out always
  /// completes even when offline.
  static const _logoutTimeout = Duration(seconds: 5);

  Future<AuthSession> login(String email, String password) async {
    final res = await _client.post(
      '/api/v1/auth/login',
      body: {
        'email': email.trim(),
        'password': password,
      },
    );

    final session = AuthSession.fromJson(res as Map<String, dynamic>);
    _client.setAccessToken(session.accessToken);
    await _persistSession(session);
    return session;
  }

  Future<AuthSession> register({
    required String email,
    required String password,
    required String firstName,
    required String lastName,
    required String companyName,
  }) async {
    final res = await _client.post(
      '/api/v1/auth/register',
      body: {
        'email': email.trim(),
        'password': password,
        'firstName': firstName.trim(),
        'lastName': lastName.trim(),
        'companyName': companyName.trim(),
      },
    );

    final session = AuthSession.fromJson(res as Map<String, dynamic>);
    _client.setAccessToken(session.accessToken);
    await _persistSession(session);
    return session;
  }

  /// Accepts a team invitation: sets (or, for an email that already has an
  /// Aera account, confirms) the password and signs the member in.
  Future<AuthSession> acceptInvitation({
    required String token,
    required String password,
  }) async {
    final res = await _client.post(
      '/api/v1/auth/accept-invitation',
      body: {'token': token.trim(), 'password': password},
      retryOnUnauthorized: false,
    );

    final session = AuthSession.fromJson(res as Map<String, dynamic>);
    _client.setAccessToken(session.accessToken);
    await _persistSession(session);
    return session;
  }

  /// Exchanges the saved refresh token for a new access/refresh pair.
  ///
  /// Returns null when there is nothing to refresh with. Errors from the
  /// refresh endpoint (401/403 = session dead, 429/5xx/network = transient)
  /// are deliberately NOT swallowed here: [ApiClient] needs the difference to
  /// decide whether the session has expired.
  Future<String?> refreshAccessToken() async {
    final stored = await _readStoredJson();
    final refreshToken = stored?['refreshToken'];
    if (refreshToken is! String || refreshToken.isEmpty) return null;

    final res = await _client.post(
      '/api/v1/auth/refresh',
      body: {'refreshToken': refreshToken},
      retryOnUnauthorized: false,
    );
    final data = res as Map<String, dynamic>;
    final newAccessToken = data['accessToken'] as String;
    final newRefreshToken = data['refreshToken'] as String? ?? refreshToken;

    // The user may have signed out, or the session may have been cleared,
    // while the request was in flight. Never write a session back after that.
    final latest = await _readStoredJson();
    if (latest == null) return null;

    latest['accessToken'] = newAccessToken;
    latest['refreshToken'] = newRefreshToken;
    await _store.write(jsonEncode(latest));
    _client.setAccessToken(newAccessToken);
    return newAccessToken;
  }

  /// Revokes the refresh session on the server (best effort, bounded by a
  /// timeout) and always clears the local session.
  Future<void> logout() async {
    try {
      final refreshToken = (await _readStoredJson())?['refreshToken'];
      if (refreshToken is String && refreshToken.isNotEmpty) {
        await _client
            .post(
              '/api/v1/auth/logout',
              body: {'refreshToken': refreshToken},
              retryOnUnauthorized: false,
            )
            .timeout(_logoutTimeout);
      }
    } catch (_) {
      // Best-effort remote logout
    }
    await clearLocalSession();
  }

  /// Forgets the session on this device only (no server call).
  Future<void> clearLocalSession() async {
    _client.setAccessToken(null);
    await _store.delete();
  }

  /// Restores the saved session and confirms it with the server.
  ///
  /// - No saved session: returns null.
  /// - Server accepts it (possibly after a token refresh): returns it, with
  ///   user/company/role taken from the server so a changed role is honoured.
  /// - Server rejects it (401/403): clears it and throws
  ///   [SessionExpiredException].
  /// - Network error, timeout, 429, 5xx: the saved session is kept. Offline
  ///   is not the same as expired.
  Future<AuthSession?> restoreSession() async {
    if (await _store.read() == null) return null;

    final stored = await _loadStoredSession();
    if (stored == null) {
      await clearLocalSession();
      return null;
    }
    _client.setAccessToken(stored.accessToken);

    dynamic me;
    try {
      me = await _client
          .get('/api/v1/auth/me')
          .timeout(_startupValidationTimeout);
    } on ApiException catch (error) {
      if (error.statusCode == 401 || error.statusCode == 403) {
        await clearLocalSession();
        throw const SessionExpiredException();
      }
      return await _loadStoredSession() ?? stored;
    } catch (_) {
      return await _loadStoredSession() ?? stored;
    }

    // The call above may have rotated the tokens; storage is the source of
    // truth for them, not the copy read before the call.
    final latest = await _loadStoredSession();
    if (latest == null) {
      await clearLocalSession();
      throw const SessionExpiredException();
    }
    return _applyServerIdentity(latest, me);
  }

  Future<AuthSession> _applyServerIdentity(
    AuthSession latest,
    dynamic me,
  ) async {
    try {
      final data = me as Map<String, dynamic>;
      final refreshed = AuthSession(
        accessToken: latest.accessToken,
        refreshToken: latest.refreshToken,
        user: AuthUser.fromJson(data['user'] as Map<String, dynamic>),
        company: AuthCompany.fromJson(data['company'] as Map<String, dynamic>),
        role: data['role'] as String? ?? latest.role,
      );
      await _persistSession(refreshed);
      return refreshed;
    } catch (_) {
      // Unexpected response shape: keep the session we already have.
      return latest;
    }
  }

  Future<Map<String, dynamic>?> _readStoredJson() async {
    final raw = await _store.read();
    if (raw == null) return null;
    try {
      final decoded = jsonDecode(raw);
      return decoded is Map<String, dynamic> ? decoded : null;
    } catch (_) {
      return null;
    }
  }

  Future<AuthSession?> _loadStoredSession() async {
    final json = await _readStoredJson();
    if (json == null) return null;
    try {
      return AuthSession.fromJson(json);
    } catch (_) {
      return null;
    }
  }

  Future<void> _persistSession(AuthSession session) async {
    final map = {
      'accessToken': session.accessToken,
      'refreshToken': session.refreshToken,
      'role': session.role,
      'user': session.user.toJson(),
      'company': session.company.toJson(),
    };
    await _store.write(jsonEncode(map));
  }
}
