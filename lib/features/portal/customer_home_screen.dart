import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/network/api_response.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_metric_card.dart';
import '../../core/widgets/aera_status_chip.dart';
import 'data/portal_repository.dart';
import 'providers/portal_provider.dart';

String _formatMoney(int minor, String currency) =>
    '$currency ${(minor / 100).toStringAsFixed(2)}';

(AeraStatusType, String) _jobStatusPresentation(String status) {
  switch (status) {
    case 'COMPLETED':
      return (AeraStatusType.completed, 'Completed');
    case 'CANCELLED':
      return (AeraStatusType.danger, 'Cancelled');
    case 'IN_PROGRESS':
      return (AeraStatusType.inProgress, 'In Progress');
    case 'WAITING_PARTS':
      return (AeraStatusType.warning, 'Waiting on Parts');
    case 'EN_ROUTE':
      return (AeraStatusType.inProgress, 'En Route');
    case 'SCHEDULED':
      return (AeraStatusType.scheduled, 'Scheduled');
    case 'QUOTING':
      return (AeraStatusType.info, 'Awaiting Estimate');
    case 'NEW':
    default:
      return (AeraStatusType.neutral, 'Not Yet Scheduled');
  }
}

(AeraStatusType, String) _invoiceStatusPresentation(String status) {
  switch (status) {
    case 'PAID':
      return (AeraStatusType.completed, 'Paid');
    case 'PARTIALLY_PAID':
      return (AeraStatusType.warning, 'Partial');
    case 'OVERDUE':
      return (AeraStatusType.danger, 'Overdue');
    case 'VOID':
      return (AeraStatusType.neutral, 'Void');
    case 'ISSUED':
    default:
      return (AeraStatusType.warning, 'Due');
  }
}

/// The customer portal's entry screen (design.md screen #32 — never
/// designed in Stitch, so this is hand-built directly in Flutter using the
/// same visual language as the other portal screens per the Slice D plan
/// in `aera_handoff_phase9-11.md`). Reached via the customer's bearer-less
/// portal link (`/portal/:token`); everything on this screen is sourced
/// from the single `getPublicPortal` snapshot — no separate calls.
class CustomerHomeScreen extends ConsumerWidget {
  const CustomerHomeScreen({super.key, required this.token});

  final String token;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final portalAsync = ref.watch(portalSnapshotProvider(token));

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AeraAppBar(
        showBrand: true,
        subtitle: 'Aera Client Portal',
        title: portalAsync.maybeWhen(
          data: (customer) => customer.fullName,
          orElse: () => 'My Account',
        ),
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
                        : 'Could not load your account',
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
          data: (customer) =>
              _CustomerHomeBody(token: token, customer: customer),
        ),
      ),
    );
  }
}

class _CustomerHomeBody extends ConsumerWidget {
  const _CustomerHomeBody({required this.token, required this.customer});

  final String token;
  final PortalCustomer customer;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final upcoming = [...customer.upcomingJobs]
      ..sort((a, b) {
        final aStart = a.scheduledStart;
        final bStart = b.scheduledStart;
        if (aStart == null && bStart == null) return 0;
        if (aStart == null) return 1;
        if (bStart == null) return -1;
        return aStart.compareTo(bStart);
      });
    final nextJob = upcoming.isNotEmpty ? upcoming.first : null;

    final pendingQuotes = customer.quotes
        .where((q) => q.status == 'SENT' && q.shareToken != null)
        .toList();

    final unpaidInvoices = customer.invoices
        .where((inv) => inv.balanceDueMinor > 0)
        .toList();
    final balanceCurrency = unpaidInvoices.isNotEmpty
        ? unpaidInvoices.first.currency
        : (customer.invoices.isNotEmpty
              ? customer.invoices.first.currency
              : 'USD');
    final totalBalanceDue = unpaidInvoices.fold<int>(
      0,
      (sum, inv) => sum + inv.balanceDueMinor,
    );

    final history = customer.serviceHistory.reversed.toList();

    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      children: [
        Text(
          'Welcome back, ${customer.firstName.isNotEmpty ? customer.firstName : customer.fullName}',
          style: AeraTypography.h2.copyWith(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 2),
        Text(
          'Here\'s what\'s happening with your service.',
          style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
        ),
        const SizedBox(height: 16),

        // Quick stats
        Row(
          children: [
            Expanded(
              child: AeraMetricCard(
                label: 'Upcoming Jobs',
                value: '${upcoming.length}',
                icon: Icons.event_available_outlined,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: AeraMetricCard(
                label: 'Balance Due',
                value: _formatMoney(totalBalanceDue, balanceCurrency),
                valueColor: totalBalanceDue > 0
                    ? AeraColors.warning
                    : AeraColors.success,
                icon: Icons.receipt_long_outlined,
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),

        // Next appointment
        Text(
          'NEXT APPOINTMENT',
          style: AeraTypography.labelUpper.copyWith(color: AeraColors.inkSoft),
        ),
        const SizedBox(height: 8),
        if (nextJob == null)
          AeraCard(
            child: Text(
              'No upcoming appointments scheduled.',
              style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
            ),
          )
        else
          _buildAppointmentCard(context, nextJob),
        const SizedBox(height: 20),

        // Quotes awaiting response
        if (pendingQuotes.isNotEmpty) ...[
          Text(
            'QUOTES AWAITING YOUR RESPONSE',
            style: AeraTypography.labelUpper.copyWith(
              color: AeraColors.inkSoft,
            ),
          ),
          const SizedBox(height: 8),
          for (final quote in pendingQuotes) ...[
            _buildQuoteRow(context, quote),
            const SizedBox(height: 8),
          ],
          const SizedBox(height: 12),
        ],

        // Invoices
        if (unpaidInvoices.isNotEmpty) ...[
          Text(
            'INVOICES',
            style: AeraTypography.labelUpper.copyWith(
              color: AeraColors.inkSoft,
            ),
          ),
          const SizedBox(height: 8),
          for (final invoice in unpaidInvoices) ...[
            _buildInvoiceRow(context, invoice),
            const SizedBox(height: 8),
          ],
          const SizedBox(height: 12),
        ],

        // Service history
        Text(
          'SERVICE HISTORY',
          style: AeraTypography.labelUpper.copyWith(color: AeraColors.inkSoft),
        ),
        const SizedBox(height: 8),
        if (history.isEmpty)
          AeraCard(
            child: Text(
              'Your service history will appear here after your first completed job.',
              style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
            ),
          )
        else
          for (final job in history) ...[
            _buildHistoryRow(context, ref, job),
            const SizedBox(height: 8),
          ],
        const SizedBox(height: 24),
      ],
    );
  }

  Widget _buildAppointmentCard(BuildContext context, PortalJob job) {
    final (statusType, statusLabel) = _jobStatusPresentation(job.status);
    return AeraCard(
      onTap: () => context.push('/technician-tracking/$token/${job.id}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  job.serviceType,
                  style: AeraTypography.h3.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              AeraStatusChip(
                label: statusLabel,
                type: statusType,
                showDot: true,
              ),
            ],
          ),
          const SizedBox(height: 6),
          if (job.scheduledStart != null)
            _iconRow(
              Icons.event_outlined,
              DateFormat('EEE, MMM d • h:mm a').format(job.scheduledStart!),
            ),
          if (job.address != null)
            _iconRow(Icons.location_on_outlined, job.address!.formatted),
          if (job.technician != null)
            _iconRow(Icons.badge_outlined, job.technician!.fullName),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'View status',
                  style: AeraTypography.bodySm.copyWith(
                    color: AeraColors.accent,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(width: 4),
                const Icon(
                  Icons.arrow_forward,
                  size: 14,
                  color: AeraColors.accent,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildQuoteRow(BuildContext context, PortalQuote quote) {
    return AeraCard(
      padding: const EdgeInsets.all(14),
      onTap: () => context.push('/quote-approval/${quote.shareToken}'),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: AeraColors.accentSoft,
              borderRadius: AeraRadii.borderSm,
            ),
            child: const Icon(
              Icons.description_outlined,
              color: AeraColors.accent,
              size: 18,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _formatMoney(quote.totalMinor, quote.currency),
                  style: AeraTypography.body.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                Text(
                  'Estimate awaiting your approval',
                  style: AeraTypography.label.copyWith(
                    color: AeraColors.inkSoft,
                  ),
                ),
              ],
            ),
          ),
          const Icon(Icons.chevron_right, color: AeraColors.outline),
        ],
      ),
    );
  }

  Widget _buildInvoiceRow(BuildContext context, PortalInvoice invoice) {
    final (statusType, statusLabel) = _invoiceStatusPresentation(
      invoice.status,
    );
    return AeraCard(
      padding: const EdgeInsets.all(14),
      onTap: () => context.push('/invoice-payment/$token/${invoice.id}'),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Invoice #${invoice.invoiceNumber}',
                  style: AeraTypography.body.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                Text(
                  'Balance ${_formatMoney(invoice.balanceDueMinor, invoice.currency)}',
                  style: AeraTypography.label.copyWith(
                    color: AeraColors.inkSoft,
                  ),
                ),
              ],
            ),
          ),
          AeraStatusChip(label: statusLabel, type: statusType, showDot: true),
        ],
      ),
    );
  }

  Widget _buildHistoryRow(BuildContext context, WidgetRef ref, PortalJob job) {
    return AeraCard(
      padding: const EdgeInsets.all(14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  job.serviceType,
                  style: AeraTypography.body.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                if (job.completedAt != null)
                  Text(
                    'Completed ${DateFormat.yMMMd().format(job.completedAt!)}',
                    style: AeraTypography.label.copyWith(
                      color: AeraColors.inkSoft,
                    ),
                  ),
                if (job.hasReview) ...[
                  const SizedBox(height: 4),
                  Row(
                    children: List.generate(
                      5,
                      (i) => Icon(
                        i < job.reviews.first.rating
                            ? Icons.star
                            : Icons.star_border,
                        size: 14,
                        color: Colors.amber,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (!job.hasReview)
            TextButton(
              onPressed: () => _showReviewDialog(context, ref, job),
              child: Text(
                'Leave a Review',
                style: AeraTypography.bodySm.copyWith(
                  color: AeraColors.accent,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _iconRow(IconData icon, String text) {
    return Padding(
      padding: const EdgeInsets.only(top: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 14, color: AeraColors.accent),
          const SizedBox(width: 6),
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

  Future<void> _showReviewDialog(
    BuildContext context,
    WidgetRef ref,
    PortalJob job,
  ) async {
    int rating = 5;
    final commentController = TextEditingController();
    bool submitting = false;

    await showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (dialogContext, setDialogState) {
            Future<void> submit() async {
              setDialogState(() => submitting = true);
              try {
                await ref
                    .read(portalRepositoryProvider)
                    .submitReview(
                      token,
                      jobId: job.id,
                      rating: rating,
                      comment: commentController.text,
                    );
                ref.invalidate(portalSnapshotProvider(token));
                if (dialogContext.mounted) Navigator.of(dialogContext).pop();
              } on ApiException catch (e) {
                setDialogState(() => submitting = false);
                if (dialogContext.mounted) {
                  ScaffoldMessenger.of(
                    dialogContext,
                  ).showSnackBar(SnackBar(content: Text(e.message)));
                }
              } catch (_) {
                setDialogState(() => submitting = false);
                if (dialogContext.mounted) {
                  ScaffoldMessenger.of(dialogContext).showSnackBar(
                    const SnackBar(
                      content: Text('Could not submit your review'),
                    ),
                  );
                }
              }
            }

            return AlertDialog(
              backgroundColor: AeraColors.surface,
              shape: RoundedRectangleBorder(borderRadius: AeraRadii.borderLg),
              title: Text(
                'Rate your service',
                style: AeraTypography.h3.copyWith(fontWeight: FontWeight.w700),
              ),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    job.serviceType,
                    style: AeraTypography.bodySm.copyWith(
                      color: AeraColors.inkSoft,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(5, (i) {
                      final starValue = i + 1;
                      return IconButton(
                        onPressed: submitting
                            ? null
                            : () => setDialogState(() => rating = starValue),
                        icon: Icon(
                          starValue <= rating ? Icons.star : Icons.star_border,
                          color: Colors.amber,
                          size: 28,
                        ),
                      );
                    }),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: commentController,
                    enabled: !submitting,
                    maxLines: 3,
                    maxLength: 2000,
                    decoration: const InputDecoration(
                      hintText: 'Optional comment',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ],
              ),
              actions: [
                TextButton(
                  onPressed: submitting
                      ? null
                      : () => Navigator.of(dialogContext).pop(),
                  child: const Text('Cancel'),
                ),
                AeraButton(
                  text: submitting ? 'Submitting...' : 'Submit Review',
                  isLoading: submitting,
                  isFullWidth: false,
                  onPressed: submitting ? null : submit,
                ),
              ],
            );
          },
        );
      },
    );
  }
}
