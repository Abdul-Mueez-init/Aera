import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/network/api_response.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_status_chip.dart';
import '../portal/data/portal_repository.dart';
import '../portal/providers/portal_provider.dart';

String _formatMoney(int minor, String currency) =>
    '$currency ${(minor / 100).toStringAsFixed(2)}';

(AeraStatusType, String) _invoiceStatusPresentation(String status) {
  switch (status) {
    case 'PAID':
      return (AeraStatusType.completed, 'Paid in Full');
    case 'PARTIALLY_PAID':
      return (AeraStatusType.warning, 'Partially Paid');
    case 'OVERDUE':
      return (AeraStatusType.danger, 'Overdue');
    case 'VOID':
      return (AeraStatusType.neutral, 'Void');
    case 'ISSUED':
    default:
      return (AeraStatusType.warning, 'Payment Pending');
  }
}

/// Customer-facing invoice view, reached through a customer's portal link
/// (`portal_repository.dart`). There is no payment-provider integration in
/// the backend yet (`architecture.md` §9 flags this as future work behind a
/// provider abstraction), so this screen shows real invoice data and an
/// honest "contact us to pay" notice rather than a payment button that
/// can't actually charge anything.
class InvoicePaymentScreen extends ConsumerWidget {
  const InvoicePaymentScreen({
    super.key,
    required this.token,
    required this.invoiceId,
  });

  final String token;
  final String invoiceId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final portalAsync = ref.watch(portalSnapshotProvider(token));

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AeraAppBar(
        showBrand: true,
        subtitle: 'Aera Client Portal',
        title: 'Invoice',
        showBack: false,
      ),
      body: SafeArea(
        child: portalAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    error is ApiException
                        ? error.message
                        : 'Could not load your invoice',
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: () =>
                        ref.invalidate(portalSnapshotProvider(token)),
                    child: const Text('Retry'),
                  ),
                ],
              ),
            ),
          ),
          data: (customer) {
            final invoice = customer.invoices
                .where((inv) => inv.id == invoiceId)
                .cast<PortalInvoice?>()
                .firstWhere((_) => true, orElse: () => null);

            if (invoice == null) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(
                    'This invoice is no longer available.',
                    style: AeraTypography.body.copyWith(
                      color: AeraColors.inkSoft,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ),
              );
            }

            final (statusType, statusLabel) = _invoiceStatusPresentation(
              invoice.status,
            );

            return ListView(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        const Icon(
                          Icons.verified_user,
                          size: 16,
                          color: AeraColors.accent,
                        ),
                        const SizedBox(width: 6),
                        Text(
                          customer.fullName,
                          style: AeraTypography.labelUpper.copyWith(
                            color: AeraColors.inkSoft,
                          ),
                        ),
                      ],
                    ),
                    if (invoice.dueAt != null)
                      Text(
                        'Due ${DateFormat.yMMMd().format(invoice.dueAt!)}',
                        style: AeraTypography.label.copyWith(
                          color: AeraColors.inkSoft,
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 12),

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
                                'BILL TO: ${customer.fullName.toUpperCase()}',
                                style: AeraTypography.labelUpper.copyWith(
                                  color: AeraColors.inkSoft,
                                ),
                              ),
                              Text(
                                'Invoice #${invoice.invoiceNumber}',
                                style: AeraTypography.h3.copyWith(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          ),
                          AeraStatusChip(
                            label: statusLabel,
                            type: statusType,
                            showDot: true,
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
                                Text(
                                  'Balance Due',
                                  style: AeraTypography.bodySm.copyWith(
                                    color: AeraColors.inkSoft,
                                  ),
                                ),
                                Text(
                                  invoice.balanceDueMinor <= 0
                                      ? 'Settled'
                                      : statusLabel,
                                  style: AeraTypography.label.copyWith(
                                    color: invoice.balanceDueMinor <= 0
                                        ? AeraColors.success
                                        : AeraColors.ink,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text(
                              _formatMoney(
                                invoice.balanceDueMinor,
                                invoice.currency,
                              ),
                              style: AeraTypography.display.copyWith(
                                fontSize: 32,
                                fontWeight: FontWeight.w700,
                                color: invoice.balanceDueMinor <= 0
                                    ? AeraColors.success
                                    : AeraColors.ink,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),

                AeraCard(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'LINE ITEMS',
                        style: AeraTypography.labelUpper.copyWith(
                          color: AeraColors.inkSoft,
                        ),
                      ),
                      const SizedBox(height: 10),
                      for (var i = 0; i < invoice.items.length; i++) ...[
                        if (i > 0)
                          const Divider(color: AeraColors.line, height: 16),
                        _itemRow(invoice.items[i], invoice.currency),
                      ],
                      const Divider(color: AeraColors.line, height: 24),
                      _totalRow(
                        'Total',
                        invoice.totalMinor,
                        invoice.currency,
                        emphasize: true,
                      ),
                      _totalRow(
                        'Amount Paid',
                        invoice.amountPaidMinor,
                        invoice.currency,
                      ),
                      _totalRow(
                        'Balance Due',
                        invoice.balanceDueMinor,
                        invoice.currency,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                if (invoice.balanceDueMinor > 0) ...[
                  AeraCard(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Icon(
                              Icons.info_outline,
                              size: 18,
                              color: AeraColors.accent,
                            ),
                            const SizedBox(width: 8),
                            Text(
                              'HOW TO PAY',
                              style: AeraTypography.labelUpper.copyWith(
                                color: AeraColors.inkSoft,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Online payment isn\'t available yet. Please contact '
                          'our office to arrange payment for this invoice, '
                          'and reference the invoice number below.',
                          style: AeraTypography.bodySm.copyWith(
                            color: AeraColors.inkSoft,
                          ),
                        ),
                        const SizedBox(height: 10),
                        Row(
                          children: [
                            Expanded(
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                  vertical: 8,
                                ),
                                decoration: BoxDecoration(
                                  color: AeraColors.surfaceSubtle,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: Text(
                                  'Invoice #${invoice.invoiceNumber}',
                                  style: AeraTypography.body.copyWith(
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            OutlinedButton(
                              onPressed: () {
                                Clipboard.setData(
                                  ClipboardData(text: invoice.invoiceNumber),
                                );
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                    content: Text(
                                      'Invoice number copied to clipboard',
                                    ),
                                  ),
                                );
                              },
                              style: OutlinedButton.styleFrom(
                                foregroundColor: AeraColors.accent,
                                side: const BorderSide(
                                  color: AeraColors.accent,
                                ),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(8),
                                ),
                              ),
                              child: const Text('Copy'),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ] else ...[
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: AeraColors.successSoft,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: AeraColors.success.withOpacity(0.3),
                      ),
                    ),
                    child: Column(
                      children: [
                        const Icon(
                          Icons.check_circle,
                          size: 48,
                          color: AeraColors.success,
                        ),
                        const SizedBox(height: 10),
                        Text(
                          'This invoice is fully paid',
                          style: AeraTypography.h3.copyWith(
                            color: AeraColors.success,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 24),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _itemRow(PortalLineItem item, String currency) {
    final qtyLabel = item.quantity == item.quantity.roundToDouble()
        ? item.quantity.toStringAsFixed(0)
        : item.quantity.toString();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Text(
              item.description,
              style: AeraTypography.bodySm.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          Text(
            '$qtyLabel × ${_formatMoney(item.totalMinor, currency)}',
            style: AeraTypography.bodySm.copyWith(fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }

  Widget _totalRow(
    String label,
    int minor,
    String currency, {
    bool emphasize = false,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: emphasize
                ? AeraTypography.h3.copyWith(fontWeight: FontWeight.w700)
                : AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
          ),
          Text(
            _formatMoney(minor, currency),
            style: emphasize
                ? AeraTypography.h3.copyWith(
                    fontWeight: FontWeight.w700,
                    color: AeraColors.accent,
                  )
                : AeraTypography.bodySm.copyWith(fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}
