// This is a basic Flutter widget test.
//
// To perform an interaction with a widget in your test, use the WidgetTester
// utility in the flutter_test package. For example, you can send tap and scroll
// gestures. You can also use WidgetTester to find child widgets in the widget
// tree, read text, and verify that the values of widget properties are correct.

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';

import 'package:aera/main.dart';
import 'package:aera/invoices.dart';
import 'package:aera/customer_portal.dart';
import 'package:aera/quotes.dart';
import 'package:aera/technician_execution.dart';

void main() {
  testWidgets('Aera shell renders the daily operations overview', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const AeraApp());

    expect(find.text('Good morning, Maya'), findsOneWidget);
    expect(find.text('Today at a glance'), findsOneWidget);
    expect(find.text('Jordan Ellis'), findsOneWidget);
    expect(find.text('View schedule'), findsOneWidget);
  });

  testWidgets('technician Today shows assigned jobs and execution action', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(home: TechnicianTodayPage(api: DemoTechnicianExecutionApi())),
    );
    await tester.pumpAndSettle();

    expect(find.text('Today'), findsOneWidget);
    expect(find.text('Jordan Ellis'), findsOneWidget);
    expect(find.text('Mark en route'), findsNWidgets(2));
  });

  testWidgets('quote editor sends and previews customer approval', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(home: QuoteEditorPage(api: DemoQuoteApi())),
    );
    await tester.pumpAndSettle();

    expect(find.text('Line items'), findsOneWidget);
    expect(find.text('Total'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Send quote'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.text('Send quote'));
    await tester.pumpAndSettle();

    expect(find.text('Quote ready to share'), findsOneWidget);
    await tester.drag(find.byType(Scrollable).first, const Offset(0, -400));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Preview customer view'));
    await tester.pumpAndSettle();
    expect(find.text('Review quote'), findsOneWidget);
    expect(find.text('Decline quote'), findsOneWidget);
    await tester.tap(find.text('Approve quote'));
    await tester.pumpAndSettle();
    expect(find.text('Quote response recorded'), findsOneWidget);
  });

  testWidgets('invoice screen issues an invoice and records payment', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(home: InvoicePage(api: DemoInvoiceApi())),
    );
    await tester.pumpAndSettle();

    expect(find.text('INV-000001'), findsOneWidget);
    expect(find.text('Issue invoice'), findsOneWidget);
    await tester.tap(find.text('Issue invoice'));
    await tester.pumpAndSettle();

    expect(find.text('Record payment'), findsOneWidget);
    await tester.tap(find.text('Record payment'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Record'));
    await tester.pumpAndSettle();

    expect(find.text('PAID'), findsOneWidget);
  });

  testWidgets(
    'customer portal shows appointment, quote, invoice, and history',
    (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(home: CustomerPortalPage(api: DemoCustomerPortalApi())),
      );
      await tester.pumpAndSettle();

      expect(find.text('Hi, Jordan'), findsOneWidget);
      expect(find.text('Next appointment'), findsOneWidget);
      expect(find.text('Quote \$200.25'), findsOneWidget);
      expect(find.text('INV-000001'), findsOneWidget);
      await tester.scrollUntilVisible(
        find.text('Service history'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Service history'), findsOneWidget);
    },
  );
}
