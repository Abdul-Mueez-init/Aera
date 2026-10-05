import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/auth/data/auth_repository.dart';

/// Where the app currently stands with respect to authentication.
///
/// This is deliberately tiny (see Aera_Handoff_Doc, Phase 1): the router only
/// needs to know "still working it out", "nobody is signed in", "the saved
/// session died" or "signed in". There is no second source of truth: the gate
/// is always derived from `authNotifierProvider`.
enum AuthGate { loading, signedOut, sessionExpired, signedIn }

const String kSplashPath = '/splash';
const String kWelcomePath = '/welcome';
const String kLoginPath = '/login';
const String kDashboardPath = '/dashboard';
const String kTechnicianHomePath = '/technician-home';

/// True once the splash screen has been visible for its minimum brand time.
///
/// The router keeps the user on `/splash` until this is true, so a fast
/// session check never makes the splash flash by in a single frame.
final splashGateProvider = StateProvider<bool>((ref) => false);

/// Routes anyone can open without a session.
const Set<String> _publicExact = {
  '/splash',
  '/welcome',
  '/login',
  '/sign-up',
  '/forgot-password',
  '/reset-password',
  '/accept-invitation',
};

/// Token-based customer pages. The token in the URL is the credential.
const List<String> _publicPrefixes = [
  '/portal/',
  '/quote-approval/',
  '/invoice-payment/',
  '/technician-tracking/',
];

/// Screens a signed-in user never needs to see again.
const Set<String> _authEntryPaths = {'/welcome', '/login', '/sign-up'};

/// The only signed-in routes a technician may open. Everything else is
/// owner/dispatcher-only. The server still enforces permissions on every
/// request; this only keeps the UI honest.
const Set<String> _technicianExact = {
  '/technician-home',
  '/profile-settings',
  '/notifications',
};

const List<String> _technicianPrefixes = [
  '/technician/', // job brief, en route, work, evidence, complete
  '/jobs/', // job detail (opened from the job brief); NOT the '/jobs' list
];

/// Maps the auth notifier state to an [AuthGate].
///
/// A [SessionExpiredException] error means "we had a session and the server
/// rejected it" (send to Login). Any other error means signed out.
AuthGate authGateFor(AsyncValue<AuthSession?> state) {
  if (state.isLoading) return AuthGate.loading;
  if (state.hasError) {
    return state.error is SessionExpiredException
        ? AuthGate.sessionExpired
        : AuthGate.signedOut;
  }
  return state.value != null ? AuthGate.signedIn : AuthGate.signedOut;
}

String _normalize(String path) {
  if (path.length > 1 && path.endsWith('/')) {
    return path.substring(0, path.length - 1);
  }
  return path;
}

bool isPublicPath(String path) {
  final p = _normalize(path);
  if (_publicExact.contains(p)) return true;
  return _publicPrefixes.any((prefix) => p.startsWith(prefix));
}

/// Whether a technician may open [path].
bool isTechnicianAllowedPath(String path) {
  final p = _normalize(path);
  if (isPublicPath(p)) return true;
  if (_technicianExact.contains(p)) return true;
  return _technicianPrefixes.any((prefix) => p.startsWith(prefix));
}

/// The first screen a signed-in user of [role] should see.
String roleHome(String? role) =>
    role == 'TECHNICIAN' ? kTechnicianHomePath : kDashboardPath;

/// The single source of truth for "where should this user be sent?".
///
/// Returns the path to redirect to, or null to stay where they are.
///
/// - [holdSplash] is true until the splash has been shown for its minimum
///   time; while true, `/splash` is never redirected away from.
String? resolveRedirect({
  required AuthGate gate,
  required String? role,
  required String path,
  bool holdSplash = false,
}) {
  final p = _normalize(path);

  // Still working out who the user is: never flash Welcome or Login.
  if (gate == AuthGate.loading) {
    return (p == kSplashPath || isPublicPath(p)) ? null : kSplashPath;
  }

  if (p == kSplashPath && holdSplash) return null;

  switch (gate) {
    case AuthGate.loading:
      return null; // handled above
    case AuthGate.signedOut:
    case AuthGate.sessionExpired:
      final entry =
          gate == AuthGate.sessionExpired ? kLoginPath : kWelcomePath;
      if (p == kSplashPath) return entry;
      return isPublicPath(p) ? null : entry;
    case AuthGate.signedIn:
      if (p == kSplashPath || _authEntryPaths.contains(p)) {
        return roleHome(role);
      }
      if (role == 'TECHNICIAN' && !isTechnicianAllowedPath(p)) {
        return kTechnicianHomePath;
      }
      return null;
  }
}
