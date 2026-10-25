import 'package:aera/core/network/api_client.dart';
import 'package:aera/features/customers/data/customers_repository.dart';
import 'package:aera/features/jobs/data/jobs_repository.dart';
import 'package:aera/features/jobs/widgets/job_portal_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeJobsRepository extends JobsRepository {
  _FakeJobsRepository(this.access) : super(ApiClient());

  final PortalAccessStatus? access;

  @override
  Future<PortalAccessStatus?> getPortalAccess(String jobId) async => access;
}

Job _job({String status = 'SCHEDULED'}) => Job(
  id: 'job-1',
  jobNumber: 42,
  serviceType: 'HVAC Repair',
  problemDescription: 'Unit not cooling',
  priority: 'NORMAL',
  status: status,
  createdAt: DateTime(2026, 10, 24),
  updatedAt: DateTime(2026, 10, 24),
  customer: const JobCustomer(
    id: 'cust-1',
    firstName: 'Maria',
    lastName: 'Lopez',
    email: 'maria@example.com',
    phone: '+1 (555) 010-2233',
  ),
  serviceAddress: const ServiceAddress(
    id: 'addr-1',
    label: 'Home',
    line1: '12 Oak St',
    city: 'Austin',
    countryCode: 'US',
  ),
);

Future<void> _pumpCard(
  WidgetTester tester, {
  required PortalAccessStatus? access,
  String jobStatus = 'SCHEDULED',
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        jobsRepositoryProvider.overrideWithValue(_FakeJobsRepository(access)),
      ],
      child: MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: JobPortalCard(
              job: _job(status: jobStatus),
              companyName: 'Acme HVAC',
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('no grant shows "NOT SENT" chip and Send link action', (
    tester,
  ) async {
    await _pumpCard(tester, access: null);

    expect(find.text('Portal access'), findsOneWidget);
    expect(find.text('NOT SENT'), findsOneWidget);
    expect(find.text('Send link'), findsOneWidget);
    expect(find.text('DEACTIVATED'), findsNothing);
  });

  testWidgets('active unopened grant shows "SENT – NOT OPENED" with actions', (
    tester,
  ) async {
    await _pumpCard(
      tester,
      access: PortalAccessStatus(
        status: 'ACTIVE',
        createdAt: DateTime(2026, 10, 24, 9, 30),
      ),
    );

    expect(find.text('SENT – NOT OPENED'), findsOneWidget);
    expect(find.text('Reissue link'), findsOneWidget);
    expect(find.text('Deactivate'), findsOneWidget);
  });

  testWidgets('active opened grant shows "OPENED …" chip', (tester) async {
    await _pumpCard(
      tester,
      access: PortalAccessStatus(
        status: 'ACTIVE',
        linkConsumedAt: DateTime(2026, 10, 24, 10, 0),
        lastSeenAt: DateTime(2026, 10, 24, 11, 15),
      ),
    );

    expect(find.textContaining('OPENED'), findsOneWidget);
    expect(find.text('SENT – NOT OPENED'), findsNothing);
  });

  testWidgets('deactivated grant shows reason and Send new link', (
    tester,
  ) async {
    await _pumpCard(
      tester,
      access: PortalAccessStatus(
        status: 'DEACTIVATED',
        deactivatedAt: DateTime(2026, 10, 24, 12, 0),
        deactivatedReason: 'MANUAL',
      ),
    );

    expect(find.text('DEACTIVATED'), findsOneWidget);
    expect(find.textContaining('Deactivated by staff'), findsOneWidget);
    expect(find.text('Send new link'), findsOneWidget);
  });

  testWidgets('EN_ROUTE job shows the Override start action', (tester) async {
    await _pumpCard(
      tester,
      access: const PortalAccessStatus(status: 'ACTIVE'),
      jobStatus: 'EN_ROUTE',
    );

    expect(find.text('Override start'), findsOneWidget);
  });

  testWidgets('non-EN_ROUTE job hides the Override start action', (
    tester,
  ) async {
    await _pumpCard(
      tester,
      access: const PortalAccessStatus(status: 'ACTIVE'),
      jobStatus: 'SCHEDULED',
    );

    expect(find.text('Override start'), findsNothing);
  });
}
