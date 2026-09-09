import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_button.dart';

class InvoicePaymentScreen extends StatefulWidget {
  const InvoicePaymentScreen({super.key});

  @override
  State<InvoicePaymentScreen> createState() => _InvoicePaymentScreenState();
}

class _InvoicePaymentScreenState extends State<InvoicePaymentScreen> {
  String _selectedMethod = 'raast';
  bool _paymentCompleted = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: AeraColors.accent,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Center(
                child: Text(
                  'A',
                  style: AeraTypography.h3.copyWith(color: AeraColors.surface),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('AERA CLIENT PORTAL', style: AeraTypography.labelUpper.copyWith(fontSize: 10)),
                Text('Invoice Payment', style: AeraTypography.body.copyWith(fontWeight: FontWeight.w700)),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.apps),
            tooltip: 'Screen Catalog',
            onPressed: () => Scaffold.of(context).openEndDrawer(),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        children: [
          // Breadcrumb
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(Icons.verified_user, size: 16, color: AeraColors.accent),
                  const SizedBox(width: 6),
                  Text(
                    'Northstar Climate Solutions',
                    style: AeraTypography.labelUpper.copyWith(color: AeraColors.inkSoft),
                  ),
                ],
              ),
              Text(
                'Due Sep 12, 2026',
                style: AeraTypography.label.copyWith(color: AeraColors.inkSoft),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Primary Invoice Card
          AeraCard(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'BILL TO: SARAH KHAN',
                          style: AeraTypography.labelUpper.copyWith(color: AeraColors.inkSoft),
                        ),
                        Text(
                          'Invoice #INV-2384',
                          style: AeraTypography.h3.copyWith(fontWeight: FontWeight.w700),
                        ),
                      ],
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: _paymentCompleted ? AeraColors.successSoft : AeraColors.warningSoft,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 6,
                            height: 6,
                            decoration: BoxDecoration(
                              color: _paymentCompleted ? AeraColors.success : AeraColors.warning,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            _paymentCompleted ? 'Paid in Full' : 'Payment Pending',
                            style: AeraTypography.label.copyWith(
                              color: _paymentCompleted ? AeraColors.success : AeraColors.warning,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AeraColors.surfaceSubtle,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Total Outstanding Due', style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft)),
                          Text(
                            _paymentCompleted ? 'Settled' : 'Due on Receipt',
                            style: AeraTypography.label.copyWith(
                              color: _paymentCompleted ? AeraColors.success : AeraColors.ink,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.baseline,
                        textBaseline: TextBaseline.alphabetic,
                        children: [
                          Text(
                            'Rs ',
                            style: AeraTypography.h3.copyWith(
                              color: AeraColors.accent,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          Text(
                            _paymentCompleted ? '0' : '18,500',
                            style: AeraTypography.display.copyWith(
                              fontSize: 32,
                              fontWeight: FontWeight.w700,
                              color: _paymentCompleted ? AeraColors.success : AeraColors.ink,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Text('PKR', style: AeraTypography.label.copyWith(color: AeraColors.inkSoft)),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: AeraColors.canvas,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.task_alt, size: 18, color: AeraColors.accent),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'AC Compressor Replacement (Job #JOB-8492) • Ahmed Raza',
                          style: AeraTypography.bodySm.copyWith(fontWeight: FontWeight.w500),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Itemized Receipt Card
          AeraCard(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.receipt_long, size: 18, color: AeraColors.inkSoft),
                        const SizedBox(width: 6),
                        Text(
                          'ITEMIZED BREAKDOWN',
                          style: AeraTypography.labelUpper.copyWith(color: AeraColors.inkSoft),
                        ),
                      ],
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: AeraColors.accentSoft,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        '3 Verified Items',
                        style: AeraTypography.label.copyWith(
                          color: AeraColors.accent,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                _itemRow('OEM Inverter Compressor (1.5 Ton)', 'Factory sealed • 1-Year Comprehensive Warranty', 'Rs 12,500'),
                const Divider(color: AeraColors.line, height: 16),
                _itemRow('Nitrogen Pressure Flush & Vacuum', 'Moisture extraction down to 500 microns', 'Rs 2,500'),
                const Divider(color: AeraColors.line, height: 16),
                _itemRow('R-410A Refrigerant Full Recharge', 'Pure virgin gas refill with digital scale calibration', 'Rs 3,500'),
                const Divider(color: AeraColors.line, height: 20),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Total Payable', style: AeraTypography.body.copyWith(fontWeight: FontWeight.w700)),
                    Text(
                      'Rs 18,500',
                      style: AeraTypography.h3.copyWith(
                        fontWeight: FontWeight.w700,
                        color: AeraColors.accent,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Payment Methods Selection
          if (!_paymentCompleted) ...[
            AeraCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'SELECT PAYMENT CHANNEL',
                    style: AeraTypography.labelUpper.copyWith(color: AeraColors.inkSoft),
                  ),
                  const SizedBox(height: 12),

                  // Raast IBFT
                  _methodTile(
                    'raast',
                    'Raast Instant Transfer / IBFT',
                    'Zero transaction fee • Instant bank reconciliation',
                    Icons.bolt,
                    badge: 'Fastest',
                    extraContent: Container(
                      margin: const EdgeInsets.only(top: 8),
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: AeraColors.surface,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Raast ID / IBAN', style: AeraTypography.label.copyWith(color: AeraColors.inkSoft)),
                              Text(
                                'PK82NTSC00049281001',
                                style: AeraTypography.bodySm.copyWith(
                                  fontWeight: FontWeight.w700,
                                  color: AeraColors.accent,
                                ),
                              ),
                            ],
                          ),
                          ElevatedButton(
                            onPressed: () {
                              Clipboard.setData(const ClipboardData(text: 'PK82NTSC00049281001'));
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(content: Text('Raast IBAN copied to clipboard!')),
                              );
                            },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AeraColors.accentSoft,
                              foregroundColor: AeraColors.accent,
                              elevation: 0,
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                            ),
                            child: const Text('Copy'),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),

                  // Card
                  _methodTile(
                    'card',
                    'Debit / Credit Card',
                    'Secured with 3D OTP Verification (Visa, Mastercard)',
                    Icons.credit_card,
                  ),
                  const SizedBox(height: 8),

                  // Cash
                  _methodTile(
                    'cash',
                    'Cash Handover to Field Tech',
                    'Hand physical currency directly to Lead Tech Ahmed Raza',
                    Icons.payments,
                    badge: 'Tech Ready',
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            AeraButton(
              text: 'Pay Rs 18,500 Securely',
              icon: const Icon(Icons.lock, size: 18, color: Colors.white),
              onPressed: () {
                setState(() => _paymentCompleted = true);
              },
            ),
          ] else ...[
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: AeraColors.successSoft,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AeraColors.success.withOpacity(0.3)),
              ),
              child: Column(
                children: [
                  const Icon(Icons.check_circle, size: 48, color: AeraColors.success),
                  const SizedBox(height: 10),
                  Text(
                    'Payment Completed!',
                    style: AeraTypography.h3.copyWith(
                      color: AeraColors.success,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Official receipt #REC-9081 has been sent to sarah.k@gmail.com and WhatsApp.',
                    textAlign: TextAlign.center,
                    style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
                  ),
                  const SizedBox(height: 16),
                  OutlinedButton.icon(
                    onPressed: () => context.pop(),
                    icon: const Icon(Icons.arrow_back, size: 16),
                    label: const Text('Return to App'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AeraColors.ink,
                      side: const BorderSide(color: AeraColors.line),
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _itemRow(String title, String desc, String price) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Expanded(
              child: Text(title, style: AeraTypography.bodySm.copyWith(fontWeight: FontWeight.w600)),
            ),
            Text(price, style: AeraTypography.bodySm.copyWith(fontWeight: FontWeight.w700)),
          ],
        ),
        const SizedBox(height: 2),
        Text(desc, style: AeraTypography.label.copyWith(color: AeraColors.outline)),
      ],
    );
  }

  Widget _methodTile(
    String key,
    String title,
    String subtitle,
    IconData icon, {
    String? badge,
    Widget? extraContent,
  }) {
    final isSelected = _selectedMethod == key;
    return InkWell(
      onTap: () => setState(() => _selectedMethod = key),
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isSelected ? AeraColors.surfaceSubtle : AeraColors.surface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: isSelected ? AeraColors.accent : AeraColors.line,
            width: isSelected ? 1.5 : 1,
          ),
        ),
        child: Column(
          children: [
            Row(
              children: [
                Icon(icon, color: isSelected ? AeraColors.accent : AeraColors.inkSoft, size: 20),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            title,
                            style: AeraTypography.bodySm.copyWith(fontWeight: FontWeight.w700),
                          ),
                          if (badge != null) ...[
                            const SizedBox(width: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                              decoration: BoxDecoration(
                                color: AeraColors.successSoft,
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Text(
                                badge,
                                style: AeraTypography.label.copyWith(
                                  fontSize: 10,
                                  color: AeraColors.success,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                      Text(
                        subtitle,
                        style: AeraTypography.label.copyWith(color: AeraColors.inkSoft),
                      ),
                    ],
                  ),
                ),
                Radio<String>(
                  value: key,
                  groupValue: _selectedMethod,
                  activeColor: AeraColors.accent,
                  onChanged: (val) {
                    if (val != null) setState(() => _selectedMethod = val);
                  },
                ),
              ],
            ),
            if (isSelected && extraContent != null) extraContent,
          ],
        ),
      ),
    );
  }
}
