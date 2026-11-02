import 'package:aera/core/network/api_response.dart';
import 'package:aera/core/router/route_guard.dart';
import 'package:aera/features/auth/data/auth_repository.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

const _session = AuthSession(
  accessToken: 'access',
  refreshToken: 'refresh',
  user: AuthUser(
    id: 'user-1',
    email: 'owner@example.com',
    firstName: 'Sam',
    lastName: 'Owner',
  ),
  company: AuthCompany(id: 'company-1', name: 'Test HVAC Co', slug: 'test'),
  role: 'OWNER',
);

String? _redirect(
  AuthGate gate,
  String path, {
  String? role,
  bool holdSplash = false,
  bool ownerOnboardingPending = false,
  bool wizardBusinessBasicsComplete = false,
  bool wizardServiceAreaComplete = false,
  bool wizardServicesComplete = false,
}) => resolveRedirect(
  gate: gate,
  role: role,
  path: path,
  holdSplash: holdSplash,
  ownerOnboardingPending: ownerOnboardingPending,
  wizardBusinessBasicsComplete: wizardBusinessBasicsComplete,
  wizardServiceAreaComplete: wizardServiceAreaComplete,
  wizardServicesComplete: wizardServicesComplete,
);

void main() {
  group('authGateFor', () {
    test('loading state is the loading gate', () {
      expect(authGateFor(const AsyncValue.loading()), AuthGate.loading);
    });

    test('data(null) is signed out', () {
      expect(authGateFor(const AsyncValue.data(null)), AuthGate.signedOut);
    });

    test('data(session) is signed in', () {
      expect(authGateFor(const AsyncValue.data(_session)), AuthGate.signedIn);
    });

    test('SessionExpiredException is the sessionExpired gate', () {
      final state = AsyncValue<AuthSession?>.error(
        const SessionExpiredException(),
        StackTrace.empty,
      );
      expect(authGateFor(state), AuthGate.sessionExpired);
    });

    test('any other error (e.g. wrong password) is just signed out', () {
      final state = AsyncValue<AuthSession?>.error(
        const ApiException(
          statusCode: 401,
          code: 'AUTH_INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        ),
        StackTrace.empty,
      );
      expect(authGateFor(state), AuthGate.signedOut);
    });
  });

  group('loading', () {
    test('stays on /splash', () {
      expect(_redirect(AuthGate.loading, '/splash'), isNull);
    });

    test('a protected route goes to /splash (never flashes Welcome)', () {
      expect(_redirect(AuthGate.loading, '/dashboard'), '/splash');
      expect(_redirect(AuthGate.loading, '/technician-home'), '/splash');
    });

    test('public routes are left alone (e.g. mid sign-in)', () {
      expect(_redirect(AuthGate.loading, '/login'), isNull);
      expect(_redirect(AuthGate.loading, '/sign-up'), isNull);
      expect(_redirect(AuthGate.loading, '/p'), isNull);
    });
  });

  group('signed out', () {
    test('splash goes to Welcome once the gate is open', () {
      expect(_redirect(AuthGate.signedOut, '/splash'), '/welcome');
    });

    test('splash is held while the minimum brand time has not passed', () {
      expect(
        _redirect(AuthGate.signedOut, '/splash', holdSplash: true),
        isNull,
      );
    });

    test('protected routes go to Welcome', () {
      for (final path in [
        '/dashboard',
        '/jobs',
        '/jobs/abc',
        '/customers/abc',
        '/calendar',
        '/more',
        '/profile-settings',
        '/company-settings',
        '/technician-home',
        '/technician/jobs/abc/brief',
        '/create-job',
        '/team',
      ]) {
        expect(_redirect(AuthGate.signedOut, path), '/welcome', reason: path);
      }
    });

    test('public routes are reachable', () {
      for (final path in [
        '/welcome',
        '/login',
        '/sign-up',
        '/forgot-password',
        '/reset-password',
        '/accept-invitation',
        // Secure customer portal paths (session-based, not staff auth).
        '/open',
        '/p',
        '/p/closed',
      ]) {
        expect(_redirect(AuthGate.signedOut, path), isNull, reason: path);
      }
    });

    test('a trailing slash does not change the answer', () {
      expect(_redirect(AuthGate.signedOut, '/dashboard/'), '/welcome');
      expect(_redirect(AuthGate.signedOut, '/login/'), isNull);
    });
  });

  group('session expired', () {
    test('splash and protected routes go to Login, not Welcome', () {
      expect(_redirect(AuthGate.sessionExpired, '/splash'), '/login');
      expect(_redirect(AuthGate.sessionExpired, '/dashboard'), '/login');
      expect(_redirect(AuthGate.sessionExpired, '/jobs/abc'), '/login');
    });

    test('public routes are still reachable', () {
      expect(_redirect(AuthGate.sessionExpired, '/login'), isNull);
      expect(_redirect(AuthGate.sessionExpired, '/welcome'), isNull);
      expect(_redirect(AuthGate.sessionExpired, '/p'), isNull);
    });
  });

  group('signed in as owner or dispatcher', () {
    for (final role in ['OWNER', 'DISPATCHER']) {
      test('$role: entry screens go to the dashboard', () {
        for (final path in [
          '/splash',
          '/welcome',
          '/login',
          '/sign-up',
          '/accept-invitation',
        ]) {
          expect(
            _redirect(AuthGate.signedIn, path, role: role),
            '/dashboard',
            reason: path,
          );
        }
      });

      test('$role: splash is held until the brand time has passed', () {
        expect(
          _redirect(AuthGate.signedIn, '/splash', role: role, holdSplash: true),
          isNull,
        );
      });

      test('$role: can open management and technician screens', () {
        for (final path in [
          '/dashboard',
          '/jobs',
          '/jobs/abc',
          '/customers',
          '/more',
          '/company-settings',
          '/technician-home',
        ]) {
          expect(
            _redirect(AuthGate.signedIn, path, role: role),
            isNull,
            reason: path,
          );
        }
      });
    }
  });

  group('OWNER onboarding with in-memory wizard', () {
    test('cold start on non-onboarding, non-portal paths redirects to business-basics', () {
      for (final path in [
        '/dashboard',
        '/jobs',
        '/customers',
        '/company-settings',
      ]) {
        expect(
          _redirect(
            AuthGate.signedIn,
            path,
            role: 'OWNER',
            ownerOnboardingPending: true,
            wizardBusinessBasicsComplete: false,
            wizardServiceAreaComplete: false,
            wizardServicesComplete: false,
          ),
          '/onboarding/business-basics',
          reason: path,
        );
      }
    });

    test('pending owner with step 1 complete opening /dashboard redirects to service-area', () {
      expect(
        _redirect(
          AuthGate.signedIn,
          '/dashboard',
          role: 'OWNER',
          ownerOnboardingPending: true,
          wizardBusinessBasicsComplete: true,
          wizardServiceAreaComplete: false,
          wizardServicesComplete: false,
        ),
        '/onboarding/service-area',
      );
    });

    test('pending owner with step 2 complete opening /dashboard redirects to services', () {
      expect(
        _redirect(
          AuthGate.signedIn,
          '/dashboard',
          role: 'OWNER',
          ownerOnboardingPending: true,
          wizardBusinessBasicsComplete: true,
          wizardServiceAreaComplete: true,
          wizardServicesComplete: false,
        ),
        '/onboarding/services',
      );
    });

    test('pending owner with step 3 complete opening /dashboard redirects to team-setup', () {
      expect(
        _redirect(
          AuthGate.signedIn,
          '/dashboard',
          role: 'OWNER',
          ownerOnboardingPending: true,
          wizardBusinessBasicsComplete: true,
          wizardServiceAreaComplete: true,
          wizardServicesComplete: true,
        ),
        '/onboarding/team-setup',
      );
    });

    test('cannot jump to service-area without business basics complete', () {
      expect(
        _redirect(
          AuthGate.signedIn,
          '/onboarding/service-area',
          role: 'OWNER',
          ownerOnboardingPending: true,
          wizardBusinessBasicsComplete: false,
          wizardServiceAreaComplete: false,
          wizardServicesComplete: false,
        ),
        '/onboarding/business-basics',
      );
    });

    test('cannot jump to services without service-area complete', () {
      expect(
        _redirect(
          AuthGate.signedIn,
          '/onboarding/services',
          role: 'OWNER',
          ownerOnboardingPending: true,
          wizardBusinessBasicsComplete: true,
          wizardServiceAreaComplete: false,
          wizardServicesComplete: false,
        ),
        '/onboarding/business-basics',
      );
    });

    test('cannot jump to team-setup without services complete', () {
      expect(
        _redirect(
          AuthGate.signedIn,
          '/onboarding/team-setup',
          role: 'OWNER',
          ownerOnboardingPending: true,
          wizardBusinessBasicsComplete: true,
          wizardServiceAreaComplete: true,
          wizardServicesComplete: false,
        ),
        '/onboarding/business-basics',
      );
    });

    test('completed owner goes to dashboard', () {
      expect(
        _redirect(
          AuthGate.signedIn,
          '/onboarding/business-basics',
          role: 'OWNER',
          ownerOnboardingPending: false,
        ),
        '/dashboard',
      );
    });

    test('completed owner on any onboarding path goes to dashboard', () {
      for (final path in [
        '/onboarding/business-basics',
        '/onboarding/service-area',
        '/onboarding/services',
        '/onboarding/team-setup',
        '/onboarding/complete',
      ]) {
        expect(
          _redirect(
            AuthGate.signedIn,
            path,
            role: 'OWNER',
            ownerOnboardingPending: false,
          ),
          '/dashboard',
          reason: path,
        );
      }
    });
  });

  group('TECHNICIAN and PORTAL paths unchanged', () {
    test('TECHNICIAN goes to technician-home on entry screens', () {
      for (final path in [
        '/splash',
        '/welcome',
        '/login',
        '/sign-up',
      ]) {
        expect(
          _redirect(AuthGate.signedIn, path, role: 'TECHNICIAN'),
          '/technician-home',
          reason: path,
        );
      }
    });

    test('portal paths are exempt from onboarding redirects', () {
      for (final path in ['/open', '/p', '/p/closed']) {
        expect(
          _redirect(
            AuthGate.signedIn,
            path,
            role: 'OWNER',
            ownerOnboardingPending: true,
          ),
          isNull,
          reason: path,
        );
      }
    });
  });

  group('new owner onboarding handoff', () {
    test('new owner is sent into onboarding and cannot skip to Dashboard', () {
      expect(
        _redirect(
          AuthGate.signedIn,
          '/sign-up',
          role: 'OWNER',
          ownerOnboardingPending: true,
          wizardBusinessBasicsComplete: false,
          wizardServiceAreaComplete: false,
          wizardServicesComplete: false,
        ),
        '/onboarding/business-basics',
      );
      expect(
        _redirect(
          AuthGate.signedIn,
          '/dashboard',
          role: 'OWNER',
          ownerOnboardingPending: true,
          wizardBusinessBasicsComplete: false,
          wizardServiceAreaComplete: false,
          wizardServicesComplete: false,
        ),
        '/onboarding/business-basics',
      );
    });

    test('new owner may open only the first available step', () {
      expect(
        _redirect(
          AuthGate.signedIn,
          '/onboarding/business-basics',
          role: 'OWNER',
          ownerOnboardingPending: true,
          wizardBusinessBasicsComplete: false,
          wizardServiceAreaComplete: false,
          wizardServicesComplete: false,
        ),
        isNull,
      );
      expect(
        _redirect(
          AuthGate.signedIn,
          '/onboarding/service-area',
          role: 'OWNER',
          ownerOnboardingPending: true,
          wizardBusinessBasicsComplete: false,
          wizardServiceAreaComplete: false,
          wizardServicesComplete: false,
        ),
        '/onboarding/business-basics',
      );
    });

    test('forward navigation cannot skip wizard prerequisites', () {
      expect(
        _redirect(
          AuthGate.signedIn,
          '/onboarding/team-setup',
          role: 'OWNER',
          ownerOnboardingPending: true,
          wizardBusinessBasicsComplete: false,
          wizardServiceAreaComplete: false,
          wizardServicesComplete: false,
        ),
        '/onboarding/business-basics',
      );
    });
  });

  group('signed-in owner with onboarding pending opening portal paths', () {
    test('portal paths are exempt from the onboarding redirect', () {
      for (final path in ['/open', '/p', '/p/closed']) {
        expect(
          _redirect(
            AuthGate.signedIn,
            path,
            role: 'OWNER',
            ownerOnboardingPending: true,
            wizardBusinessBasicsComplete: false,
            wizardServiceAreaComplete: false,
            wizardServicesComplete: false,
          ),
          isNull,
          reason: path,
        );
      }
    });

    test('non-portal paths still redirect to onboarding', () {
      expect(
        _redirect(
          AuthGate.signedIn,
          '/dashboard',
          role: 'OWNER',
          ownerOnboardingPending: true,
          wizardBusinessBasicsComplete: false,
          wizardServiceAreaComplete: false,
          wizardServicesComplete: false,
        ),
        '/onboarding/business-basics',
      );
    });
  });

  group('incomplete owner with empty wizard goes to step 1', () {
    test('incomplete owner with empty wizard state goes to step 1', () {
      expect(
        _redirect(
          AuthGate.signedIn,
          '/dashboard',
          role: 'OWNER',
          ownerOnboardingPending: true,
          wizardBusinessBasicsComplete: false,
          wizardServiceAreaComplete: false,
          wizardServicesComplete: false,
        ),
        '/onboarding/business-basics',
      );
    });
  });

  group('signed in as technician', () {
    test('entry screens go to Technician Home', () {
      for (final path in [
        '/splash',
        '/welcome',
        '/login',
        '/sign-up',
        '/accept-invitation',
      ]) {
        expect(
          _redirect(AuthGate.signedIn, path, role: 'TECHNICIAN'),
          '/technician-home',
          reason: path,
        );
      }
    });

    test('owner/dispatcher routes redirect to Technician Home', () {
      for (final path in [
        '/dashboard',
        '/jobs',
        '/calendar',
        '/customers',
        '/customers/abc',
        '/customers/abc/edit',
        '/more',
        '/quotes',
        '/quotes/abc',
        '/invoices',
        '/invoices/abc',
        '/create-customer',
        '/create-job',
        '/schedule-job/abc',
        '/create-quote',
        '/create-invoice',
        '/ai-assistant',
        '/ai-insight/abc',
        '/company-settings',
        '/team',
      ]) {
        expect(
          _redirect(AuthGate.signedIn, path, role: 'TECHNICIAN'),
          '/technician-home',
          reason: path,
        );
      }
    });

    test('technician screens and job detail are allowed', () {
      for (final path in [
        '/technician-home',
        '/technician/jobs/abc/brief',
        '/technician/jobs/abc/en-route',
        '/technician/jobs/abc/work',
        '/technician/jobs/abc/evidence',
        '/technician/jobs/abc/complete',
        '/jobs/abc',
        '/profile-settings',
        '/notifications',
      ]) {
        expect(
          _redirect(AuthGate.signedIn, path, role: 'TECHNICIAN'),
          isNull,
          reason: path,
        );
      }
    });
  });

  group('helpers', () {
    test('roleHome', () {
      expect(roleHome('TECHNICIAN'), '/technician-home');
      expect(roleHome('OWNER'), '/dashboard');
      expect(roleHome('DISPATCHER'), '/dashboard');
      expect(roleHome(null), '/dashboard');
    });

    test('portal paths are public; the technician area is not', () {
      expect(isPublicPath('/open'), isTrue);
      expect(isPublicPath('/p'), isTrue);
      expect(isPublicPath('/p/closed'), isTrue);
      expect(isPublicPath('/technician/jobs/abc/brief'), isFalse);
      expect(isPublicPath('/technician-home'), isFalse);
      // The old long-lived-token routes are gone and no longer public.
      expect(isPublicPath('/technician-tracking/t/j'), isFalse);
      expect(isPublicPath('/portal/some-token'), isFalse);
    });
  });
}
