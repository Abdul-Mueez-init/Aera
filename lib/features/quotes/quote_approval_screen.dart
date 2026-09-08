import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_button.dart';

class QuoteApprovalScreen extends StatefulWidget {
  const QuoteApprovalScreen({super.key});

  @override
  State<QuoteApprovalScreen> createState() => _QuoteApprovalScreenState();
}

class _QuoteApprovalScreenState extends State<QuoteApprovalScreen> {
  bool _isApproved = false;
  bool _showSignaturePad = false;
  bool _hasSigned = false;

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
              crossAxisAlignment: CrossAlignment.start,
              children: [
                Text('AERA CLIENT PORTAL', style: AeraTypography.labelUpper.copyWith(fontSize: 10)),
                Text('Estimate Approval', style: AeraTypography.body.copyWith(fontWeight: FontWeight.w700)),
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
          // Meta Header
          Row(
            mainAxisAlignment: MainAxisAlignment.between,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: _isApproved ? AeraColors.successSoft : AeraColors.accentSoft,
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 6,
                      height: 6,
                      decoration: BoxDecoration(
                        color: _isApproved ? AeraColors.success : AeraColors.accent,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      _isApproved ? 'Approved & Booked' : 'Action Required',
                      style: AeraTypography.label.copyWith(
                        color: _isApproved ? AeraColors.success : AeraColors.accent,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              Text(
                'Estimate #QT-1048',
                style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Hero Summary Card
          AeraCard(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.between,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAlignment.start,
                      children: [
                        Text(
                          'ISSUED TO',
                          style: AeraTypography.labelUpper.copyWith(color: AeraColors.accent),
                        ),
                        Text(
                          'Sarah Khan',
                          style: AeraTypography.h3.copyWith(fontWeight: FontWeight.w700),
                        ),
                        Text(
                          'Northstar Climate Solutions • Certified HVAC',
                          style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
                        ),
                      ],
                    ),
                    const Icon(Icons.verified_user, color: AeraColors.accent, size: 28),
                  ],
                ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AeraColors.surfaceSubtle,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAlignment.start,
                    children: [
                      Text(
                        'SCOPE OF WORK',
                        style: AeraTypography.labelUpper.copyWith(color: AeraColors.inkSoft),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'AC Compressor Replacement • 4-Ton Split System',
                        style: AeraTypography.body.copyWith(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          const Icon(Icons.hvac, size: 16, color: AeraColors.accent),
                          const SizedBox(width: 6),
                          Text(
                            'Carrier Infinity 24VNA6 Unit',
                            style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Itemized Scope Breakdown
          AeraCard(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.between,
                  children: [
                    Text(
                      'ITEMIZED BREAKDOWN',
                      style: AeraTypography.labelUpper.copyWith(color: AeraColors.inkSoft),
                    ),
                    Row(
                      children: [
                        const Icon(Icons.verified, size: 14, color: AeraColors.accent),
                        const SizedBox(width: 4),
                        Text(
                          'OEM Certified',
                          style: AeraTypography.label.copyWith(
                            color: AeraColors.accent,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                _scopeItem(
                  'OEM Inverter Compressor (1.5 / 4 Ton)',
                  'Direct factory sealed replacement (Part #CP-402-99)',
                  'Rs 12,500',
                  'In Stock (Regional Depot)',
                ),
                const Divider(color: AeraColors.line, height: 18),
                _scopeItem(
                  'Nitrogen Pressure Flush & Deep Vacuum',
                  'Certified sub-500 microns deep evacuation',
                  'Rs 2,500',
                  'Precision Labor (3.5h)',
                ),
                const Divider(color: AeraColors.line, height: 18),
                _scopeItem(
                  'R-410A Refrigerant Full Recharge',
                  'Virgin gas with digital scale calibration',
                  'Rs 3,500',
                  'Pure Factory Spec',
                ),
                const Divider(color: AeraColors.line, height: 20),
                Row(
                  mainAxisAlignment: MainAxisAlignment.between,
                  children: [
                    Text(
                      'Total Estimate',
                      style: AeraTypography.body.copyWith(fontWeight: FontWeight.w700),
                    ),
                    Text(
                      'Rs 18,500',
                      style: AeraTypography.display.copyWith(
                        color: AeraColors.accent,
                        fontSize: 26,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Warranty & Protection Guarantees
          AeraCard(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAlignment.start,
              children: [
                Text(
                  'NORTHSTAR SERVICE GUARANTEE',
                  style: AeraTypography.labelUpper.copyWith(color: AeraColors.inkSoft),
                ),
                const SizedBox(height: 8),
                _assuranceRow('Full replacement of system liquid-line filter drier to safeguard motor'),
                _assuranceRow('Nitrogen high-pressure leak hold verification logged digitally'),
                _assuranceRow('1-Year Compressor Factory Warranty + 90-Day Labor Protection'),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Lead Tech Dispatch Preview
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AeraColors.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AeraColors.line),
            ),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: AeraColors.accentSoft,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Center(
                    child: Text(
                      'AR',
                      style: AeraTypography.body.copyWith(
                        color: AeraColors.accent,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAlignment.start,
                    children: [
                      Text(
                        'Assigned Lead Technician',
                        style: AeraTypography.label.copyWith(color: AeraColors.inkSoft),
                      ),
                      Text(
                        'Ahmed Raza (Master HVAC #8821)',
                        style: AeraTypography.bodySm.copyWith(fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ),
                Container(
                  width: 8,
                  height: 8,
                  decoration: const BoxDecoration(
                    color: AeraColors.success,
                    shape: BoxShape.circle,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),

          // Approval or Approved State
          if (_isApproved) ...[
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
                    'Estimate Approved & Booked!',
                    style: AeraTypography.h3.copyWith(
                      color: AeraColors.success,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Northstar Climate has queued parts order #CP-402-99. Ahmed Raza is scheduled to arrive Tuesday 09:00 AM.',
                    textAlign: TextAlign.center,
                    style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
                  ),
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                    decoration: BoxDecoration(
                      color: AeraColors.surface,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      'Authorization Token: #AUTH-99182',
                      style: AeraTypography.label.copyWith(fontWeight: FontWeight.w600),
                    ),
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton.icon(
                    onPressed: () => context.push('/technician-tracking'),
                    icon: const Icon(Icons.local_shipping, size: 18),
                    label: const Text('Track Live Dispatch'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AeraColors.accent,
                      foregroundColor: AeraColors.surface,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                  ),
                ],
              ),
            ),
          ] else if (_showSignaturePad) ...[
            AeraCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.between,
                    children: [
                      Text(
                        'CONFIRM DIGITAL SIGNATURE',
                        style: AeraTypography.labelUpper.copyWith(color: AeraColors.ink),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close, size: 20),
                        onPressed: () => setState(() => _showSignaturePad = false),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  GestureDetector(
                    onTap: () => setState(() => _hasSigned = true),
                    child: Container(
                      height: 100,
                      width: double.infinity,
                      decoration: BoxDecoration(
                        color: AeraColors.surfaceSubtle,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: _hasSigned ? AeraColors.accent : AeraColors.line,
                          width: _hasSigned ? 2 : 1,
                        ),
                      ),
                      child: Center(
                        child: _hasSigned
                            ? Text(
                                'Sarah Khan ✓',
                                style: AeraTypography.display.copyWith(
                                  color: AeraColors.accent,
                                  fontStyle: FontStyle.italic,
                                  fontSize: 28,
                                ),
                              )
                            : Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  const Icon(Icons.gesture, size: 20, color: AeraColors.outline),
                                  const SizedBox(width: 8),
                                  Text(
                                    'Tap to authorize with finger',
                                    style: AeraTypography.bodySm.copyWith(color: AeraColors.outline),
                                  ),
                                ],
                              ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  AeraButton(
                    text: 'Authorize & Complete (Rs 18,500)',
                    icon: Icons.check,
                    onPressed: _hasSigned
                        ? () {
                            setState(() {
                              _isApproved = true;
                              _showSignaturePad = false;
                            });
                          }
                        : null,
                  ),
                ],
              ),
            ),
          ] else ...[
            AeraButton(
              text: 'Approve Estimate (Rs 18,500)',
              icon: Icons.draw,
              onPressed: () => setState(() => _showSignaturePad = true),
            ),
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                TextButton.icon(
                  onPressed: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Message sent to Northstar Climate dispatch desk')),
                    );
                  },
                  icon: const Icon(Icons.chat_bubble_outline, size: 16, color: AeraColors.accent),
                  label: Text(
                    'Ask a Question',
                    style: AeraTypography.bodySm.copyWith(
                      color: AeraColors.accent,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                TextButton(
                  onPressed: () => context.pop(),
                  child: Text(
                    'Decline Estimate',
                    style: AeraTypography.bodySm.copyWith(color: AeraColors.danger),
                  ),
                ),
              ],
            ),
          ],
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _scopeItem(String title, String desc, String price, String tag) {
    return Column(
      crossAxisAlignment: CrossAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.between,
          children: [
            Expanded(
              child: Text(title, style: AeraTypography.bodySm.copyWith(fontWeight: FontWeight.w600)),
            ),
            Text(price, style: AeraTypography.body.copyWith(fontWeight: FontWeight.w700)),
          ],
        ),
        const SizedBox(height: 2),
        Text(desc, style: AeraTypography.label.copyWith(color: AeraColors.outline)),
        const SizedBox(height: 4),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(
            color: AeraColors.surfaceSubtle,
            borderRadius: BorderRadius.circular(4),
          ),
          child: Text(
            tag,
            style: AeraTypography.label.copyWith(color: AeraColors.accent, fontSize: 11),
          ),
        ),
      ],
    );
  }

  Widget _assuranceRow(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAlignment.start,
        children: [
          const Icon(Icons.check_circle, size: 16, color: AeraColors.success),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
            ),
          ),
        ],
      ),
    );
  }
}
