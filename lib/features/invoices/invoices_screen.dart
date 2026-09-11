import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/network/api_response.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_status_chip.dart';
import 'data/invoices_repository.dart';
import 'providers/invoices_provider.dart';

const _statusTabs = <String, String?>{
  'All': null,
  'Draft': 'DRAFT',
  'Issued': 'ISSUED',
  'Partially Paid': 'PARTIALLY_PAID',
  'Paid': 'PAID',
  'Overdue': 'OVERDUE',
  'Void': 'VOID',
};

AeraStatusType _invoiceStatusType(String status) {
  switch (status) {
    case 'PAID':
      return AeraStatusType.success;
    case 'PARTIALLY_PAID':
      return AeraStatusType.info;
    case 'ISSUED':
      return AeraStatusType.info;
    case 'OVERDUE':
      return AeraStatusType.danger;
    case 'VOID':
      return AeraStatusType.danger;
    case 'DRAFT':
    default:
      return AeraStatusType.neutral;
  }
}

String _statusLabel(String status) => status
    .replaceAll('_', ' ')
    .split(' ')
    .map((w) {
      if (w.isEmpty) return w;
      return '${w[0]}${w.substring(1).toLowerCase()}';
    })
    .join(' ');

String _formatMoney(int minor, String currency) =>
    '$currency ${(minor / 100).toStringAsFixed(2)}';

class InvoicesScreen extends ConsumerStatefulWidget {
  const InvoicesScreen({super.key});

  @override
  ConsumerState<InvoicesScreen> createState() => _InvoicesScreenState();
}

class _InvoicesScreenState extends ConsumerState<InvoicesScreen> {
  String _activeFilter = 'All';
  String _searchQuery = '';

  @override
  Widget build(BuildContext context) {
    final invoicesAsync = ref.watch(invoicesListProvider);

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AppBar(title: const Text('Invoices & Receivables')),
      body: SafeArea(
        child: invoicesAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => _ErrorState(
            message: error is ApiException
                ? error.message
                : 'Could not load invoices',
            onRetry: () => ref.invalidate(invoicesListProvider),
          ),
          data: (invoices) {
            final byStatus = invoices
                .where(
                  (inv) =>
                      _statusTabs[_activeFilter] == null ||
                      inv.status == _statusTabs[_activeFilter],
                )
                .toList();
            final filtered = byStatus.where((inv) {
              if (_searchQuery.isEmpty) return true;
              final query = _searchQuery.toLowerCase();
              final matchCust = inv.customer.fullName.toLowerCase().contains(
                query,
              );
              final matchId = inv.invoiceNumber.toLowerCase().contains(query);
              return matchCust || matchId;
            }).toList();

            final outstandingMinor = invoices
                .where((i) => i.status != 'DRAFT' && i.status != 'VOID')
                .fold<int>(0, (sum, i) => sum + i.balanceDueMinor);
            final pendingCount = invoices
                .where(
                  (i) => i.status == 'ISSUED' || i.status == 'PARTIALLY_PAID',
                )
                .length;
            final overdue = invoices
                .where((i) => i.status == 'OVERDUE')
                .toList();
            final overdueMinor = overdue.fold<int>(
              0,
              (sum, i) => sum + i.balanceDueMinor,
            );
            final currency = invoices.isNotEmpty
                ? invoices.first.currency
                : 'USD';

            return RefreshIndicator(
              onRefresh: () async {
                ref.invalidate(invoicesListProvider);
                await ref.read(invoicesListProvider.future);
              },
              child: ListView(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 12,
                ),
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
                            onChanged: (val) =>
                                setState(() => _searchQuery = val),
                            style: AeraTypography.bodySm,
                            decoration: InputDecoration(
                              hintText: 'Search invoice #, customer...',
                              hintStyle: AeraTypography.bodySm.copyWith(
                                color: AeraColors.outline,
                              ),
                              prefixIcon: const Icon(
                                Icons.search,
                                size: 20,
                                color: AeraColors.inkSoft,
                              ),
                              border: InputBorder.none,
                              contentPadding: const EdgeInsets.symmetric(
                                vertical: 12,
                              ),
                            ),
                          ),
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
                          padding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 12,
                          ),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),

                  // Receivables Overview Card
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
                                  crossAxisAlignment:
                                      CrossAxisAlignment.baseline,
                                  textBaseline: TextBaseline.alphabetic,
                                  children: [
                                    Text(
                                      '$currency ',
                                      style: AeraTypography.body.copyWith(
                                        color: AeraColors.accent,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                    Text(
                                      (outstandingMinor / 100).toStringAsFixed(
                                        2,
                                      ),
                                      style: AeraTypography.display.copyWith(
                                        fontWeight: FontWeight.w700,
                                        fontSize: 32,
                                      ),
                                    ),
                                    const SizedBox(width: 6),
                                    Text(
                                      'Outstanding',
                                      style: AeraTypography.label.copyWith(
                                        color: AeraColors.inkSoft,
                                      ),
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
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            if (pendingCount > 0)
                              _pill(
                                icon: Icons.schedule,
                                label: '$pendingCount Pending Client Payment',
                                bg: AeraColors.infoSoft,
                                fg: AeraColors.info,
                              ),
                            if (overdue.isNotEmpty)
                              _pill(
                                icon: Icons.warning,
                                label:
                                    '${overdue.length} Overdue (${_formatMoney(overdueMinor, currency)})',
                                bg: AeraColors.dangerSoft,
                                fg: AeraColors.danger,
                              ),
                            if (pendingCount == 0 && overdue.isEmpty)
                              _pill(
                                icon: Icons.check_circle,
                                label: 'Nothing outstanding',
                                bg: AeraColors.successSoft,
                                fg: AeraColors.success,
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
                      children: _statusTabs.keys.map((tab) {
                        final isSelected = _activeFilter == tab;
                        return Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: FilterChip(
                            label: Text(tab),
                            selected: isSelected,
                            onSelected: (_) =>
                                setState(() => _activeFilter = tab),
                            backgroundColor: AeraColors.surface,
                            selectedColor: AeraColors.accent,
                            labelStyle: AeraTypography.label.copyWith(
                              color: isSelected
                                  ? AeraColors.surface
                                  : AeraColors.inkSoft,
                              fontWeight: isSelected
                                  ? FontWeight.w600
                                  : FontWeight.w500,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(20),
                              side: BorderSide(
                                color: isSelected
                                    ? AeraColors.accent
                                    : AeraColors.line,
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
                  if (filtered.isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 48),
                      child: Center(
                        child: Column(
                          children: [
                            const Icon(
                              Icons.receipt_long_outlined,
                              size: 48,
                              color: AeraColors.outline,
                            ),
                            const SizedBox(height: 12),
                            Text(
                              _activeFilter == 'All'
                                  ? 'No invoices yet'
                                  : 'No invoices in this status',
                              style: AeraTypography.bodyMedium,
                            ),
                            if (_activeFilter == 'All') ...[
                              const SizedBox(height: 8),
                              Text(
                                'Generate one from a completed job to get started',
                                style: AeraTypography.bodySm,
                              ),
                            ],
                          ],
                        ),
                      ),
                    )
                  else
                    ...filtered.map(
                      (inv) => Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _InvoiceCard(invoice: inv),
                      ),
                    ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _pill({
    required IconData icon,
    required String label,
    required Color bg,
    required Color fg,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: fg),
          const SizedBox(width: 4),
          Text(
            label,
            style: AeraTypography.label.copyWith(
              color: fg,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _InvoiceCard extends StatelessWidget {
  const _InvoiceCard({required this.invoice});

  final Invoice invoice;

  @override
  Widget build(BuildContext context) {
    final dueLabel = invoice.status == 'PAID' && invoice.paidAt != null
        ? 'Paid ${_shortDate(invoice.paidAt!)}'
        : invoice.status == 'DRAFT'
        ? 'Draft — not yet issued'
        : invoice.dueAt != null
        ? 'Due ${_shortDate(invoice.dueAt!)}'
        : invoice.issuedAt != null
        ? 'Issued ${_shortDate(invoice.issuedAt!)}'
        : '';

    return InkWell(
      onTap: () => context.push('/invoices/${invoice.id}'),
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
                      invoice.invoiceNumber,
                      style: AeraTypography.h3.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(width: 8),
                    AeraStatusChip(
                      label: _statusLabel(invoice.status),
                      type: _invoiceStatusType(invoice.status),
                    ),
                  ],
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      _formatMoney(invoice.totalMinor, invoice.currency),
                      style: AeraTypography.h3.copyWith(
                        fontWeight: FontWeight.w700,
                        color: AeraColors.ink,
                      ),
                    ),
                    if (dueLabel.isNotEmpty)
                      Text(
                        dueLabel,
                        style: AeraTypography.label.copyWith(
                          color: AeraColors.inkSoft,
                        ),
                      ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              invoice.customer.fullName,
              style: AeraTypography.body.copyWith(fontWeight: FontWeight.w600),
            ),
            if (invoice.job != null) ...[
              const SizedBox(height: 8),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: AeraColors.surfaceSubtle,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        const Icon(
                          Icons.hvac,
                          size: 15,
                          color: AeraColors.outline,
                        ),
                        const SizedBox(width: 6),
                        Text(
                          'Job #${invoice.job!.jobNumber}',
                          style: AeraTypography.bodySm.copyWith(
                            color: AeraColors.inkSoft,
                          ),
                        ),
                      ],
                    ),
                    if (invoice.balanceDueMinor > 0 &&
                        invoice.status != 'DRAFT')
                      Text(
                        'Balance ${_formatMoney(invoice.balanceDueMinor, invoice.currency)}',
                        style: AeraTypography.label.copyWith(
                          color: AeraColors.accent,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                  ],
                ),
              ),
            ],
            if (invoice.totalMinor == 0)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Row(
                  children: [
                    const Icon(
                      Icons.error_outline,
                      size: 14,
                      color: AeraColors.warning,
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        'No quote or parts found — placeholder \$0 invoice, needs review',
                        style: AeraTypography.label.copyWith(
                          color: AeraColors.warning,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            const SizedBox(height: 8),
            const Divider(color: AeraColors.line, height: 1),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                Text(
                  'Details',
                  style: AeraTypography.label.copyWith(
                    color: AeraColors.accent,
                  ),
                ),
                const Icon(
                  Icons.chevron_right,
                  size: 16,
                  color: AeraColors.accent,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _shortDate(DateTime date) {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return '${months[date.month - 1]} ${date.day}';
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.error_outline,
              size: 48,
              color: AeraColors.warning,
            ),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }
}
