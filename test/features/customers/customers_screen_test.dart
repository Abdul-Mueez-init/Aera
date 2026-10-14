import 'package:aera/features/customers/customer_detail_screen.dart';
import 'package:aera/features/customers/customers_screen.dart';
import 'package:aera/features/customers/data/customers_repository.dart';
import 'package:aera/features/customers/providers/customers_provider.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('CustomersScreen renders empty state when no customers exist',
      (tester) async {
    const emptyPage = PaginatedCustomers(
      items: [],
      meta: PageMeta(page: 1, pageSize: 20, total: 0, pageCount: 0),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          customersListProvider.overrideWith((ref) => Future.value(emptyPage)),
        ],
        child: const MaterialApp(
          home: CustomersScreen(),
        ),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text('Customers'), findsOneWidget);
    expect(find.text('No customers yet'), findsOneWidget);
    expect(find.text('Add your first customer to get started'), findsOneWidget);
  });

  testWidgets('CustomersScreen renders customer card with contact details',
      (tester) async {
    const testCustomer = Customer(
      id: 'cust-1',
      firstName: 'Marcus',
      lastName: 'Vance',
      email: 'marcus@example.com',
      phone: '+1 555 123 4567',
      status: 'ACTIVE',
      serviceAddresses: [
        ServiceAddress(
          id: 'addr-1',
          label: 'Primary',
          line1: '123 Main St',
          city: 'Austin',
          countryCode: 'US',
        ),
      ],
    );

    const populatedPage = PaginatedCustomers(
      items: [testCustomer],
      meta: PageMeta(page: 1, pageSize: 20, total: 1, pageCount: 1),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          customersListProvider
              .overrideWith((ref) => Future.value(populatedPage)),
        ],
        child: const MaterialApp(
          home: CustomersScreen(),
        ),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text('Marcus Vance'), findsOneWidget);
    expect(find.text('+1 555 123 4567'), findsOneWidget);
    expect(find.text('1 Active Accounts'), findsOneWidget);
    expect(find.text('MV'), findsOneWidget); // Customer initials
  });

  testWidgets('CustomerDetailScreen renders profile, multiple addresses, and Add Address action',
      (tester) async {
    const detailedCustomer = Customer(
      id: 'cust-1',
      firstName: 'Marcus',
      lastName: 'Vance',
      email: 'marcus@example.com',
      phone: '+1 555 123 4567',
      notes: 'Gate code 4321',
      status: 'ACTIVE',
      serviceAddresses: [
        ServiceAddress(
          id: 'addr-1',
          label: 'Primary Residence',
          line1: '123 Main St',
          city: 'Austin',
          countryCode: 'US',
        ),
        ServiceAddress(
          id: 'addr-2',
          label: 'Rental Unit',
          line1: '456 Oak Ave',
          city: 'Dallas',
          countryCode: 'US',
        ),
      ],
    );

    const emptyJobs = PaginatedCustomerJobs(
      items: [],
      meta: PageMeta(page: 1, pageSize: 20, total: 0, pageCount: 0),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          customerDetailProvider('cust-1')
              .overrideWith((ref) => Future.value(detailedCustomer)),
          customerJobsProvider('cust-1')
              .overrideWith((ref) => Future.value(emptyJobs)),
        ],
        child: const MaterialApp(
          home: CustomerDetailScreen(customerId: 'cust-1'),
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

    // Verify contact header
    expect(find.text('Marcus Vance'), findsWidgets);
    expect(find.text('marcus@example.com'), findsOneWidget);
    expect(find.text('Gate code 4321'), findsOneWidget);

    // Verify multiple addresses rendered
    expect(find.text('Service Addresses (2)'), findsOneWidget);
    expect(find.text('Primary Residence'), findsOneWidget);
    expect(find.text('Rental Unit'), findsOneWidget);

    // Verify "Add" address button exists
    expect(find.text('Add'), findsOneWidget);

    // Tap "Add" and verify dialog opens
    await tester.tap(find.text('Add'));
    await tester.pumpAndSettle();

    expect(find.text('Add Service Address'), findsOneWidget);
    expect(find.text('Street Address *'), findsOneWidget);
    expect(find.text('City *'), findsOneWidget);
  });
}
