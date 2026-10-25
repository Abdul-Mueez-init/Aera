import 'package:aera/features/portal/data/portal_repository.dart';
import 'package:aera/features/portal/widgets/portal_handshake_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('renders the 6-digit code large with the safety warning', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: PortalHandshakeCard(
            handshake: PortalHandshake(code: '483920', technicianName: 'Mike'),
          ),
        ),
      ),
    );

    expect(find.text('483920'), findsOneWidget);
    expect(
      find.textContaining('Give this code to the technician when they arrive'),
      findsOneWidget,
    );
    expect(
      find.textContaining('Do not share it by phone or message'),
      findsOneWidget,
    );
    expect(find.textContaining('Only give it to Mike'), findsOneWidget);

    // The code is rendered prominently (display size, well above body text).
    final codeWidget = tester.widget<Text>(find.text('483920'));
    expect(codeWidget.style?.fontSize, greaterThan(30));
  });

  testWidgets('renders without a technician name', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: PortalHandshakeCard(handshake: PortalHandshake(code: '001234')),
        ),
      ),
    );

    expect(find.text('001234'), findsOneWidget);
    expect(find.textContaining('Only give it to'), findsNothing);
  });
}
