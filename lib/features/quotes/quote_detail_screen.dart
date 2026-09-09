import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_button.dart';

class QuoteDetailScreen extends StatelessWidget {
  const QuoteDetailScreen({super.key, this.quoteId = 'QT-1048'});

  final String quoteId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AppBar(
        title: Text('Quote #$quoteId'),
        actions: [
          IconButton(
            icon: const Icon(Icons.share_outlined),
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Quote client link copied to clipboard')),
              );
            },
          ),
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
          // Estimate In Flight Sub-bar
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: AeraColors.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AeraColors.line),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: const BoxDecoration(
                        color: AeraColors.accent,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      'ESTIMATE IN FLIGHT',
                      style: AeraTypography.labelUpper.copyWith(
                        color: AeraColors.inkSoft,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
                TextButton.icon(
                  onPressed: () => context.push('/quote-approval'),
                  icon: const Icon(Icons.open_in_new, size: 16, color: AeraColors.accent),
                  label: Text(
                    'Client Portal',
                    style: AeraTypography.label.copyWith(
                      color: AeraColors.accent,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Lifecycle Stage Card
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
                          'CURRENT STAGE',
                          style: AeraTypography.labelUpper.copyWith(color: AeraColors.inkSoft),
                        ),
                        const SizedBox(height: 2),
                        Row(
                          children: [
                            Text(
                              'Sent to Client',
                              style: AeraTypography.h3.copyWith(fontWeight: FontWeight.w700),
                            ),
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                              decoration: BoxDecoration(
                                color: AeraColors.accentSoft,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Text(
                                'Active',
                                style: AeraTypography.label.copyWith(
                                  color: AeraColors.accent,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          'DISPATCHED',
                          style: AeraTypography.labelUpper.copyWith(color: AeraColors.inkSoft),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Today, 10:45 AM',
                          style: AeraTypography.bodySm.copyWith(fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 16),

                // 4 Stages Pipeline
                Container(
                  padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
                  decoration: BoxDecoration(
                    color: AeraColors.canvas,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    children: [
                      _stageItem('Draft', 'Done', Icons.check, true, false),
                      _stageDivider(true),
                      _stageItem('Sent', '10:45 AM', Icons.send, true, true),
                      _stageDivider(false),
                      _stageItem('Viewed', 'Pending', Icons.visibility, false, false),
                      _stageDivider(false),
                      _stageItem('Approved', 'Awaiting', Icons.verified, false, false),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Customer Profile Card
          AeraCard(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: AeraColors.surfaceSubtle,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(Icons.person_pin, color: AeraColors.accent, size: 24),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(
                                'Sarah Khan',
                                style: AeraTypography.h3.copyWith(fontWeight: FontWeight.w700),
                              ),
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: AeraColors.surfaceSubtle,
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text('Residential', style: AeraTypography.label),
                              ),
                            ],
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '+92 (300) 238-9041',
                            style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
                          ),
                          Text(
                            'House 42-B, Block K, Gulberg III, Lahore',
                            style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () {},
                        icon: const Icon(Icons.call, size: 16, color: AeraColors.accent),
                        label: const Text('Call Client'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AeraColors.ink,
                          side: const BorderSide(color: AeraColors.line),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () {},
                        icon: const Icon(Icons.chat, size: 16, color: AeraColors.accent),
                        label: const Text('Message'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AeraColors.ink,
                          side: const BorderSide(color: AeraColors.line),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Equipment Scope Card
          AeraCard(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'SYSTEM DETAILS',
                  style: AeraTypography.labelUpper.copyWith(color: AeraColors.inkSoft),
                ),
                const SizedBox(height: 6),
                Text(
                  'Carrier Infinity 24VNA6 • 4-Ton Split System',
                  style: AeraTypography.body.copyWith(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 4),
                Text(
                  'AC Compressor Replacement & Nitrogen Pressure Test',
                  style: AeraTypography.bodySm.copyWith(color: AeraColors.outline),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Itemized Scope Breakdown
          AeraCard(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'ITEMIZED SCOPE BREAKDOWN',
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

                _lineItem(
                  'OEM 4-Ton Inverter Scroll Compressor',
                  'Direct factory replacement matched to model specs (Part #CP-402-99)',
                  'Rs 12,500',
                  'In Stock (Regional Depot)',
                ),
                const Divider(color: AeraColors.line, height: 20),
                _lineItem(
                  'Nitrogen Flush & Vacuum Dehydration',
                  'Certified sub-500 microns deep evacuation process (~3.5 hrs)',
                  'Rs 2,500',
                  'Precision Labor',
                ),
                const Divider(color: AeraColors.line, height: 20),
                _lineItem(
                  'R-410A Pure Refrigerant Full Charge',
                  'Virgin gas refill with digital scale calibration',
                  'Rs 3,500',
                  'Guaranteed Quality',
                ),

                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AeraColors.surfaceSubtle,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Subtotal', style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft)),
                          Text('Rs 18,500', style: AeraTypography.bodySm.copyWith(fontWeight: FontWeight.w600)),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Sales Tax (PST 0% Surcharge Included)', style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft)),
                          Text('Rs 0', style: AeraTypography.bodySm.copyWith(fontWeight: FontWeight.w600)),
                        ],
                      ),
                      const Divider(color: AeraColors.line, height: 16),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'Total Estimate',
                            style: AeraTypography.body.copyWith(fontWeight: FontWeight.w700),
                          ),
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
              ],
            ),
          ),
          const SizedBox(height: 20),

          // Action Buttons
          AeraButton(
            text: 'View Customer Approval Portal',
            icon: const Icon(Icons.draw, size: 18, color: Colors.white),
            onPressed: () => context.push('/quote-approval'),
          ),
          const SizedBox(height: 8),
          OutlinedButton(
            onPressed: () => context.pop(),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size.fromHeight(48),
              side: const BorderSide(color: AeraColors.line),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: const Text('Back to Quotes', style: TextStyle(color: AeraColors.ink)),
          ),
          const SizedBox(height: 20),
        ],
      ),
    );
  }

  Widget _stageItem(String label, String sub, IconData icon, bool done, bool active) {
    return Expanded(
      child: Column(
        children: [
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              color: done ? AeraColors.accent : AeraColors.surface,
              shape: BoxShape.circle,
              border: Border.all(
                color: done ? AeraColors.accent : AeraColors.outline,
                width: active ? 2 : 1,
              ),
              boxShadow: active
                  ? [BoxShadow(color: AeraColors.accent.withOpacity(0.3), blurRadius: 6)]
                  : null,
            ),
            child: Icon(
              icon,
              size: 14,
              color: done ? AeraColors.surface : AeraColors.outline,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: AeraTypography.label.copyWith(
              fontWeight: active ? FontWeight.w700 : FontWeight.w500,
              color: active ? AeraColors.accent : AeraColors.ink,
            ),
          ),
          Text(
            sub,
            style: AeraTypography.label.copyWith(
              fontSize: 10,
              color: AeraColors.outline,
            ),
          ),
        ],
      ),
    );
  }

  Widget _stageDivider(bool completed) {
    return Container(
      width: 18,
      height: 2,
      color: completed ? AeraColors.accent : AeraColors.line,
    );
  }

  Widget _lineItem(String title, String desc, String amount, String tag) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Text(
                title,
                style: AeraTypography.bodySm.copyWith(fontWeight: FontWeight.w600),
              ),
            ),
            const SizedBox(width: 8),
            Text(
              amount,
              style: AeraTypography.body.copyWith(fontWeight: FontWeight.w700),
            ),
          ],
        ),
        const SizedBox(height: 2),
        Text(
          desc,
          style: AeraTypography.label.copyWith(color: AeraColors.outline),
        ),
        const SizedBox(height: 4),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(
            color: AeraColors.surfaceSubtle,
            borderRadius: BorderRadius.circular(4),
          ),
          child: Text(
            tag,
            style: AeraTypography.label.copyWith(
              color: AeraColors.accent,
              fontWeight: FontWeight.w600,
              fontSize: 11,
            ),
          ),
        ),
      ],
    );
  }
}
