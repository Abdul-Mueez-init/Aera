import 'package:aera/core/network/api_client.dart';
import 'package:aera/core/network/api_response.dart';
import 'package:aera/features/customers/data/customers_repository.dart';
import 'package:aera/features/jobs/data/jobs_repository.dart';
import 'package:aera/features/technician/widgets/handshake_code_sheet.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeJobsRepository extends JobsRepository {
  _FakeJobsRepository({this.errorToThrow}) : super(ApiClient());

  final ApiException? errorToThrow;
  String? submittedJobId;
  String? submittedCode;

  @override
  Future<Job> startJobWithCode(String jobId, String code) async {
    submittedJobId = jobId;
    submittedCode = code;
    final error = errorToThrow;
    if (error != null) throw error;
    return Job(
      id: jobId,
      jobNumber: 7,
      serviceType: 'HVAC Repair',
      problemDescription: 'Unit not cooling',
      priority: 'NORMAL',
      status: 'IN_PROGRESS',
      createdAt: DateTime(2026, 10, 24),
      updatedAt: DateTime(2026, 10, 24),
      customer: const JobCustomer(
        id: 'cust-1',
        firstName: 'Maria',
        lastName: 'Lopez',
      ),
      serviceAddress: const ServiceAddress(
        id: 'addr-1',
        label: 'Home',
        line1: '12 Oak St',
        city: 'Austin',
        countryCode: 'US',
      ),
    );
  }
}

/// Opens the sheet the same way EnRouteScreen does and records the
/// value it pops with.
class _SheetHarness extends StatelessWidget {
  const _SheetHarness({required this.onResult});

  final ValueChanged<Object?> onResult;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: ElevatedButton(
          onPressed: () async {
            final result = await showModalBottomSheet<Object?>(
              context: context,
              isScrollControlled: true,
              builder: (_) => const HandshakeCodeSheet(jobId: 'job-1'),
            );
            onResult(result);
          },
          child: const Text('open sheet'),
        ),
      ),
    );
  }
}

Future<void> _openSheet(WidgetTester tester, _FakeJobsRepository repo) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [jobsRepositoryProvider.overrideWithValue(repo)],
      child: MaterialApp(home: _SheetHarness(onResult: (_) {})),
    ),
  );
  await tester.tap(find.text('open sheet'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('renders code entry and submits the typed 6-digit code', (
    tester,
  ) async {
    final repo = _FakeJobsRepository();
    Object? popped;
    var popCount = 0;

    await tester.pumpWidget(
      ProviderScope(
        overrides: [jobsRepositoryProvider.overrideWithValue(repo)],
        child: MaterialApp(
          home: _SheetHarness(
            onResult: (result) {
              popped = result;
              popCount++;
            },
          ),
        ),
      ),
    );
    await tester.tap(find.text('open sheet'));
    await tester.pumpAndSettle();

    expect(find.text('Ask the customer for their code'), findsOneWidget);
    // The sheet itself must never show or prefill an expected code.
    expect(find.byType(TextField), findsOneWidget);

    await tester.enterText(find.byType(TextField), '123456');
    await tester.pump();
    await tester.tap(find.text('Start job'));
    await tester.pumpAndSettle();

    expect(repo.submittedJobId, 'job-1');
    expect(repo.submittedCode, '123456');
    expect(popCount, 1);
    expect(popped, isTrue);
    expect(find.text('Ask the customer for their code'), findsNothing);
  });

  testWidgets(
    'HANDSHAKE_INVALID keeps the sheet open with the server message',
    (tester) async {
      final repo = _FakeJobsRepository(
        errorToThrow: const ApiException(
          statusCode: 422,
          code: 'HANDSHAKE_INVALID',
          message: 'Invalid code. 3 attempts remaining.',
        ),
      );
      await _openSheet(tester, repo);

      await tester.enterText(find.byType(TextField), '000000');
      await tester.pump();
      await tester.tap(find.text('Start job'));
      await tester.pumpAndSettle();

      expect(repo.submittedCode, '000000');
      expect(find.text('Ask the customer for their code'), findsOneWidget);
      expect(find.textContaining('3 attempts remaining'), findsOneWidget);
    },
  );

  testWidgets(
    'HANDSHAKE_LOCKED shows the locked state with dispatch guidance',
    (tester) async {
      final repo = _FakeJobsRepository(
        errorToThrow: const ApiException(
          statusCode: 423,
          code: 'HANDSHAKE_LOCKED',
          message: 'Too many failed attempts. Try again in 15 minutes.',
        ),
      );
      await _openSheet(tester, repo);

      await tester.enterText(find.byType(TextField), '123456');
      await tester.pump();
      await tester.tap(find.text('Start job'));
      await tester.pumpAndSettle();

      expect(find.text('Too many attempts'), findsOneWidget);
      expect(find.textContaining('Locked — call dispatch'), findsOneWidget);
      expect(find.byType(TextField), findsNothing);
    },
  );
}
