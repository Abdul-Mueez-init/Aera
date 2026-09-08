import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';

class CreateQuoteScreen extends StatefulWidget {
  const CreateQuoteScreen({super.key});

  @override
  State<CreateQuoteScreen> createState() => _CreateQuoteScreenState();
}

class _CreateQuoteScreenState extends State<CreateQuoteScreen> {
  final List<_QuoteItem> _items = [
    _QuoteItem('4-Ton Inverter Scroll Compressor (OEM Carrier)', 'OEM factory replacement', 1, 48000),
    _QuoteItem('R-410A Refrigerant Recharge (8.2 lbs)', 'Virgin refrigerant gas', 1, 14500),
    _QuoteItem('System Evacuation & Technical Labor', 'Vacuum pump test & weld labor', 3, 3500),
  ];

  int get _subtotal => _items.fold(0, (sum, it) => sum + (it.qty * it.unitPrice));
  int get _tax => (_subtotal * 0.05).round();
  int get _total => _subtotal + _tax;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: const AeraAppBar(
        title: 'Draft Quote',
        subtitle: 'Ref: EST-9024',
        showBrand: true,
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          children: [
            // Job Context Banner
            AeraCard(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: AeraColors.accentSoft,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(Icons.request_quote_outlined, color: AeraColors.accent, size: 22),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAlignment.start,
                      children: [
                        Text('AC Compressor Breakdown', style: AeraTypography.h3.copyWith(fontSize: 15)),
                        Text('Sarah Khan • Job #JOB-8492', style: AeraTypography.bodySm.copyWith(fontSize: 11)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Line items header
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Scope & Parts (${_items.length})', style: AeraTypography.h3.copyWith(fontSize: 15)),
                TextButton.icon(
                  onPressed: () {
                    setState(() {
                      _items.add(_QuoteItem('Contactor / Capacitor Kit', '35/5 MFD Dual Run', 1, 6500));
                    });
                  },
                  icon: const Icon(Icons.add, size: 16, color: AeraColors.accent),
                  label: Text('Add Item', style: AeraTypography.label.copyWith(color: AeraColors.accent)),
                ),
              ],
            ),
            const SizedBox(height: 8),

            // Line items list
            ..._items.map((it) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: AeraCard(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Expanded(
                              child: Text(
                                it.name,
                                style: AeraTypography.bodyMedium.copyWith(fontWeight: FontWeight.w700),
                              ),
                            ),
                            IconButton(
                              icon: const Icon(Icons.delete_outline, size: 18, color: AeraColors.outline),
                              onPressed: () => setState(() => _items.remove(it)),
                            ),
                          ],
                        ),
                        Text(it.desc, style: AeraTypography.bodySm.copyWith(fontSize: 11, color: AeraColors.inkSoft)),
                        const SizedBox(height: 10),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(
                            color: AeraColors.surfaceContainerLow,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                'QTY: ${it.qty} × Rs ${it.unitPrice}',
                                style: AeraTypography.bodySm.copyWith(fontSize: 12),
                              ),
                              Text(
                                'Rs ${it.qty * it.unitPrice}',
                                style: AeraTypography.h3.copyWith(fontSize: 14, fontWeight: FontWeight.w700),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                )),
            const SizedBox(height: 16),

            // Calculation Summary Card
            AeraCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  _calcRow('Subtotal', 'Rs $_subtotal'),
                  const SizedBox(height: 8),
                  _calcRow('Punjab Sales Tax (5%)', 'Rs $_tax'),
                  const SizedBox(height: 12),
                  const Divider(color: AeraColors.line),
                  const SizedBox(height: 10),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Total Estimate', style: AeraTypography.h2.copyWith(fontSize: 17)),
                      Text(
                        'Rs $_total',
                        style: AeraTypography.money.copyWith(fontSize: 22, color: AeraColors.accent),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            AeraButton(
              text: 'Save & Share Quote with Client',
              icon: const Icon(Icons.send_rounded, size: 18, color: Colors.white),
              onPressed: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Quote dispatched for client approval')),
                );
                context.push('/quotes');
              },
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _calcRow(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft)),
        Text(value, style: AeraTypography.bodyMedium.copyWith(fontWeight: FontWeight.w600)),
      ],
    );
  }
}

class _QuoteItem {
  _QuoteItem(this.name, this.desc, this.qty, this.unitPrice);
  final String name;
  final String desc;
  final int qty;
  final int unitPrice;
}
