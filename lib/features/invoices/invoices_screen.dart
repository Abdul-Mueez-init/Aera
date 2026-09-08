import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_status_chip.dart';

class InvoicesScreen extends StatefulWidget {
  const InvoicesScreen({super.key});

  @override
  State<InvoicesScreen> createState() => _InvoicesScreenState();
}

class _InvoicesScreenState extends State<InvoicesScreen> {
  String _activeFilter = 'All';
  String _searchQuery = '';

  final List<Map<String, dynamic>> _invoices = [
    {
      'id': 'INV-2384',
      'customer': 'Sarah Khan',
      'amount': 'Rs 18,500',
      'dueDate': 'Due Sep 12',
      'job': 'Compressor Replacement',
      'jobId': 'JOB-8492',
      'status': 'Sent',
      'statusType': AeraStatusType.info,
      'channel': 'Sent via WhatsApp & SMS',
    },
    {
      'id': 'INV-2380',
      'customer': 'Gourmet Foods Gulberg',
      'amount': 'Rs 92,000',
      'dueDate': 'Paid Sep 6',
      'job': 'Cold Storage Overhaul & R404A Recharge',
      'jobId': 'JOB-8410',
      'status': 'Paid',
      'statusType': AeraStatusType.success,
      'channel': 'Settled via Raast IBFT',
    },
    {
      'id': 'INV-2379',
      'customer': 'Cantt Commercial Plaza',
      'amount': 'Rs 14,200',
      'dueDate': '5 days overdue',
      'job': 'Filter & Coil Chem-Sanitization',
      'jobId': 'JOB-8390',
      'status': 'Overdue',
      'statusType': AeraStatusType.danger,
      'channel': 'Second Automated Reminder Dispatched',
    },
    {
      'id': 'INV-2385',
      'customer': 'Tariq Mehmood',
      'amount': 'Rs 8,400',
      'dueDate': 'Draft Created',
      'job': 'Inverter PCB Diagnostic & Capacitor',
      'jobId': 'JOB-8499',
      'status': 'Draft',
      'statusType': AeraStatusType.neutral,
      'channel': 'Ready for Dispatch',
    },
  ];

  final List<String> _tabs = ['All', 'Draft', 'Sent', 'Paid', 'Overdue'];

  @override
  Widget build(BuildContext context) {
    final filtered = _invoices.where((inv) {
      if (_activeFilter != 'All' && inv['status'] != _activeFilter) return false;
      if (_searchQuery.isNotEmpty) {
        final query = _searchQuery.toLowerCase();
        final matchCust = (inv['customer'] as String).toLowerCase().contains(query);
        final matchId = (inv['id'] as String).toLowerCase().contains(query);
        if (!matchCust && !matchId) return false;
      }
      return true;
    }).toList();

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AppBar(
        title: const Text('Invoices & Receivables'),
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
          // Search & New Invoice Row
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
                      hintText: 'Search invoice #, customer...',
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
                onPressed: () => context.push('/create-invoice'),
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

          // Receivables Overview Card
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
                        Row(
                          children: [
                            Container(
                              width: 6,
                              height: 6,
                              decoration: const BoxDecoration(
                                color: AeraColors.warning,
                                shape: BoxShape.circle,
                              ),
                            ),
                            const SizedBox(width: 6),
                            Text(
                              'RECEIVABLES OVERVIEW',
                              style: AeraTypography.labelUpper.copyWith(
                                color: AeraColors.inkSoft,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Row(
                          crossAxisAlignment: CrossAlignment.baseline,
                          textBaseline: TextBaseline.alphabetic,
                          children: [
                            Text(
                              'Rs ',
                              style: AeraTypography.body.copyWith(
                                color: AeraColors.accent,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            Text(
                              '84,300',
                              style: AeraTypography.display.copyWith(
                                fontWeight: FontWeight.w700,
                                fontSize: 32,
                              ),
                            ),
                            const SizedBox(width: 6),
                            Text(
                              'Outstanding',
                              style: AeraTypography.label.copyWith(color: AeraColors.inkSoft),
                            ),
                          ],
                        ),
                      ],
                    ),
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: AeraColors.accentSoft,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(
                        Icons.account_balance_wallet,
                        color: AeraColors.accent,
                        size: 24,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: AeraColors.infoSoft,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.schedule, size: 13, color: AeraColors.info),
                          const SizedBox(width: 4),
                          Text(
                            '3 Pending Client Payment',
                            style: AeraTypography.label.copyWith(
                              color: AeraColors.info,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: AeraColors.dangerSoft,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.warning, size: 13, color: AeraColors.danger),
                          const SizedBox(width: 4),
                          Text(
                            '1 Overdue (Rs 14.2k)',
                            style: AeraTypography.label.copyWith(
                              color: AeraColors.danger,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
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
              children: _tabs.map((tab) {
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

          // Invoices List
          ...filtered.map((inv) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: InkWell(
                  onTap: () => context.push('/invoice-payment'),
                  borderRadius: BorderRadius.circular(12),
                  child: AeraCard(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.between,
                          children: [
                            Row(
                              children: [
                                Text(
                                  inv['id'],
                                  style: AeraTypography.h3.copyWith(fontWeight: FontWeight.w700),
                                ),
                                const SizedBox(width: 8),
                                AeraStatusChip(
                                  label: inv['status'],
                                  type: inv['statusType'] as AeraStatusType,
                                ),
                              ],
                            ),
                            Column(
                              crossAxisAlignment: CrossAlignment.end,
                              children: [
                                Text(
                                  inv['amount'],
                                  style: AeraTypography.h3.copyWith(
                                    fontWeight: FontWeight.w700,
                                    color: AeraColors.ink,
                                  ),
                                ),
                                Text(
                                  inv['dueDate'],
                                  style: AeraTypography.label.copyWith(color: AeraColors.inkSoft),
                                ),
                              ],
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          inv['customer'],
                          style: AeraTypography.body.copyWith(fontWeight: FontWeight.w600),
                        ),
                        const SizedBox(height: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                          decoration: BoxDecoration(
                            color: AeraColors.surfaceSubtle,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.between,
                            children: [
                              Row(
                                children: [
                                  const Icon(Icons.hvac, size: 15, color: AeraColors.outline),
                                  const SizedBox(width: 6),
                                  Text(
                                    inv['job'],
                                    style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
                                  ),
                                ],
                              ),
                              Text(
                                '#${inv['jobId']}',
                                style: AeraTypography.label.copyWith(
                                  color: AeraColors.accent,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 8),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.between,
                          children: [
                            Row(
                              children: [
                                const Icon(Icons.forward_to_inbox, size: 14, color: AeraColors.accent),
                                const SizedBox(width: 6),
                                Text(
                                  inv['channel'],
                                  style: AeraTypography.label.copyWith(color: AeraColors.inkSoft),
                                ),
                              ],
                            ),
                            Row(
                              children: [
                                Text(
                                  'Pay Portal',
                                  style: AeraTypography.label.copyWith(
                                    color: AeraColors.accent,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                const Icon(Icons.chevron_right, size: 16, color: AeraColors.accent),
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
