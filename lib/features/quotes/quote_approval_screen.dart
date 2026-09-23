import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/network/api_response.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_status_chip.dart';
import 'data/public_quote_repository.dart';
import 'providers/public_quote_provider.dart';

String _formatMoney(int minor, String currency) =>
    '$currency ${(minor / 100).toStringAsFixed(2)}';

(AeraStatusType, String) _quoteStatusPresentation(PublicQuote quote) {
  if (quote.status == 'APPROVED') {
    return (AeraStatusType.completed, 'Approved & Booked');
  }
  if (quote.status == 'DECLINED') {
    return (AeraStatusType.danger, 'Declined');
  }
  if (quote.isExpired) {
    return (AeraStatusType.warning, 'Expired');
  }
  return (AeraStatusType.info, 'Action Required');
}

/// Customer-facing estimate approval, reached via a quote's `shareToken`
/// (see `PortalQuote.shareToken` / `sendQuote`). Never uses the staff
/// session — approve/decline goes through the public
/// `POST /quotes/shared/:shareToken/respond` endpoint.
class QuoteApprovalScreen extends ConsumerStatefulWidget {
  const QuoteApprovalScreen({super.key, required this.shareToken});

  final String shareToken;

  @override
  ConsumerState<QuoteApprovalScreen> createState() =>
      _QuoteApprovalScreenState();
}

class _QuoteApprovalScreenState extends ConsumerState<QuoteApprovalScreen> {
  bool _showSignaturePad = false;
  bool _hasSigned = false;
  bool _submitting = false;

  Future<void> _respond(bool approve) async {
    setState(() => _submitting = true);
    try {
      await ref
          .read(publicQuoteRepositoryProvider)
          .respond(widget.shareToken, approve: approve);
      ref.invalidate(publicQuoteProvider(widget.shareToken));
      if (mounted) {
        setState(() {
          _showSignaturePad = false;
          _hasSigned = false;
        });
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(e.message)));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not submit your response')),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final quoteAsync = ref.watch(publicQuoteProvider(widget.shareToken));

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AeraAppBar(
        showBrand: true,
        subtitle: 'Aera Client Portal',
        title: 'Estimate Approval',
        showBack: false,
      ),
      body: SafeArea(
        child: quoteAsync.when(
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
                        : 'Could not load this estimate',
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: () =>
                        ref.invalidate(publicQuoteProvider(widget.shareToken)),
                    child: const Text('Retry'),
                  ),
                ],
              ),
            ),
          ),
          data: (quote) {
            final (statusType, statusLabel) = _quoteStatusPresentation(quote);
            final customerName = quote.customer?.fullName ?? 'Valued Customer';
            final scopeTitle = quote.job?.serviceType ?? 'Service Estimate';

            return ListView(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              children: [
                // Meta Header
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    AeraStatusChip(
                      label: statusLabel,
                      type: statusType,
                      showDot: true,
                    ),
                    if (quote.job != null)
                      Text(
                        'Job #${quote.job!.jobNumber}',
                        style: AeraTypography.bodySm.copyWith(
                          color: AeraColors.inkSoft,
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 12),

                // Hero Summary Card
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
                                'ISSUED TO',
                                style: AeraTypography.labelUpper.copyWith(
                                  color: AeraColors.accent,
                                ),
                              ),
                              Text(
                                customerName,
                                style: AeraTypography.h3.copyWith(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              if (quote.expiresAt != null)
                                Text(
                                  'Valid until ${DateFormat.yMMMd().format(quote.expiresAt!)}',
                                  style: AeraTypography.bodySm.copyWith(
                                    color: AeraColors.inkSoft,
                                  ),
                                ),
                            ],
                          ),
                          const Icon(
                            Icons.verified_user,
                            color: AeraColors.accent,
                            size: 28,
                          ),
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
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'SCOPE OF WORK',
                              style: AeraTypography.labelUpper.copyWith(
                                color: AeraColors.inkSoft,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              scopeTitle,
                              style: AeraTypography.body.copyWith(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),

                // Itemized Breakdown
                AeraCard(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'ITEMIZED BREAKDOWN',
                        style: AeraTypography.labelUpper.copyWith(
                          color: AeraColors.inkSoft,
                        ),
                      ),
                      const SizedBox(height: 12),
                      for (var i = 0; i < quote.items.length; i++) ...[
                        if (i > 0)
                          const Divider(color: AeraColors.line, height: 18),
                        _scopeItem(quote.items[i], quote.currency),
                      ],
                      const Divider(color: AeraColors.line, height: 24),
                      _totalRow(
                        'Subtotal',
                        quote.subtotalMinor,
                        quote.currency,
                      ),
                      if (quote.discountMinor > 0)
                        _totalRow(
                          'Discount',
                          -quote.discountMinor,
                          quote.currency,
                        ),
                      _totalRow(
                        'Tax (${(quote.taxRateBps / 100).toStringAsFixed(2)}%)',
                        quote.taxMinor,
                        quote.currency,
                      ),
                      const SizedBox(height: 6),
                      _totalRow(
                        'Total',
                        quote.totalMinor,
                        quote.currency,
                        emphasize: true,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                if (quote.status == 'APPROVED') ...[
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
                          'Estimate Approved!',
                          style: AeraTypography.h3.copyWith(
                            color: AeraColors.success,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Thank you — our team will be in touch to confirm scheduling.',
                          textAlign: TextAlign.center,
                          style: AeraTypography.bodySm.copyWith(
                            color: AeraColors.inkSoft,
                          ),
                        ),
                      ],
                    ),
                  ),
                ] else if (quote.status == 'DECLINED') ...[
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: AeraColors.dangerSoft,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: AeraColors.danger.withOpacity(0.3),
                      ),
                    ),
                    child: Column(
                      children: [
                        const Icon(
                          Icons.cancel_outlined,
                          size: 48,
                          color: AeraColors.danger,
                        ),
                        const SizedBox(height: 10),
                        Text(
                          'Estimate Declined',
                          style: AeraTypography.h3.copyWith(
                            color: AeraColors.danger,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Let us know if you\'d like to discuss a revised estimate.',
                          textAlign: TextAlign.center,
                          style: AeraTypography.bodySm.copyWith(
                            color: AeraColors.inkSoft,
                          ),
                        ),
                      ],
                    ),
                  ),
                ] else if (quote.isExpired) ...[
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: AeraColors.warningSoft,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: AeraColors.warning.withOpacity(0.3),
                      ),
                    ),
                    child: Column(
                      children: [
                        const Icon(
                          Icons.schedule_outlined,
                          size: 40,
                          color: AeraColors.warning,
                        ),
                        const SizedBox(height: 10),
                        Text(
                          'This estimate has expired',
                          style: AeraTypography.h3.copyWith(
                            color: AeraColors.warning,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Please contact our office for an updated estimate.',
                          textAlign: TextAlign.center,
                          style: AeraTypography.bodySm.copyWith(
                            color: AeraColors.inkSoft,
                          ),
                        ),
                      ],
                    ),
                  ),
                ] else if (_showSignaturePad) ...[
                  AeraCard(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              'CONFIRM DIGITAL SIGNATURE',
                              style: AeraTypography.labelUpper.copyWith(
                                color: AeraColors.ink,
                              ),
                            ),
                            IconButton(
                              icon: const Icon(Icons.close, size: 20),
                              onPressed: _submitting
                                  ? null
                                  : () => setState(
                                      () => _showSignaturePad = false,
                                    ),
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
                                color: _hasSigned
                                    ? AeraColors.accent
                                    : AeraColors.line,
                                width: _hasSigned ? 2 : 1,
                              ),
                            ),
                            child: Center(
                              child: _hasSigned
                                  ? Text(
                                      '$customerName ✓',
                                      style: AeraTypography.display.copyWith(
                                        color: AeraColors.accent,
                                        fontStyle: FontStyle.italic,
                                        fontSize: 28,
                                      ),
                                    )
                                  : Row(
                                      mainAxisAlignment:
                                          MainAxisAlignment.center,
                                      children: [
                                        const Icon(
                                          Icons.gesture,
                                          size: 20,
                                          color: AeraColors.outline,
                                        ),
                                        const SizedBox(width: 8),
                                        Text(
                                          'Tap to authorize with finger',
                                          style: AeraTypography.bodySm.copyWith(
                                            color: AeraColors.outline,
                                          ),
                                        ),
                                      ],
                                    ),
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        AeraButton(
                          text: _submitting
                              ? 'Submitting...'
                              : 'Authorize & Complete (${_formatMoney(quote.totalMinor, quote.currency)})',
                          icon: const Icon(
                            Icons.check,
                            size: 18,
                            color: Colors.white,
                          ),
                          isLoading: _submitting,
                          onPressed: (_hasSigned && !_submitting)
                              ? () => _respond(true)
                              : null,
                        ),
                      ],
                    ),
                  ),
                ] else ...[
                  AeraButton(
                    text:
                        'Approve Estimate (${_formatMoney(quote.totalMinor, quote.currency)})',
                    icon: const Icon(Icons.draw, size: 18, color: Colors.white),
                    onPressed: () => setState(() => _showSignaturePad = true),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      TextButton.icon(
                        onPressed: () {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text(
                                'Please contact our office to ask a question about this estimate',
                              ),
                            ),
                          );
                        },
                        icon: const Icon(
                          Icons.chat_bubble_outline,
                          size: 16,
                          color: AeraColors.accent,
                        ),
                        label: Text(
                          'Ask a Question',
                          style: AeraTypography.bodySm.copyWith(
                            color: AeraColors.accent,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      TextButton(
                        onPressed: _submitting ? null : () => _respond(false),
                        child: Text(
                          'Decline Estimate',
                          style: AeraTypography.bodySm.copyWith(
                            color: AeraColors.danger,
                          ),
                        ),
                      ),
                    ],
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

  Widget _scopeItem(PublicQuoteItem item, String currency) {
    final qtyLabel = item.quantity == item.quantity.roundToDouble()
        ? item.quantity.toStringAsFixed(0)
        : item.quantity.toString();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.description,
                  style: AeraTypography.bodySm.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(
                  'Qty $qtyLabel × ${_formatMoney(item.unitPriceMinor, currency)}',
                  style: AeraTypography.label.copyWith(
                    color: AeraColors.outline,
                  ),
                ),
              ],
            ),
          ),
          Text(
            _formatMoney(item.totalMinor, currency),
            style: AeraTypography.body.copyWith(fontWeight: FontWeight.w700),
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
