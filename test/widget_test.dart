import 'package:aera/core/network/api_client.dart';
import 'package:aera/core/router/app_router.dart';
import 'package:aera/core/widgets/aera_bottom_nav.dart';
import 'package:aera/features/auth/data/auth_repository.dart';
import 'package:aera/features/auth/login_screen.dart';
import 'package:aera/features/auth/providers/auth_provider.dart';
import 'package:aera/features/auth/splash_screen.dart';
import 'package:aera/features/auth/welcome_screen.dart';
import 'package:aera/features/dashboard/dashboard_screen.dart';
import 'package:aera/features/quotes/quote_approval_screen.dart';
import 'package:aera/features/technician/technician_home_screen.dart';
import 'package:aera/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// Stands in for the real repository so no storage or network is touched.
class _FakeAuthRepository extends AuthRepository {
  _FakeAuthRepository({this.session, this.expired = false})
    : super(ApiClient());

  final AuthSession? session;
  final bool expired;

  @override
  Future<AuthSession?> restoreSession() async {
    if (expired) throw const SessionExpiredException();
    return session;
  }

  @override
  Future<void> logout() async {}

  @override
  Future<void> clearLocalSession() async {}
}

AuthSession _sessionFor(String role) => AuthSession(
  accessToken: 'access',
  refreshToken: 'refresh',
  user: const AuthUser(
    id: 'user-1',
    email: 'person@example.com',
    firstName: 'Sam',
    lastName: 'Tester',
  ),
  company: const AuthCompany(
    id: 'company-1',
    name: 'Test HVAC Co',
    slug: 'test-hvac-co',
  ),
  role: role,
);

/// Starts the real app (real router, real redirect rules) with a fake
/// session store and returns the container so tests can drive it.
Future<ProviderContainer> _startApp(
  WidgetTester tester,
  _FakeAuthRepository repo,
) async {
  tester.view.physicalSize = const Size(1440, 3000);
  tester.view.devicePixelRatio = 2.0;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });

  final container = ProviderContainer(
    overrides: [
      authNotifierProvider.overrideWith((ref) => AuthNotifier(repo)),
    ],
  );
  addTearDown(container.dispose);

  await tester.pumpWidget(
    UncontrolledProviderScope(container: container, child: const AeraApp()),
  );

  // Cold start always begins on the splash.
  await tester.pump();
  expect(find.byType(SplashScreen), findsOneWidget);

  // Let the splash's minimum brand time pass, then let the router redirect.
  await tester.pump(const Duration(milliseconds: 1300));
  await tester.pump();
  await tester.pumpAndSettle();
  return container;
}

void main() {
  testWidgets('cold start with no session lands on Welcome', (tester) async {
    await _startApp(tester, _FakeAuthRepository());

    expect(find.byType(WelcomeScreen), findsOneWidget);
    expect(find.byType(DashboardScreen), findsNothing);
  });

  testWidgets('cold start with a dead session lands on Login', (tester) async {
    await _startApp(tester, _FakeAuthRepository(expired: true));

    expect(find.byType(LoginScreen), findsOneWidget);
    expect(find.byType(WelcomeScreen), findsNothing);
  });

  testWidgets('cold start with an owner session lands on the dashboard', (
    tester,
  ) async {
    await _startApp(tester, _FakeAuthRepository(session: _sessionFor('OWNER')));

    expect(find.byType(DashboardScreen), findsOneWidget);
    expect(find.byType(AeraBottomNav), findsOneWidget);
  });

  testWidgets('cold start with a technician session lands on Technician Home '
      'without owner tabs', (tester) async {
    await _startApp(
      tester,
      _FakeAuthRepository(session: _sessionFor('TECHNICIAN')),
    );

    expect(find.byType(TechnicianHomeScreen), findsOneWidget);
    expect(find.byType(DashboardScreen), findsNothing);
    expect(find.byType(AeraBottomNav), findsNothing);
  });

  testWidgets('a technician who opens an owner route is sent back', (
    tester,
  ) async {
    final container = await _startApp(
      tester,
      _FakeAuthRepository(session: _sessionFor('TECHNICIAN')),
    );

    container.read(routerProvider).go('/dashboard');
    await tester.pumpAndSettle();

    expect(find.byType(TechnicianHomeScreen), findsOneWidget);
    expect(find.byType(DashboardScreen), findsNothing);
  });

  testWidgets('a signed-out user who opens an inner route is sent to Welcome', (
    tester,
  ) async {
    final container = await _startApp(tester, _FakeAuthRepository());

    container.read(routerProvider).go('/dashboard');
    await tester.pumpAndSettle();

    expect(find.byType(WelcomeScreen), findsOneWidget);
    expect(find.byType(DashboardScreen), findsNothing);
  });

  testWidgets('customer links open without a session', (tester) async {
    final container = await _startApp(tester, _FakeAuthRepository());

    container.read(routerProvider).go('/quote-approval/some-share-token');
    await tester.pumpAndSettle();

    expect(find.byType(QuoteApprovalScreen), findsOneWidget);
    expect(find.byType(WelcomeScreen), findsNothing);
  });

  testWidgets('signing out sends the user to Welcome', (tester) async {
    final container = await _startApp(
      tester,
      _FakeAuthRepository(session: _sessionFor('OWNER')),
    );
    expect(find.byType(DashboardScreen), findsOneWidget);

    await container.read(authNotifierProvider.notifier).logout();
    await tester.pumpAndSettle();

    expect(find.byType(WelcomeScreen), findsOneWidget);
    expect(find.byType(DashboardScreen), findsNothing);
  });

  testWidgets('a session that dies while the app is open lands on Login', (
    tester,
  ) async {
    final container = await _startApp(
      tester,
      _FakeAuthRepository(session: _sessionFor('OWNER')),
    );
    expect(find.byType(DashboardScreen), findsOneWidget);

    await container.read(authNotifierProvider.notifier).handleSessionExpired();
    await tester.pumpAndSettle();

    expect(find.byType(LoginScreen), findsOneWidget);
    expect(find.byType(DashboardScreen), findsNothing);
  });
}
