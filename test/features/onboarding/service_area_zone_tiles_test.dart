import 'package:aera/core/widgets/aera_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Regression test for AERA-2: CheckboxListTiles rendered inside an AeraCard
/// (an opaque DecoratedBox) must have an intervening Material so Flutter's
/// ListTile background/ink assertion does not fire.
void main() {
  testWidgets(
    'zone CheckboxListTiles inside AeraCard build without ListTile assertion',
    (tester) async {
      final selected = <String>{};
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: StatefulBuilder(
              builder: (context, setState) => AeraCard(
                child: Material(
                  type: MaterialType.transparency,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      for (final zone in const ['North', 'South'])
                        CheckboxListTile(
                          value: selected.contains(zone),
                          contentPadding: EdgeInsets.zero,
                          controlAffinity: ListTileControlAffinity.leading,
                          title: Text(zone),
                          onChanged: (value) => setState(() {
                            if (value == true) {
                              selected.add(zone);
                            } else {
                              selected.remove(zone);
                            }
                          }),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      );

      expect(tester.takeException(), isNull);

      // Rebuild (the path that triggered the original report).
      await tester.tap(find.text('North'));
      await tester.pump();

      expect(tester.takeException(), isNull);
      expect(selected, contains('North'));
    },
  );
}
