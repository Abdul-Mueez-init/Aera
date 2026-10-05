import 'package:aera/core/network/api_client.dart';
import 'package:aera/core/network/api_response.dart';
import 'package:aera/features/settings/company_settings_screen.dart';
import 'package:aera/features/settings/data/company_repository.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeCompanyRepository extends CompanyRepository {
  _FakeCompanyRepository(this._results) : super(ApiClient());

  /// Each call to [getCurrentCompany] consumes the next result.
  final List<Object> _results;
  int calls = 0;

  @override
  Future<Company> getCurrentCompany() async {
    final result = _results[calls < _results.length ? calls : _results.length - 1];
    calls++;
    if (result is Company) return result;
    throw result;
  }
}

const _company = Company(
  id: 'company-1',
  name: 'Test HVAC Co',
  slug: 'test-hvac-co',
  timezone: 'Asia/Karachi',
  defaultCurrency: 'PKR',
);

Future<void> _pump(WidgetTester tester, CompanyRepository repo) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [companyRepositoryProvider.overrideWithValue(repo)],
      child: const MaterialApp(home: CompanySettingsScreen()),
    ),
  );
}

void main() {
  testWidgets('shows the real company details and nothing invented', (
    tester,
  ) async {
    await _pump(tester, _FakeCompanyRepository([_company]));
    await tester.pumpAndSettle();

    expect(find.text('Test HVAC Co'), findsWidgets);
    expect(find.text('test-hvac-co'), findsOneWidget);
    expect(find.text('Asia/Karachi'), findsOneWidget);
    expect(find.text('PKR'), findsOneWidget);

    expect(find.textContaining('Northstar'), findsNothing);
    expect(find.textContaining('NTN'), findsNothing);
    expect(find.textContaining('Fleet'), findsNothing);
  });

  testWidgets('shows a loading indicator first', (tester) async {
    await _pump(tester, _FakeCompanyRepository([_company]));

    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    await tester.pumpAndSettle();
  });

  testWidgets('shows the error and recovers on retry', (tester) async {
    final repo = _FakeCompanyRepository([
      const ApiException(
        statusCode: 403,
        code: 'TENANT_ACCESS_DENIED',
        message: 'Company access denied',
      ),
      _company,
    ]);
    await _pump(tester, repo);
    await tester.pumpAndSettle();

    expect(find.text('Company access denied'), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);

    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();

    expect(find.text('Asia/Karachi'), findsOneWidget);
    expect(repo.calls, 2);
  });
}
