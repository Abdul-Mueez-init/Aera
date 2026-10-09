import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import '../data/auth_repository.dart';
import '../../../core/config/app_config.dart';
import '../../../core/network/api_client.dart';
import '../../jobs/providers/jobs_provider.dart';
import '../../technician/providers/technician_provider.dart';
import '../../customers/providers/customers_provider.dart';
import '../../invoices/providers/invoices_provider.dart';
import '../../quotes/providers/quotes_provider.dart';
import '../../calendar/providers/calendar_provider.dart';
import '../../team/providers/team_provider.dart';
import '../../settings/providers/company_provider.dart';
import '../../settings/providers/notifications_provider.dart';
import '../../ai/providers/ai_provider.dart';

final authNotifierProvider =
    StateNotifierProvider<AuthNotifier, AsyncValue<AuthSession?>>((ref) {
  final repo = ref.watch(authRepositoryProvider);
  final client = ref.watch(apiClientProvider);
  final notifier = AuthNotifier(repo, ref);
  client.setSessionExpiredCallback(notifier.handleSessionExpired);
  ref.onDispose(() => client.setSessionExpiredCallback(null));
  return notifier;
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
  AuthNotifier(this._repo, this._ref) : super(const AsyncValue.data(null)) {
    restoreSession();
  }

  final AuthRepository _repo;
  final Ref _ref;

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
      // A SessionExpiredException lands here too: it is kept as the error so
      // the router can tell "session died" (-> Login) from "never signed in".
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

  Future<AuthSession> acceptInvitation({
    required String token,
    required String password,
  }) async {
    state = const AsyncValue.loading();
    try {
      final session = await _repo.acceptInvitation(
        token: token,
        password: password,
      );
      state = AsyncValue.data(session);

      if (AppConfig.isSentryEnabled) {
        await Sentry.configureScope((scope) {
          scope.setUser(SentryUser(id: session.user.id));
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

  Future<void> logout() async {
    await _repo.logout();
    await _clearSentryUser();
    state = const AsyncValue.data(null);

    // Invalidate key feature providers to prevent stale data on account switch
    // Note: This invalidates the providers themselves; their dependencies will
    // cascade. For company-specific invalidation, add a company-scoped provider
    // key or explicitly invalidate company-specific providers.
    //
    // Currently invalidating main feature providers. In a larger app, consider
    // grouping providers under a session/company provider for automatic invalidation.
    _ref.invalidate(jobsListProvider);
    _ref.invalidate(technicianTodayProvider);
    _ref.invalidate(customersListProvider);
    _ref.invalidate(invoicesListProvider);
    _ref.invalidate(quotesListProvider);
    _ref.invalidate(dayScheduleProvider);
    _ref.invalidate(workloadProvider);
    _ref.invalidate(teamMembersProvider);
    _ref.invalidate(companyDetailsProvider);
    _ref.invalidate(notificationsRepositoryProvider);
    _ref.invalidate(aiConversationsListProvider);
  }

  /// Called by [ApiClient] when the server has definitively rejected the
  /// saved session while the user was signed in. Clears the local session and
  /// moves to a signed-out state that remembers the session died, so the
  /// router can send the user to Login.
  Future<void> handleSessionExpired() async {
    // Only a signed-in session can expire. During startup validation the
    // repository reports the expiry itself; after a sign-out there is nothing
    // left to expire.
    if (!mounted || state.value == null) return;

    await _repo.clearLocalSession();
    await _clearSentryUser();

    // The user may have signed out, or the notifier may have been disposed,
    // while the awaits above were running.
    if (!mounted || state.value == null) return;
    state = AsyncValue.error(
      const SessionExpiredException(),
      StackTrace.current,
    );
  }

  Future<void> _clearSentryUser() async {
    if (!AppConfig.isSentryEnabled) return;
    await Sentry.configureScope((scope) {
      scope.setUser(null);
      scope.removeTag('company_id');
      scope.removeTag('role');
    });
  }
}
