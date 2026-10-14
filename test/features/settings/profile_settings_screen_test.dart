import 'package:aera/core/network/api_client.dart';
import 'package:aera/features/auth/data/auth_repository.dart';
import 'package:aera/features/auth/providers/auth_provider.dart';
import 'package:aera/features/settings/profile_settings_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('renders authentic user details and no fake data or fake toggles', (
    tester,
  ) async {
    const testUser = AuthUser(
      id: 'user-123',
      email: 'alex.smith@example.com',
      firstName: 'Alex',
      lastName: 'Smith',
    );
    const testCompany = AuthCompany(
      id: 'comp-123',
      name: 'Apex Heating & Cooling',
      slug: 'apex-hvac',
    );
    const testSession = AuthSession(
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: testUser,
      company: testCompany,
      role: 'OWNER',
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          currentUserProvider.overrideWithValue(testUser),
          currentCompanyProvider.overrideWithValue(testCompany),
          currentRoleProvider.overrideWithValue('OWNER'),
          authNotifierProvider.overrideWith(
            (ref) => _FakeAuthNotifier(const AsyncValue.data(testSession)),
          ),
        ],
        child: const MaterialApp(
          home: ProfileSettingsScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Alex Smith'), findsOneWidget);
    expect(find.text('Owner'), findsOneWidget);
    expect(find.text('alex.smith@example.com'), findsOneWidget);
    expect(find.text('Apex Heating & Cooling'), findsOneWidget);
    expect(find.text('Sign Out of Aera OS'), findsOneWidget);

    // Verify all fake fields and toggles are absent
    expect(find.textContaining('Marcus Vance'), findsNothing);
    expect(find.textContaining('northstarclimate'), findsNothing);
    expect(find.textContaining('Biometric'), findsNothing);
    expect(find.textContaining('Offline Field'), findsNothing);
    expect(find.textContaining('Auto-Intervention'), findsNothing);
    expect(find.textContaining('Verified'), findsNothing);
  });
}

class _FakeAuthNotifier extends AuthNotifier {
  _FakeAuthNotifier(AsyncValue<AuthSession?> initial)
      : super(_NoopAuthRepo(), _FakeRef()) {
    state = initial;
  }
}

class _FakeRef implements Ref {
  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

class _NoopAuthRepo extends AuthRepository {
  _NoopAuthRepo() : super(ApiClient());

  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}
