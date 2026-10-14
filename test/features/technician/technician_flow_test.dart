import 'package:aera/core/router/route_guard.dart';
import 'package:aera/features/customers/data/customers_repository.dart';
import 'package:aera/features/jobs/data/jobs_repository.dart';
import 'package:aera/features/technician/providers/technician_provider.dart';
import 'package:aera/features/technician/technician_home_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Technician Flow & Route Guard Tests', () {
    test('Technician role cannot open owner routes (redirects to /technician-home)', () {
      // 1. Dashboard blocked
      final dashRedirect = resolveRedirect(
        gate: AuthGate.signedIn,
        role: 'TECHNICIAN',
        path: '/dashboard',
      );
      expect(dashRedirect, equals(kTechnicianHomePath));

      // 2. Company settings blocked
      final settingsRedirect = resolveRedirect(
        gate: AuthGate.signedIn,
        role: 'TECHNICIAN',
        path: '/company-settings',
      );
      expect(settingsRedirect, equals(kTechnicianHomePath));

      // 3. Customers list blocked
      final custRedirect = resolveRedirect(
        gate: AuthGate.signedIn,
        role: 'TECHNICIAN',
        path: '/customers',
      );
      expect(custRedirect, equals(kTechnicianHomePath));

      // 4. Technician routes allowed
      final homeRedirect = resolveRedirect(
        gate: AuthGate.signedIn,
        role: 'TECHNICIAN',
        path: '/technician-home',
      );
      expect(homeRedirect, isNull);

      final briefRedirect = resolveRedirect(
        gate: AuthGate.signedIn,
        role: 'TECHNICIAN',
        path: '/technician/jobs/123/brief',
      );
      expect(briefRedirect, isNull);

      final workRedirect = resolveRedirect(
        gate: AuthGate.signedIn,
        role: 'TECHNICIAN',
        path: '/technician/jobs/123/work',
      );
      expect(workRedirect, isNull);
    });

    testWidgets('TechnicianHomeScreen renders empty state when no jobs', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            technicianTodayProvider.overrideWith((ref) async => <Job>[]),
          ],
          child: const MaterialApp(
            home: TechnicianHomeScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('Today'), findsOneWidget);
      expect(find.text('TECHNICIAN'), findsOneWidget);
      expect(find.text('No jobs scheduled for today'), findsOneWidget);
    });

    testWidgets('TechnicianHomeScreen renders job card when jobs exist', (tester) async {
      final dummyJob = Job(
        id: 'job-tech-1',
        jobNumber: 101,
        status: 'SCHEDULED',
        priority: 'HIGH',
        serviceType: 'Compressor Repair',
        problemDescription: 'Unit vibrating',
        customer: const JobCustomer(
          id: 'cust-1',
          firstName: 'Jim',
          lastName: 'Halpert',
        ),
        serviceAddress: const ServiceAddress(
          id: 'addr-1',
          label: 'Office',
          line1: '1725 Slough Ave',
          city: 'Scranton',
          region: 'PA',
          postalCode: '18503',
          countryCode: 'US',
        ),
        scheduledStart: DateTime.utc(2026, 10, 15, 10, 0),
        scheduledEnd: DateTime.utc(2026, 10, 15, 12, 0),
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            technicianTodayProvider.overrideWith((ref) async => [dummyJob]),
          ],
          child: const MaterialApp(
            home: TechnicianHomeScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('Compressor Repair'), findsOneWidget);
      expect(find.text('Jim Halpert'), findsOneWidget);
      expect(find.text('SCHEDULED'), findsOneWidget);
      expect(find.text('View brief'), findsOneWidget);
    });
  });
}
