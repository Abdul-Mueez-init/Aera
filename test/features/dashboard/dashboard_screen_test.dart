import 'package:aera/features/auth/data/auth_repository.dart';
import 'package:aera/features/auth/providers/auth_provider.dart';
import 'package:aera/features/dashboard/dashboard_screen.dart';
import 'package:aera/features/dashboard/data/dashboard_repository.dart';
import 'package:aera/features/dashboard/providers/dashboard_provider.dart';
import 'package:aera/features/dashboard/providers/get_started_provider.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('DashboardScreen renders real user greeting and empty states',
      (tester) async {
    const testUser = AuthUser(
      id: 'user-1',
      email: 'owner@test.com',
      firstName: 'Marcus',
      lastName: 'Aurelius',
    );
    const testCompany = AuthCompany(
      id: 'comp-1',
      name: 'Apex Climate',
      slug: 'apex-climate',
    );

    const emptySummary = DashboardSummary(
      date: '2026-10-14',
      timezone: 'UTC',
      jobsToday: 0,
      jobsByStatus: [],
      unassignedJobs: 0,
      outstandingInvoices: OutstandingInvoices(
        count: 0,
        balanceDueByCurrency: [],
      ),
      revenueThisMonth: RevenueThisMonth(
        periodStart: '2026-10-01T00:00:00.000Z',
        periodEnd: '2026-10-14T00:00:00.000Z',
        collectedByCurrency: [],
      ),
    );

    const emptyAlerts = DashboardAlerts(
      date: '2026-10-14',
      timezone: 'UTC',
      alerts: [],
    );

    const emptyToday = DashboardToday(
      date: '2026-10-14',
      jobs: [],
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          currentUserProvider.overrideWithValue(testUser),
          currentCompanyProvider.overrideWithValue(testCompany),
          dashboardSummaryProvider
              .overrideWith((ref) => Future.value(emptySummary)),
          dashboardAlertsProvider
              .overrideWith((ref) => Future.value(emptyAlerts)),
          dashboardTodayProvider(50)
              .overrideWith((ref) => Future.value(emptyToday)),
          getStartedProvider.overrideWith(
            (ref) => Future.value(
              const GetStartedProgress(
                hasCustomer: true,
                hasJob: true,
                hasTechnician: true,
              ),
            ),
          ),
        ],
        child: const MaterialApp(
          home: DashboardScreen(),
        ),
      ),
    );

    await tester.pumpAndSettle();

    // Verify company name & user greeting
    expect(find.text('APEX CLIMATE'), findsOneWidget);
    expect(find.textContaining('Marcus'), findsOneWidget);

    // Verify empty state messages
    expect(find.text('All Systems Operational'), findsOneWidget);
    expect(find.text('No jobs scheduled for today'), findsOneWidget);
  });

  testWidgets('DashboardScreen renders alerts and scheduled today jobs',
      (tester) async {
    const summary = DashboardSummary(
      date: '2026-10-14',
      timezone: 'UTC',
      jobsToday: 1,
      jobsByStatus: [
        JobStatusCount(status: 'SCHEDULED', count: 1),
      ],
      unassignedJobs: 0,
      outstandingInvoices: OutstandingInvoices(
        count: 1,
        balanceDueByCurrency: [
          CurrencyAmount(currency: 'USD', totalMinor: '25000'),
        ],
      ),
      revenueThisMonth: RevenueThisMonth(
        periodStart: '2026-10-01T00:00:00.000Z',
        periodEnd: '2026-10-14T00:00:00.000Z',
        collectedByCurrency: [
          CurrencyAmount(currency: 'USD', totalMinor: '15000'),
        ],
      ),
    );

    final alerts = DashboardAlerts(
      date: '2026-10-14',
      timezone: 'UTC',
      alerts: [
        const Alert(
          type: 'PAST_START_TIME',
          jobId: 'job-123',
          jobNumber: 'JOB-42',
          customerName: 'Robert Vance',
          message: 'Job JOB-42 was scheduled to start at 08:00 but is still SCHEDULED',
          severity: 'warning',
        ),
      ],
    );

    const today = DashboardToday(
      date: '2026-10-14',
      jobs: [
        TodayJob(
          id: 'job-123',
          jobNumber: '42',
          customerName: 'Robert Vance',
          serviceType: 'Compressor Repair',
          addressLine: '100 Industrial Pkwy',
          technicianName: 'Bob Vance',
          status: 'SCHEDULED',
          windowStart: '2026-10-14T08:00:00.000Z',
          windowEnd: '2026-10-14T10:00:00.000Z',
        ),
      ],
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          dashboardSummaryProvider.overrideWith((ref) => Future.value(summary)),
          dashboardAlertsProvider.overrideWith((ref) => Future.value(alerts)),
          dashboardTodayProvider(50).overrideWith((ref) => Future.value(today)),
          getStartedProvider.overrideWith(
            (ref) => Future.value(
              const GetStartedProgress(
                hasCustomer: true,
                hasJob: true,
                hasTechnician: true,
              ),
            ),
          ),
        ],
        child: const MaterialApp(
          home: DashboardScreen(),
        ),
      ),
    );

    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    await tester.pumpAndSettle();

    // Verify alert displayed
    expect(find.text('PAST_START_TIME'), findsOneWidget);
    expect(find.textContaining('Job JOB-42 was scheduled to start'), findsOneWidget);

    // Verify today's job displayed
    expect(find.text('Robert Vance'), findsOneWidget);
    expect(find.text('Compressor Repair'), findsOneWidget);
    expect(find.text('100 Industrial Pkwy'), findsOneWidget);
    expect(find.text('Bob Vance'), findsOneWidget);
  });
}
