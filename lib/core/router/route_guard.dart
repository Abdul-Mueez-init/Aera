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
const String kOwnerOnboardingPath = '/onboarding/business-basics';

const Set<String> _ownerOnboardingPaths = {
  '/onboarding/business-basics',
  '/onboarding/service-area',
  '/onboarding/services',
  '/onboarding/team-setup',
  '/onboarding/complete',
};

int? _ownerOnboardingStepForPath(String path) => switch (path) {
  '/onboarding/business-basics' => 1,
  '/onboarding/service-area' => 2,
  '/onboarding/services' => 3,
  '/onboarding/team-setup' => 4,
  '/onboarding/complete' => 5,
  _ => null,
};

/// True once the splash screen has been visible for its minimum brand time.
///
/// The router keeps the user on `/splash` until this is true, so a fast
/// session check never makes the splash flash by in a single frame.
final splashGateProvider = StateProvider<bool>((ref) => false);

/// Routes anyone can open without a staff session.
const Set<String> _publicExact = {
  '/splash',
  '/welcome',
  '/login',
  '/sign-up',
  '/forgot-password',
  '/reset-password',
  '/accept-invitation',
  // Secure customer portal (handoff 6.1/6.3). These are authorized by the
  // portal session (cookie / stored bearer), which is independent of the
  // staff session this guard manages — a signed-out staffer, a signed-in
  // staffer and a customer with a link must all be able to open them. The
  // old token prefixes (/portal/, /quote-approval/, /invoice-payment/,
  // /technician-tracking/) went away with the long-lived token design.
  '/open',
  '/p',
  '/p/closed',
};

/// Screens a signed-in user never needs to see again.
const Set<String> _authEntryPaths = {
  '/welcome',
  '/login',
  '/sign-up',
  '/accept-invitation',
};

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
  return _publicExact.contains(p);
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
  bool ownerOnboardingPending = false,
  String ownerOnboardingPath = kOwnerOnboardingPath,
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
      final entry = gate == AuthGate.sessionExpired ? kLoginPath : kWelcomePath;
      if (p == kSplashPath) return entry;
      return isPublicPath(p) ? null : entry;
    case AuthGate.signedIn:
      if (role == 'OWNER' && ownerOnboardingPending) {
        final requestedStep = _ownerOnboardingStepForPath(p);
        final requiredStep = _ownerOnboardingStepForPath(ownerOnboardingPath);
        if (requestedStep == null ||
            requiredStep == null ||
            requestedStep > requiredStep) {
          return _ownerOnboardingPaths.contains(ownerOnboardingPath)
              ? ownerOnboardingPath
              : kOwnerOnboardingPath;
        }
      }
      if (p == kSplashPath || _authEntryPaths.contains(p)) {
        return roleHome(role);
      }
      if (role == 'TECHNICIAN' && !isTechnicianAllowedPath(p)) {
        return kTechnicianHomePath;
      }
      return null;
  }
}
