import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import '../data/auth_repository.dart';
import '../../../core/config/app_config.dart';

final authNotifierProvider =
    StateNotifierProvider<AuthNotifier, AsyncValue<AuthSession?>>((ref) {
  final repo = ref.watch(authRepositoryProvider);
  return AuthNotifier(repo);
});

final currentUserProvider = Provider<AuthUser?>((ref) {
  final session = ref.watch(authNotifierProvider).value;
  return session?.user;
});

final currentCompanyProvider = Provider<AuthCompany?>((ref) {
  final session = ref.watch(authNotifierProvider).value;
  return session?.company;
});

final currentRoleProvider = Provider<String?>((ref) {
  final session = ref.watch(authNotifierProvider).value;
  return session?.role;
});

class AuthNotifier extends StateNotifier<AsyncValue<AuthSession?>> {
  AuthNotifier(this._repo) : super(const AsyncValue.data(null)) {
    restoreSession();
  }

  final AuthRepository _repo;

  Future<void> restoreSession() async {
    state = const AsyncValue.loading();
    try {
      final session = await _repo.restoreSession();
      state = AsyncValue.data(session);

      // Attach user context to Sentry for restored session
      if (AppConfig.isSentryEnabled && session != null) {
        await Sentry.configureScope((scope) {
          scope.setUser(SentryUser(
            id: session.user.id,
          ));
          scope.setTag('company_id', session.company.id);
          scope.setTag('role', session.role);
        });
      }
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<AuthSession> login(String email, String password) async {
    state = const AsyncValue.loading();
    try {
      final session = await _repo.login(email, password);
      state = AsyncValue.data(session);

      // Attach user context to Sentry for this session
      if (AppConfig.isSentryEnabled) {
        await Sentry.configureScope((scope) {
          scope.setUser(SentryUser(
            id: session.user.id,
          ));
          scope.setTag('company_id', session.company.id);
          scope.setTag('role', session.role);
        });
      }

      return session;
    } catch (e, st) {
      state = AsyncValue.error(e, st);
      rethrow;
    }
  }

  Future<AuthSession> register({
    required String email,
    required String password,
    required String firstName,
    required String lastName,
    required String companyName,
  }) async {
    state = const AsyncValue.loading();
    try {
      final session = await _repo.register(
        email: email,
        password: password,
        firstName: firstName,
        lastName: lastName,
        companyName: companyName,
      );
      state = AsyncValue.data(session);
      return session;
    } catch (e, st) {
      state = AsyncValue.error(e, st);
      rethrow;
    }
  }

  Future<void> logout() async {
    await _repo.logout();

    // Clear user context from Sentry
    if (AppConfig.isSentryEnabled) {
      await Sentry.configureScope((scope) {
        scope.setUser(null);
        scope.removeTag('company_id');
        scope.removeTag('role');
      });
    }

    state = const AsyncValue.data(null);
  }
}
