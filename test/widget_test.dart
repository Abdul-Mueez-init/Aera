import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:aera/main.dart';
import 'package:aera/core/widgets/aera_bottom_nav.dart';

void main() {
  testWidgets('AeraApp launches cleanly with Material 3 router and Dashboard', (
    WidgetTester tester,
  ) async {
    // Set surface size to modern phone viewport
    tester.view.physicalSize = const Size(1440, 3000);
    tester.view.devicePixelRatio = 2.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    await tester.pumpWidget(const AeraApp());
    await tester.pumpAndSettle();

    // Verify Master Dashboard elements
    expect(find.text('Good morning, Marcus'), findsOneWidget);
    expect(find.text('AERA HVAC'), findsWidgets);
    expect(find.byType(AeraBottomNav), findsOneWidget);
    expect(find.text('Home'), findsOneWidget);
    expect(find.text('Jobs'), findsOneWidget);
    expect(find.text('Schedule'), findsWidgets);
    expect(find.text('Customers'), findsWidgets);
    expect(find.text('More'), findsOneWidget);
  });

  testWidgets('AeraApp bottom navigation tabs switch successfully', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(1440, 3000);
    tester.view.devicePixelRatio = 2.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    await tester.pumpWidget(const AeraApp());
    await tester.pumpAndSettle();

    // Tap on Jobs tab
    await tester.tap(find.text('Jobs'));
    await tester.pumpAndSettle();
    expect(find.text('Jobs Directory'), findsOneWidget);

    // Tap on Schedule tab
    await tester.tap(find.text('Schedule').last);
    await tester.pumpAndSettle();
    expect(find.text('Schedule Job'), findsOneWidget);

    // Tap on Customers tab
    await tester.tap(find.text('Customers').last);
    await tester.pumpAndSettle();
    expect(find.text('Customers'), findsWidgets);

    // Tap on More tab
    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();
    expect(find.text('Operations Hub'), findsOneWidget);
  });
}
