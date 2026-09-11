import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/network/api_response.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_status_chip.dart';
import '../../core/widgets/aera_text_field.dart';
import 'data/invoices_repository.dart';
import 'providers/invoices_provider.dart';

AeraStatusType _invoiceStatusType(String status) {
  switch (status) {
    case 'PAID':
      return AeraStatusType.success;
    case 'PARTIALLY_PAID':
    case 'ISSUED':
      return AeraStatusType.info;
    case 'OVERDUE':
    case 'VOID':
      return AeraStatusType.danger;
    case 'DRAFT':
    default:
      return AeraStatusType.neutral;
  }
}

String _statusLabel(String status) =>
    status.replaceAll('_', ' ').split(' ').map((w) {
      if (w.isEmpty) return w;
      return '${w[0]}${w.substring(1).toLowerCase()}';
    }).join(' ');

String _formatMoney(int minor, String currency) =>
    '$currency ${(minor / 100).toStringAsFixed(2)}';

const _paymentMethods = <String>['CASH', 'CARD', 'BANK_TRANSFER', 'OTHER'];

class InvoiceDetailScreen extends ConsumerStatefulWidget {
  const InvoiceDetailScreen({super.key, required this.invoiceId});

  final String invoiceId;

  @override
  ConsumerState<InvoiceDetailScreen> createState() =>
      _InvoiceDetailScreenState();
}

class _InvoiceDetailScreenState extends ConsumerState<InvoiceDetailScreen> {
  bool _issuing = false;

  Future<void> _issueInvoice() async {
    setState(() => _issuing = true);
    try {
      await ref.read(invoicesRepositoryProvider).issueInvoice(
        widget.invoiceId,
      );
      ref.invalidate(invoiceDetailProvider(widget.invoiceId));
      ref.invalidate(invoicesListProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Invoice issued to customer')),
        );
      }
    } catch (e) {
      if (mounted) {
        final message = e is ApiException
            ? e.message
            : 'Could not issue invoice. Please try again.';
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(message)));
      }
    } finally {
      if (mounted) setState(() => _issuing = false);
    }
  }

  Future<void> _openRecordPaymentSheet(Invoice invoice) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => _RecordPaymentSheet(
        invoiceId: widget.invoiceId,
        balanceDueMinor: invoice.balanceDueMinor,
        currency: invoice.currency,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final invoiceAsync = ref.watch(invoiceDetailProvider(widget.invoiceId));

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: const AeraAppBar(
        title: 'Invoice Detail',
        subtitle: 'Billing',
      ),
      body: SafeArea(
        child: invoiceAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Center(
            child: Text(
              error is ApiException ? error.message : 'Could not load invoice',
            ),
          ),
          data: (invoice) => ListView(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            children: [
              // Status + invoice number row
              AeraCard(
                padding: const EdgeInsets.all(16),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          invoice.invoiceNumber,
                          style: AeraTypography.h3.copyWith(fontSize: 17),
                        ),
                        const SizedBox(height: 4),
                        AeraStatusChip(
                          label: _statusLabel(invoice.status),
                          type: _invoiceStatusType(invoice.status),
                          showDot: true,
                        ),
                      ],
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          'TOTAL',
                          style: AeraTypography.labelUpper.copyWith(
                            color: AeraColors.inkSoft,
                          ),
                        ),
                        Text(
                          _formatMoney(invoice.totalMinor, invoice.currency),
                          style: AeraTypography.h2.copyWith(fontSize: 20),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),

              if (invoice.totalMinor == 0)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: AeraCard(
                    backgroundColor: AeraColors.warningSoft,
                    borderColor: AeraColors.warning,
                    padding: const EdgeInsets.all(14),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(
                          Icons.error_outline,
                          size: 18,
                          color: AeraColors.warning,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            'This job had no approved quote and no logged parts, '
                            'so a placeholder \$0 line item was generated. There is '
                            'no line-item-editing endpoint yet — this needs a manual '
                            'fix outside the app until one is added.',
                            style: AeraTypography.bodySm.copyWith(
                              color: AeraColors.warning,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

              // Customer + job card
              AeraCard(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 40,
                          height: 40,
                          decoration: BoxDecoration(
                            color: AeraColors.surfaceSubtle,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Icon(
                            Icons.person_pin,
                            color: AeraColors.accent,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                invoice.customer.fullName,
                                style: AeraTypography.h3.copyWith(
                                  fontSize: 16,
                                ),
                              ),
                              if (invoice.customer.email != null)
                                Text(
                                  invoice.customer.email!,
                                  style: AeraTypography.bodySm,
                                ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    if (invoice.job != null) ...[
                      const SizedBox(height: 10),
                      const Divider(color: AeraColors.line, height: 1),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          const Icon(
                            Icons.hvac,
                            size: 16,
                            color: AeraColors.accent,
                          ),
                          const SizedBox(width: 6),
                          Text(
                            'Job #${invoice.job!.jobNumber} · ${invoice.job!.status.replaceAll('_', ' ')}',
                            style: AeraTypography.bodySm,
                          ),
                        ],
                      ),
                    ],
                    if (invoice.dueAt != null) ...[
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          const Icon(
                            Icons.event_busy,
                            size: 16,
                            color: AeraColors.inkSoft,
                          ),
                          const SizedBox(width: 6),
                          Text(
                            'Due ${DateFormat('MMM d, yyyy').format(invoice.dueAt!)}',
                            style: AeraTypography.bodySm,
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 12),

              // Line items + totals
              AeraCard(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Line Items (${invoice.items.length})',
                      style: AeraTypography.h3.copyWith(fontSize: 15),
                    ),
                    const SizedBox(height: 12),
                    for (final item in invoice.items) ...[
                      _lineItem(item, invoice.currency),
                      if (item != invoice.items.last)
                        const Divider(color: AeraColors.line, height: 20),
                    ],
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AeraColors.surfaceSubtle,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Column(
                        children: [
                          _calcRow(
                            'Subtotal',
                            _formatMoney(invoice.subtotalMinor, invoice.currency),
                          ),
                          if (invoice.discountMinor > 0) ...[
                            const SizedBox(height: 4),
                            _calcRow(
                              'Discount',
                              '-${_formatMoney(invoice.discountMinor, invoice.currency)}',
                            ),
                          ],
                          const SizedBox(height: 4),
                          _calcRow(
                            'Tax',
                            _formatMoney(invoice.taxMinor, invoice.currency),
                          ),
                          const Divider(color: AeraColors.line, height: 16),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                'Total',
                                style: AeraTypography.body.copyWith(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              Text(
                                _formatMoney(invoice.totalMinor, invoice.currency),
                                style: AeraTypography.h3.copyWith(
                                  fontWeight: FontWeight.w700,
                                  color: AeraColors.accent,
                                ),
                              ),
                            ],
                          ),
                          if (invoice.status != 'DRAFT') ...[
                            const SizedBox(height: 8),
                            _calcRow(
                              'Paid',
                              _formatMoney(
                                invoice.amountPaidMinor,
                                invoice.currency,
                              ),
                            ),
                            const SizedBox(height: 4),
                            _calcRow(
                              'Balance due',
                              _formatMoney(
                                invoice.balanceDueMinor,
                                invoice.currency,
                              ),
                              emphasize: invoice.balanceDueMinor > 0,
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),

              // Payment history
              AeraCard(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Payment History (${invoice.payments.length})',
                      style: AeraTypography.h3.copyWith(fontSize: 15),
                    ),
                    const SizedBox(height: 10),
                    if (invoice.payments.isEmpty)
                      Text(
                        'No payments recorded yet',
                        style: AeraTypography.bodySm.copyWith(
                          color: AeraColors.inkSoft,
                        ),
                      )
                    else
                      for (final payment in invoice.payments)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: Row(
                            children: [
                              Container(
                                width: 32,
                                height: 32,
                                decoration: BoxDecoration(
                                  color: AeraColors.successSoft,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: const Icon(
                                  Icons.check,
                                  size: 16,
                                  color: AeraColors.success,
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      _formatMoney(
                                        payment.amountMinor,
                                        payment.currency,
                                      ),
                                      style: AeraTypography.bodyMedium
                                          .copyWith(fontWeight: FontWeight.w700),
                                    ),
                                    Text(
                                      '${_statusLabel(payment.method)}'
                                      '${payment.reference != null && payment.reference!.isNotEmpty ? ' · ${payment.reference}' : ''}',
                                      style: AeraTypography.label.copyWith(
                                        color: AeraColors.inkSoft,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              Text(
                                DateFormat(
                                  'MMM d, h:mm a',
                                ).format(payment.receivedAt),
                                style: AeraTypography.label.copyWith(
                                  color: AeraColors.outline,
                                ),
                              ),
                            ],
                          ),
                        ),
                  ],
                ),
              ),
              const SizedBox(height: 20),

              if (invoice.status == 'DRAFT')
                AeraButton(
                  text: 'Issue Invoice',
                  icon: const Icon(
                    Icons.send_rounded,
                    size: 18,
                    color: Colors.white,
                  ),
                  isLoading: _issuing,
                  onPressed: _issuing ? null : _issueInvoice,
                ),
              if (invoice.status == 'ISSUED' ||
                  invoice.status == 'PARTIALLY_PAID' ||
                  invoice.status == 'OVERDUE')
                AeraButton(
                  text: 'Record Payment',
                  icon: const Icon(
                    Icons.payments_outlined,
                    size: 18,
                    color: Colors.white,
                  ),
                  onPressed: () => _openRecordPaymentSheet(invoice),
                ),
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }

  Widget _lineItem(InvoiceItem item, String currency) {
    final qtyLabel = item.quantity == item.quantity.roundToDouble()
        ? item.quantity.toStringAsFixed(0)
        : item.quantity.toStringAsFixed(2);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.description,
                  style: AeraTypography.bodyMedium.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Qty $qtyLabel × ${_formatMoney(item.unitPriceMinor, currency)}',
                  style: AeraTypography.label.copyWith(
                    color: AeraColors.outline,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            _formatMoney(item.totalMinor, currency),
            style: AeraTypography.body.copyWith(fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }

  Widget _calcRow(String label, String value, {bool emphasize = false}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
        ),
        Text(
          value,
          style: AeraTypography.bodyMedium.copyWith(
            fontWeight: FontWeight.w600,
            color: emphasize ? AeraColors.accent : AeraColors.ink,
          ),
        ),
      ],
    );
  }
}

/// Amount/method form for `POST /invoices/:id/payments`. Mints one fresh
/// idempotency key per sheet open (i.e. per genuinely new attempt); if the
/// same submit fails on a network error the key is reused for the retry
/// button rather than minted again, since that's the exact case the header
/// exists to protect against double-charging.
class _RecordPaymentSheet extends ConsumerStatefulWidget {
  const _RecordPaymentSheet({
    required this.invoiceId,
    required this.balanceDueMinor,
    required this.currency,
  });

  final String invoiceId;
  final int balanceDueMinor;
  final String currency;

  @override
  ConsumerState<_RecordPaymentSheet> createState() =>
      _RecordPaymentSheetState();
}

class _RecordPaymentSheetState extends ConsumerState<_RecordPaymentSheet> {
  late final TextEditingController _amountController;
  final TextEditingController _referenceController = TextEditingController();
  String _method = 'CASH';
  bool _saving = false;
  late final String _idempotencyKey;

  @override
  void initState() {
    super.initState();
    _amountController = TextEditingController(
      text: (widget.balanceDueMinor / 100).toStringAsFixed(2),
    );
    _idempotencyKey = generateIdempotencyKey();
  }

  @override
  void dispose() {
    _amountController.dispose();
    _referenceController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final amount = double.tryParse(_amountController.text.trim());
    if (amount == null || amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter a valid payment amount')),
      );
      return;
    }
    final amountMinor = (amount * 100).round();

    setState(() => _saving = true);
    try {
      await ref
          .read(invoicesRepositoryProvider)
          .recordPayment(
            widget.invoiceId,
            RecordPaymentInput(
              amountMinor: amountMinor,
              currency: widget.currency,
              method: _method,
              reference: _referenceController.text,
            ),
            _idempotencyKey,
          );
      ref.invalidate(invoiceDetailProvider(widget.invoiceId));
      ref.invalidate(invoicesListProvider);
      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Payment recorded')));
      }
    } catch (e) {
      if (mounted) {
        final message = e is ApiException
            ? e.message
            : 'Could not record payment. Please try again.';
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(message)));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Container(
        decoration: const BoxDecoration(
          color: AeraColors.canvas,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(
                  color: AeraColors.line,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Text('Record Payment', style: AeraTypography.h3.copyWith(fontSize: 17)),
            const SizedBox(height: 4),
            Text(
              'Balance due: ${_formatMoney(widget.balanceDueMinor, widget.currency)}',
              style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
            ),
            const SizedBox(height: 16),
            AeraTextField(
              label: 'Amount (${widget.currency})',
              controller: _amountController,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
            ),
            const SizedBox(height: 12),
            Text(
              'Method',
              style: AeraTypography.labelUpper.copyWith(fontSize: 10),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: _paymentMethods.map((m) {
                final selected = _method == m;
                return ChoiceChip(
                  label: Text(_statusLabel(m)),
                  selected: selected,
                  onSelected: (_) => setState(() => _method = m),
                  selectedColor: AeraColors.accentSoft,
                  backgroundColor: AeraColors.surface,
                  labelStyle: AeraTypography.label.copyWith(
                    color: selected ? AeraColors.accent : AeraColors.ink,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                  ),
                  side: BorderSide(
                    color: selected ? AeraColors.accent : AeraColors.line,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: AeraRadii.borderFull,
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 12),
            AeraTextField(
              label: 'Reference (optional)',
              hintText: 'Cheque #, transaction id...',
              controller: _referenceController,
            ),
            const SizedBox(height: 20),
            AeraButton(
              text: 'Confirm Payment',
              isLoading: _saving,
              onPressed: _saving ? null : _submit,
            ),
          ],
        ),
      ),
    );
  }
}
