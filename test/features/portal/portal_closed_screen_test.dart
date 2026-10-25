import 'package:aera/features/portal/data/portal_repository.dart';
import 'package:aera/features/portal/portal_closed_screen.dart';
import 'package:aera/features/portal/providers/portal_provider.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> _pumpClosed(WidgetTester tester, PortalClosed? closed) async {
  final container = ProviderContainer();
  addTearDown(container.dispose);
  if (closed != null) {
    container.read(portalClosedProvider.notifier).state = closed;
  }
  await tester.pumpWidget(
    UncontrolledProviderScope(
      container: container,
      child: const MaterialApp(home: PortalClosedScreen()),
    ),
  );
  await tester.pumpAndSettle();
}

const _contact = CompanyContactInfo(
  companyName: 'Acme HVAC',
  companyPhone: '+1555000111',
  contacts: [
    PortalContact(
      role: 'OWNER',
      name: 'Olivia Owner',
      phone: '+1555000222',
      email: 'olivia@acme.example',
    ),
    PortalContact(role: 'DISPATCHER', name: 'Dan Dispatch'),
  ],
);

void main() {
  testWidgets('deactivated: shows the spec message and contact tiles', (
    tester,
  ) async {
    await _pumpClosed(
      tester,
      const PortalClosed(
        variant: PortalClosedVariant.deactivated,
        contact: _contact,
      ),
    );

    expect(
      find.textContaining(
        'Your job is done, so your portal access is deactivated',
      ),
      findsOneWidget,
    );
    expect(find.textContaining('please contact Acme HVAC'), findsOneWidget);
    // Company tile + one tile for the owner's phone and one for their email.
    expect(find.text('Acme HVAC'), findsWidgets);
    expect(find.text('Olivia Owner'), findsNWidgets(2));
    expect(find.textContaining('+1555000111'), findsOneWidget);
    expect(find.textContaining('+1555000222'), findsOneWidget);
    expect(find.textContaining('olivia@acme.example'), findsOneWidget);
  });

  testWidgets('already used: shows the other-device variant', (tester) async {
    await _pumpClosed(
      tester,
      const PortalClosed(
        variant: PortalClosedVariant.alreadyUsed,
        contact: _contact,
      ),
    );

    expect(
      find.textContaining('already opened on another device'),
      findsOneWidget,
    );
    expect(
      find.textContaining('ask Acme HVAC to send a new one'),
      findsOneWidget,
    );
  });

  testWidgets('expired: shows the expired variant', (tester) async {
    await _pumpClosed(
      tester,
      const PortalClosed(
        variant: PortalClosedVariant.expired,
        contact: _contact,
      ),
    );

    expect(find.textContaining('This link has expired'), findsOneWidget);
  });

  testWidgets('invalid (no closed state): still renders guidance', (
    tester,
  ) async {
    await _pumpClosed(tester, null);

    expect(find.textContaining("This link isn't valid"), findsOneWidget);
  });
}
