import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';

class CreateInvoiceScreen extends StatefulWidget {
  const CreateInvoiceScreen({super.key});

  @override
  State<CreateInvoiceScreen> createState() => _CreateInvoiceScreenState();
}

class _CreateInvoiceScreenState extends State<CreateInvoiceScreen> {
  String _paymentTerms = 'Due on Receipt';

  final List<_InvoiceLine> _lines = [
    _InvoiceLine('Carrier 4-Ton Inverter Compressor', 'Serial: CR-9824', 1, 48000),
    _InvoiceLine('R-410A Refrigerant Recharge (8.2 lbs)', 'Virgin factory gas', 1, 14500),
    _InvoiceLine('Certified Master Technician Labor', 'System evacuation & installation', 3, 3500),
  ];

  int get _subtotal => _lines.fold(0, (sum, l) => sum + (l.qty * l.unitPrice));
  int get _tax => (_subtotal * 0.05).round();
  int get _total => _subtotal + _tax;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: const AeraAppBar(
        title: 'Create Invoice',
        subtitle: 'INV-0048',
        showBrand: true,
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          children: [
            // Bill To Banner
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
                    child: const Icon(Icons.receipt_long, color: AeraColors.accent, size: 22),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Sarah Khan', style: AeraTypography.h3.copyWith(fontSize: 15)),
                        Text('Job #JOB-8492 · Completed Today', style: AeraTypography.bodySm.copyWith(fontSize: 11)),
                      ],
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: AeraColors.surfaceSubtle,
                      borderRadius: AeraRadii.borderFull,
                    ),
                    child: Text(
                      'Draft',
                      style: AeraTypography.label.copyWith(fontSize: 10, color: AeraColors.inkSoft),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Line Items
            Text('Itemized Billing (${_lines.length})', style: AeraTypography.h3.copyWith(fontSize: 15)),
            const SizedBox(height: 8),

            ..._lines.map((item) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: AeraCard(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(item.name, style: AeraTypography.bodyMedium.copyWith(fontWeight: FontWeight.w700)),
                              Text(item.desc, style: AeraTypography.bodySm.copyWith(fontSize: 11, color: AeraColors.inkSoft)),
                              const SizedBox(height: 4),
                              Text('${item.qty} × Rs ${item.unitPrice}', style: AeraTypography.label.copyWith(fontSize: 11)),
                            ],
                          ),
                        ),
                        Text(
                          'Rs ${item.qty * item.unitPrice}',
                          style: AeraTypography.h3.copyWith(fontSize: 15, fontWeight: FontWeight.w700),
                        ),
                      ],
                    ),
                  ),
                )),
            const SizedBox(height: 14),

            // Payment Terms
            AeraCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Payment Terms', style: AeraTypography.label.copyWith(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      _termsChip('Due on Receipt'),
                      const SizedBox(width: 8),
                      _termsChip('Net 15'),
                      const SizedBox(width: 8),
                      _termsChip('Net 30'),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),

            // Totals Card
            AeraCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Subtotal', style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft)),
                      Text('Rs $_subtotal', style: AeraTypography.bodyMedium.copyWith(fontWeight: FontWeight.w600)),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Sales Tax (5%)', style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft)),
                      Text('Rs $_tax', style: AeraTypography.bodyMedium.copyWith(fontWeight: FontWeight.w600)),
                    ],
                  ),
                  const SizedBox(height: 10),
                  const Divider(color: AeraColors.line),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Total Due', style: AeraTypography.h2.copyWith(fontSize: 17)),
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
              text: 'Issue & Email Invoice',
              icon: const Icon(Icons.send, size: 18, color: Colors.white),
              onPressed: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Invoice issued to client')),
                );
                context.push('/invoices');
              },
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _termsChip(String label) {
    final isSelected = _paymentTerms == label;
    return ChoiceChip(
      label: Text(label),
      selected: isSelected,
      onSelected: (val) => setState(() => _paymentTerms = label),
      selectedColor: AeraColors.accentSoft,
      backgroundColor: AeraColors.surface,
      labelStyle: AeraTypography.label.copyWith(
        color: isSelected ? AeraColors.accent : AeraColors.ink,
        fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
        fontSize: 11,
      ),
      side: BorderSide(color: isSelected ? AeraColors.accent : AeraColors.line),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
    );
  }
}

class _InvoiceLine {
  _InvoiceLine(this.name, this.desc, this.qty, this.unitPrice);
  final String name;
  final String desc;
  final int qty;
  final int unitPrice;
}
