import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/network/api_response.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_status_chip.dart';
import 'data/quotes_repository.dart';
import 'providers/quotes_provider.dart';

AeraStatusType _quoteStatusType(String status) {
  switch (status) {
    case 'APPROVED':
      return AeraStatusType.success;
    case 'DECLINED':
      return AeraStatusType.danger;
    case 'SENT':
      return AeraStatusType.info;
    case 'EXPIRED':
      return AeraStatusType.warning;
    case 'DRAFT':
    default:
      return AeraStatusType.neutral;
  }
}

String _formatMoney(int minor, String currency) =>
    '$currency ${(minor / 100).toStringAsFixed(2)}';

class QuoteDetailScreen extends ConsumerStatefulWidget {
  const QuoteDetailScreen({super.key, required this.quoteId});

  final String quoteId;

  @override
  ConsumerState<QuoteDetailScreen> createState() => _QuoteDetailScreenState();
}

class _QuoteDetailScreenState extends ConsumerState<QuoteDetailScreen> {
  bool _sending = false;

  Future<void> _sendQuote() async {
    setState(() => _sending = true);
    try {
      await ref.read(quotesRepositoryProvider).sendQuote(widget.quoteId);
      ref.invalidate(quoteDetailProvider(widget.quoteId));
      ref.invalidate(quotesListProvider);
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Quote sent to customer')));
      }
    } catch (e) {
      if (mounted) {
        final message = e is ApiException
            ? e.message
            : 'Could not send quote. Please try again.';
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(message)));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _copyShareLink(String shareToken) {
    // No public web host is defined yet for the customer-facing quote
    // approval page, so we copy the raw share token/API path rather than
    // inventing a frontend URL that doesn't exist.
    Clipboard.setData(ClipboardData(text: shareToken));
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Share token copied to clipboard')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final quoteAsync = ref.watch(quoteDetailProvider(widget.quoteId));

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: const AeraAppBar(title: 'Quote Detail', subtitle: 'Estimate'),
      body: SafeArea(
        child: quoteAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Center(
            child: Text(
              error is ApiException ? error.message : 'Could not load quote',
            ),
          ),
          data: (quote) => ListView(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            children: [
              // Status + share token row
              AeraCard(
                padding: const EdgeInsets.all(16),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'STATUS',
                          style: AeraTypography.labelUpper.copyWith(
                            color: AeraColors.inkSoft,
                          ),
                        ),
                        const SizedBox(height: 4),
                        AeraStatusChip(
                          label: quote.status,
                          type: _quoteStatusType(quote.status),
                          showDot: true,
                        ),
                      ],
                    ),
                    if (quote.shareToken != null)
                      TextButton.icon(
                        onPressed: () => _copyShareLink(quote.shareToken!),
                        icon: const Icon(
                          Icons.link,
                          size: 16,
                          color: AeraColors.accent,
                        ),
                        label: Text(
                          'Copy Share Link',
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
                                quote.customer.fullName,
                                style: AeraTypography.h3.copyWith(fontSize: 16),
                              ),
                              if (quote.customer.email != null)
                                Text(
                                  quote.customer.email!,
                                  style: AeraTypography.bodySm,
                                ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    if (quote.job != null) ...[
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
                            'Job #${quote.job!.jobNumber} · ${quote.job!.status.replaceAll('_', ' ')}',
                            style: AeraTypography.bodySm,
                          ),
                        ],
                      ),
                    ],
                    if (quote.expiresAt != null) ...[
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
                            'Expires ${DateFormat('MMM d, yyyy').format(quote.expiresAt!)}',
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
                      'Line Items (${quote.items.length})',
                      style: AeraTypography.h3.copyWith(fontSize: 15),
                    ),
                    const SizedBox(height: 12),
                    for (final item in quote.items) ...[
                      _lineItem(item, quote.currency),
                      if (item != quote.items.last)
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
                            _formatMoney(quote.subtotalMinor, quote.currency),
                          ),
                          if (quote.discountMinor > 0) ...[
                            const SizedBox(height: 4),
                            _calcRow(
                              'Discount',
                              '-${_formatMoney(quote.discountMinor, quote.currency)}',
                            ),
                          ],
                          const SizedBox(height: 4),
                          _calcRow(
                            'Tax (${(quote.taxRateBps / 100).toStringAsFixed(2)}%)',
                            _formatMoney(quote.taxMinor, quote.currency),
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
                                _formatMoney(quote.totalMinor, quote.currency),
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
              const SizedBox(height: 12),

              // Approval timeline
              if (quote.approvalEvents.isNotEmpty)
                AeraCard(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Approval History',
                        style: AeraTypography.h3.copyWith(fontSize: 15),
                      ),
                      const SizedBox(height: 10),
                      for (final event in quote.approvalEvents)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Row(
                            children: [
                              Icon(
                                event.action == 'APPROVED'
                                    ? Icons.check_circle
                                    : Icons.cancel,
                                size: 16,
                                color: event.action == 'APPROVED'
                                    ? AeraColors.success
                                    : AeraColors.danger,
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  '${event.action} by ${event.actorName ?? event.source}',
                                  style: AeraTypography.bodySm,
                                ),
                              ),
                              Text(
                                DateFormat(
                                  'MMM d, h:mm a',
                                ).format(event.createdAt),
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

              if (quote.status == 'DRAFT' || quote.status == 'DECLINED')
                AeraButton(
                  text: quote.status == 'DECLINED'
                      ? 'Resend Quote'
                      : 'Send Quote to Customer',
                  icon: const Icon(
                    Icons.send_rounded,
                    size: 18,
                    color: Colors.white,
                  ),
                  isLoading: _sending,
                  onPressed: _sending ? null : _sendQuote,
                ),
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }

  Widget _lineItem(QuoteItem item, String currency) {
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

  Widget _calcRow(String label, String value) {
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
          ),
        ),
      ],
    );
  }
}
