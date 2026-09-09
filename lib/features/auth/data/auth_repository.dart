import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/network/api_client.dart';

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  final client = ref.watch(apiClientProvider);
  return AuthRepository(client);
});

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
  AuthRepository(this._client);

  final ApiClient _client;
  static const _sessionKey = 'aera_auth_session';

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

  Future<void> logout() async {
    try {
      await _client.post('/api/v1/auth/logout');
    } catch (_) {
      // Best-effort remote logout
    }
    _client.setAccessToken(null);
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_sessionKey);
  }

  Future<AuthSession?> restoreSession() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_sessionKey);
    if (raw == null) return null;

    try {
      final json = jsonDecode(raw) as Map<String, dynamic>;
      final session = AuthSession.fromJson(json);
      _client.setAccessToken(session.accessToken);
      return session;
    } catch (_) {
      await prefs.remove(_sessionKey);
      return null;
    }
  }

  Future<void> _persistSession(AuthSession session) async {
    final prefs = await SharedPreferences.getInstance();
    final map = {
      'accessToken': session.accessToken,
      'refreshToken': session.refreshToken,
      'role': session.role,
      'user': session.user.toJson(),
      'company': session.company.toJson(),
    };
    await prefs.setString(_sessionKey, jsonEncode(map));
  }
}
