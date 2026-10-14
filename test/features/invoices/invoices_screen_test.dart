import 'package:aera/features/invoices/data/invoices_repository.dart';
import 'package:aera/features/invoices/invoices_screen.dart';
import 'package:aera/features/invoices/providers/invoices_provider.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('InvoicesScreen Widget Tests', () {
    testWidgets('renders empty state when no invoices exist', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            invoicesListProvider.overrideWith((ref) async => <Invoice>[]),
          ],
          child: const MaterialApp(
            home: InvoicesScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('Invoices & Receivables'), findsOneWidget);
      expect(find.text('No invoices yet'), findsOneWidget);
    });

    testWidgets('renders invoice item with invoiceNumber and balanceDue', (tester) async {
      final dummyInvoice = Invoice(
        id: 'inv-1',
        customerId: 'cust-1',
        invoiceNumber: 'INV-000001',
        status: 'ISSUED',
        subtotalMinor: 14500,
        discountMinor: 0,
        taxMinor: 0,
        totalMinor: 14500,
        amountPaidMinor: 0,
        balanceDueMinor: 14500,
        currency: 'USD',
        customer: const InvoiceCustomer(
          id: 'cust-1',
          firstName: 'Angela',
          lastName: 'Martin',
          email: 'angela@example.com',
        ),
        items: const [],
        payments: const [],
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            invoicesListProvider.overrideWith((ref) async => [dummyInvoice]),
          ],
          child: const MaterialApp(
            home: InvoicesScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('INV-000001'), findsOneWidget);
      expect(find.text('Angela Martin'), findsOneWidget);
      expect(find.text('USD 145.00'), findsWidgets);
    });
  });
}
