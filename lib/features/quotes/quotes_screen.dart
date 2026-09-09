import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_status_chip.dart';

class QuotesScreen extends StatefulWidget {
  const QuotesScreen({super.key});

  @override
  State<QuotesScreen> createState() => _QuotesScreenState();
}

class _QuotesScreenState extends State<QuotesScreen> {
  String _activeFilter = 'All';
  String _searchQuery = '';

  final List<Map<String, dynamic>> _quotes = [
    {
      'id': 'QT-1048',
      'customer': 'Sarah Khan',
      'amount': 'Rs 18,500',
      'equipment': 'Residential 4-Ton Split System',
      'scope': 'AC Compressor Replacement & Nitrogen Pressure Test',
      'status': 'Sent',
      'time': 'Sent 2h ago',
      'subtitle': 'Awaiting Client Review',
      'icon': Icons.schedule_send,
      'statusType': AeraStatusType.info,
    },
    {
      'id': 'QT-1049',
      'customer': 'M. Trading Co. HQ',
      'amount': 'Rs 145,000',
      'equipment': 'Commercial Chillers',
      'scope': 'Quarterly Preventive Maintenance & Coil Chem-Wash (3x Rooftop Units)',
      'status': 'Approved',
      'time': 'Yesterday',
      'subtitle': 'Signed & Ready to Schedule',
      'icon': Icons.verified,
      'statusType': AeraStatusType.success,
    },
    {
      'id': 'QT-1050',
      'customer': 'Tariq Mehmood',
      'amount': 'Rs 8,400',
      'equipment': 'Inverter Ductless Mini-Split',
      'scope': 'Capacitor & Contactor Replacement with PCB Diagnostic',
      'status': 'Draft',
      'time': '3h ago',
      'subtitle': 'Ready to Send to Client',
      'icon': Icons.edit_note,
      'statusType': AeraStatusType.neutral,
    },
    {
      'id': 'QT-1045',
      'customer': 'Gourmet Foods Gulberg',
      'amount': 'Rs 92,000',
      'equipment': 'Cold Storage Rooftop Condenser',
      'scope': 'Emergency Leak Repair & R-404A Refrigerant Recharge',
      'status': 'Viewed',
      'time': 'Yesterday',
      'subtitle': 'Client Opened Link 45m ago',
      'icon': Icons.visibility,
      'statusType': AeraStatusType.warning,
    },
    {
      'id': 'QT-1042',
      'customer': 'Cantt Residency',
      'amount': 'Rs 34,000',
      'equipment': 'Multi-Split Inverter Ducted',
      'scope': 'Air Duct Sanitization & Blower Wheel Rebalancing',
      'status': 'Declined',
      'time': '2 days ago',
      'subtitle': 'Budget Revision Requested',
      'icon': Icons.cancel_outlined,
      'statusType': AeraStatusType.danger,
    },
  ];

  final List<String> _filterTabs = ['All', 'Draft', 'Sent', 'Viewed', 'Approved', 'Declined'];

  @override
  Widget build(BuildContext context) {
    final filtered = _quotes.where((q) {
      if (_activeFilter != 'All' && q['status'] != _activeFilter) return false;
      if (_searchQuery.isNotEmpty) {
        final query = _searchQuery.toLowerCase();
        final matchCust = (q['customer'] as String).toLowerCase().contains(query);
        final matchId = (q['id'] as String).toLowerCase().contains(query);
        final matchEquip = (q['equipment'] as String).toLowerCase().contains(query);
        if (!matchCust && !matchId && !matchEquip) return false;
      }
      return true;
    }).toList();

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AppBar(
        title: const Text('Quotes & Proposals'),
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
          // Search & New Quote Row
          Row(
            children: [
              Expanded(
                child: Container(
                  height: 44,
                  decoration: BoxDecoration(
                    color: AeraColors.surface,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AeraColors.line),
                  ),
                  child: TextField(
                    onChanged: (val) => setState(() => _searchQuery = val),
                    style: AeraTypography.bodySm,
                    decoration: InputDecoration(
                      hintText: 'Search quote #, customer, unit...',
                      hintStyle: AeraTypography.bodySm.copyWith(color: AeraColors.outline),
                      prefixIcon: const Icon(Icons.search, size: 20, color: AeraColors.inkSoft),
                      border: InputBorder.none,
                      contentPadding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Container(
                height: 44,
                width: 44,
                decoration: BoxDecoration(
                  color: AeraColors.surface,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AeraColors.line),
                ),
                child: IconButton(
                  icon: const Icon(Icons.tune, size: 20, color: AeraColors.inkSoft),
                  onPressed: () {},
                ),
              ),
              const SizedBox(width: 8),
              ElevatedButton.icon(
                onPressed: () => context.push('/create-quote'),
                icon: const Icon(Icons.add, size: 18),
                label: const Text('New'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AeraColors.accent,
                  foregroundColor: AeraColors.surface,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),

          // Action Required Banner
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  AeraColors.accentSoft,
                  AeraColors.surface,
                  AeraColors.accentSoft.withOpacity(0.5),
                ],
              ),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AeraColors.line),
            ),
            child: Row(
              children: [
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: AeraColors.surface,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.draw, size: 20, color: AeraColors.accent),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            'ACTION REQUIRED',
                            style: AeraTypography.labelUpper.copyWith(
                              color: AeraColors.accent,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Container(
                            width: 6,
                            height: 6,
                            decoration: const BoxDecoration(
                              color: AeraColors.warning,
                              shape: BoxShape.circle,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '3 quotes awaiting digital client approval',
                        style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
                      ),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text('Pending', style: AeraTypography.label.copyWith(color: AeraColors.inkSoft)),
                    Text(
                      'Rs 56,700',
                      style: AeraTypography.h3.copyWith(fontWeight: FontWeight.w700),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Filter Tabs
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: _filterTabs.map((tab) {
                final isSelected = _activeFilter == tab;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterChip(
                    label: Text(tab),
                    selected: isSelected,
                    onSelected: (_) => setState(() => _activeFilter = tab),
                    backgroundColor: AeraColors.surface,
                    selectedColor: AeraColors.accent,
                    labelStyle: AeraTypography.label.copyWith(
                      color: isSelected ? AeraColors.surface : AeraColors.inkSoft,
                      fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(20),
                      side: BorderSide(
                        color: isSelected ? AeraColors.accent : AeraColors.line,
                      ),
                    ),
                    showCheckmark: false,
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 12),

          // Quotes List
          ...filtered.map((quote) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: InkWell(
                  onTap: () => context.push('/quotes/${quote['id']}'),
                  borderRadius: BorderRadius.circular(12),
                  child: AeraCard(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Row(
                              children: [
                                Text(
                                  quote['id'],
                                  style: AeraTypography.label.copyWith(
                                    color: AeraColors.inkSoft,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Container(
                                  width: 4,
                                  height: 4,
                                  decoration: const BoxDecoration(
                                    color: AeraColors.outline,
                                    shape: BoxShape.circle,
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Text(
                                  quote['time'],
                                  style: AeraTypography.label.copyWith(color: AeraColors.outline),
                                ),
                              ],
                            ),
                            AeraStatusChip(
                              label: quote['status'],
                              type: quote['statusType'] as AeraStatusType,
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Expanded(
                              child: Text(
                                quote['customer'],
                                style: AeraTypography.h3.copyWith(fontWeight: FontWeight.w600),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            Text(
                              quote['amount'],
                              style: AeraTypography.h3.copyWith(
                                fontWeight: FontWeight.w700,
                                color: AeraColors.ink,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            const Icon(Icons.hvac, size: 16, color: AeraColors.accent),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(
                                quote['equipment'],
                                style: AeraTypography.bodySm.copyWith(
                                  color: AeraColors.inkSoft,
                                  fontWeight: FontWeight.w500,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          quote['scope'],
                          style: AeraTypography.bodySm.copyWith(color: AeraColors.outline),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 10),
                        const Divider(color: AeraColors.line, height: 1),
                        const SizedBox(height: 8),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Row(
                              children: [
                                Icon(quote['icon'] as IconData, size: 15, color: AeraColors.accent),
                                const SizedBox(width: 6),
                                Text(
                                  quote['subtitle'] as String,
                                  style: AeraTypography.label.copyWith(
                                    color: AeraColors.accent,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                            Row(
                              children: [
                                Text(
                                  'Details',
                                  style: AeraTypography.label.copyWith(color: AeraColors.outline),
                                ),
                                const Icon(Icons.chevron_right, size: 16, color: AeraColors.outline),
                              ],
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              )),
        ],
      ),
    );
  }
}
