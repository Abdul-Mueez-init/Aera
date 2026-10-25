import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_status_chip.dart';
import 'data/portal_repository.dart';
import 'providers/portal_provider.dart';
import 'widgets/portal_handshake_card.dart';

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

/// The customer portal home (`/p`, handoff 6.3).
///
/// Everything comes from the single session snapshot (`GET /portal/job`):
/// status + schedule + address, the technician, the handshake code while
/// en route, the quote to approve/decline, the invoice (view only) and the
/// review after completion. No history, no other jobs — the session is
/// scoped to this one job. Pull-to-refresh plus light polling while the
/// technician is EN_ROUTE or IN_PROGRESS.
class CustomerHomeScreen extends ConsumerStatefulWidget {
  const CustomerHomeScreen({super.key});

  @override
  ConsumerState<CustomerHomeScreen> createState() => _CustomerHomeScreenState();
}

class _CustomerHomeScreenState extends ConsumerState<CustomerHomeScreen> {
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      // Reached directly (e.g. app relaunch with a stored session) rather
      // than via /open: restore from the existing session if needed.
      ref.read(portalSessionControllerProvider.notifier).ensureBootstrapped();
    });
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  void _syncPolling(String? jobStatus) {
    final shouldPoll = jobStatus == 'EN_ROUTE' || jobStatus == 'IN_PROGRESS';
    if (shouldPoll && _pollTimer == null) {
      _pollTimer = Timer.periodic(const Duration(seconds: 45), (_) {
        ref.read(portalSessionControllerProvider.notifier).refresh();
      });
    } else if (!shouldPoll && _pollTimer != null) {
      _pollTimer?.cancel();
      _pollTimer = null;
    }
  }

  @override
  Widget build(BuildContext context) {
    // If the portal closes while this screen is open (staff deactivated,
    // job finished), move to the closed screen.
    ref.listen<PortalClosed?>(portalClosedProvider, (previous, next) {
      if (next != null && mounted) context.go('/p/closed');
    });

    final portalAsync = ref.watch(portalSessionControllerProvider);
    _syncPolling(portalAsync.valueOrNull?.job.status);

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AeraAppBar(
        showBrand: true,
        subtitle: 'Service Portal',
        title: portalAsync.maybeWhen(
          data: (snapshot) => snapshot.company.name,
          orElse: () => 'My Service',
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
                    error.toString(),
                    textAlign: TextAlign.center,
                    style: AeraTypography.body.copyWith(
                      color: AeraColors.inkSoft,
                    ),
                  ),
                  const SizedBox(height: 12),
                  AeraButton(
                    text: 'Retry',
                    isFullWidth: false,
                    onPressed: () => ref
                        .read(portalSessionControllerProvider.notifier)
                        .bootstrap(),
                  ),
                ],
              ),
            ),
          ),
          data: (snapshot) => RefreshIndicator(
            onRefresh: () =>
                ref.read(portalSessionControllerProvider.notifier).refresh(),
            child: _PortalHomeBody(snapshot: snapshot),
          ),
        ),
      ),
    );
  }
}

class _PortalHomeBody extends ConsumerWidget {
  const _PortalHomeBody({required this.snapshot});

  final PortalSnapshot snapshot;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final job = snapshot.job;
    final pendingQuotes = snapshot.quotes
        .where((q) => q.status == 'SENT')
        .toList();
    final decidedQuotes = snapshot.quotes
        .where((q) => q.status != 'SENT')
        .toList();

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      children: [
        _StatusCard(snapshot: snapshot),
        if (job.handshake != null) ...[
          const SizedBox(height: 16),
          PortalHandshakeCard(handshake: job.handshake!),
        ],
        if (job.technician != null) ...[
          const SizedBox(height: 16),
          _TechnicianCard(technician: job.technician!),
        ],
        for (final quote in pendingQuotes) ...[
          const SizedBox(height: 16),
          _QuoteCard(quote: quote, actionable: true),
        ],
        for (final quote in decidedQuotes) ...[
          const SizedBox(height: 16),
          _QuoteCard(quote: quote, actionable: false),
        ],
        for (final invoice in snapshot.invoices) ...[
          const SizedBox(height: 16),
          _InvoiceCard(invoice: invoice),
        ],
        if (job.status == 'COMPLETED') ...[
          const SizedBox(height: 16),
          _ReviewSection(snapshot: snapshot),
        ],
        const SizedBox(height: 24),
      ],
    );
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({required this.snapshot});

  final PortalSnapshot snapshot;

  @override
  Widget build(BuildContext context) {
    final job = snapshot.job;
    final (statusType, statusLabel) = _jobStatusPresentation(job.status);
    final schedule = _scheduleText(job);
    return AeraCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  job.serviceType.isNotEmpty
                      ? job.serviceType
                      : 'Service visit',
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
          Text(
            'Job #${job.jobNumber} • ${snapshot.company.name}',
            style: AeraTypography.label.copyWith(color: AeraColors.inkSoft),
          ),
          if (job.problemDescription.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(job.problemDescription, style: AeraTypography.body),
          ],
          if (schedule != null) ...[
            const SizedBox(height: 10),
            _iconRow(Icons.event_outlined, schedule),
          ],
          if (job.address != null)
            _iconRow(Icons.location_on_outlined, job.address!.formatted),
          if (job.completedAt != null)
            _iconRow(
              Icons.check_circle_outline,
              'Completed ${DateFormat.yMMMd().format(job.completedAt!)}',
            ),
        ],
      ),
    );
  }

  String? _scheduleText(PortalJob job) {
    final start = job.scheduledStart;
    if (start == null) return null;
    final date = DateFormat('EEE, MMM d • h:mm a').format(start);
    final end = job.scheduledEnd;
    if (end == null) return date;
    return '$date – ${DateFormat('h:mm a').format(end)}';
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
}

class _TechnicianCard extends StatelessWidget {
  const _TechnicianCard({required this.technician});

  final PortalTechnicianRef technician;

  @override
  Widget build(BuildContext context) {
    return AeraCard(
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: const BoxDecoration(
              color: AeraColors.accentSoft,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.badge_outlined,
              color: AeraColors.accent,
              size: 22,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'YOUR TECHNICIAN',
                  style: AeraTypography.labelUpper.copyWith(
                    color: AeraColors.inkSoft,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  technician.fullName,
                  style: AeraTypography.body.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _QuoteCard extends ConsumerStatefulWidget {
  const _QuoteCard({required this.quote, required this.actionable});

  final PortalQuote quote;
  final bool actionable;

  @override
  ConsumerState<_QuoteCard> createState() => _QuoteCardState();
}

class _QuoteCardState extends ConsumerState<_QuoteCard> {
  bool _busy = false;

  Future<void> _respond(String action) async {
    setState(() => _busy = true);
    final result = await ref
        .read(portalSessionControllerProvider.notifier)
        .respondToQuote(widget.quote.id, action);
    if (!mounted) return;
    setState(() => _busy = false);
    final messenger = ScaffoldMessenger.of(context);
    switch (result) {
      case PortalSessionActive():
        messenger.showSnackBar(
          SnackBar(
            content: Text(
              action == 'APPROVED' ? 'Quote approved' : 'Quote declined',
            ),
          ),
        );
      case PortalFailure(:final message):
        messenger.showSnackBar(SnackBar(content: Text(message)));
      case PortalClosed():
      case PortalInvalid():
        break; // the home screen routes to /p/closed via the provider
    }
  }

  @override
  Widget build(BuildContext context) {
    final quote = widget.quote;
    return AeraCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'QUOTE',
                style: AeraTypography.labelUpper.copyWith(
                  color: AeraColors.inkSoft,
                ),
              ),
              AeraStatusChip(
                label: quote.status == 'SENT'
                    ? 'Awaiting your response'
                    : quote.status,
                type: quote.status == 'APPROVED'
                    ? AeraStatusType.completed
                    : quote.status == 'DECLINED'
                    ? AeraStatusType.danger
                    : AeraStatusType.warning,
                showDot: true,
              ),
            ],
          ),
          const SizedBox(height: 10),
          for (final item in quote.items) ...[
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(item.description, style: AeraTypography.bodySm),
                ),
                Text(
                  _formatMoney(item.totalMinor, quote.currency),
                  style: AeraTypography.bodySm.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
          ],
          const Divider(height: 16),
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
                style: AeraTypography.body.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          if (quote.expiresAt != null) ...[
            const SizedBox(height: 6),
            Text(
              'Valid until ${DateFormat.yMMMd().format(quote.expiresAt!)}',
              style: AeraTypography.label.copyWith(color: AeraColors.inkSoft),
            ),
          ],
          if (widget.actionable) ...[
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: AeraButton(
                    text: 'Decline',
                    variant: AeraButtonVariant.outline,
                    isLoading: _busy,
                    onPressed: _busy ? null : () => _respond('DECLINED'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: AeraButton(
                    text: 'Approve',
                    isLoading: _busy,
                    onPressed: _busy ? null : () => _respond('APPROVED'),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _InvoiceCard extends StatelessWidget {
  const _InvoiceCard({required this.invoice});

  final PortalInvoice invoice;

  @override
  Widget build(BuildContext context) {
    final (statusType, statusLabel) = _invoiceStatusPresentation(
      invoice.status,
    );
    return AeraCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'INVOICE #${invoice.invoiceNumber}',
                style: AeraTypography.labelUpper.copyWith(
                  color: AeraColors.inkSoft,
                ),
              ),
              AeraStatusChip(
                label: statusLabel,
                type: statusType,
                showDot: true,
              ),
            ],
          ),
          const SizedBox(height: 10),
          _amountRow('Total', invoice.totalMinor, bold: true),
          _amountRow('Paid', invoice.amountPaidMinor),
          _amountRow('Balance due', invoice.balanceDueMinor, bold: true),
          if (invoice.dueAt != null) ...[
            const SizedBox(height: 6),
            Text(
              'Due ${DateFormat.yMMMd().format(invoice.dueAt!)}',
              style: AeraTypography.label.copyWith(color: AeraColors.inkSoft),
            ),
          ],
        ],
      ),
    );
  }

  Widget _amountRow(String label, int minor, {bool bold = false}) {
    final style = AeraTypography.bodySm.copyWith(
      fontWeight: bold ? FontWeight.w700 : FontWeight.w400,
    );
    return Padding(
      padding: const EdgeInsets.only(top: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: style),
          Text(_formatMoney(minor, invoice.currency), style: style),
        ],
      ),
    );
  }
}

class _ReviewSection extends ConsumerStatefulWidget {
  const _ReviewSection({required this.snapshot});

  final PortalSnapshot snapshot;

  @override
  ConsumerState<_ReviewSection> createState() => _ReviewSectionState();
}

class _ReviewSectionState extends ConsumerState<_ReviewSection> {
  int _rating = 5;
  bool _submitting = false;
  final TextEditingController _commentController = TextEditingController();

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _submitting = true);
    final result = await ref
        .read(portalSessionControllerProvider.notifier)
        .submitReview(_rating, _commentController.text);
    if (!mounted) return;
    setState(() => _submitting = false);
    final messenger = ScaffoldMessenger.of(context);
    switch (result) {
      case PortalSessionActive():
        messenger.showSnackBar(
          const SnackBar(content: Text('Thanks for your review')),
        );
      case PortalFailure(:final message):
        messenger.showSnackBar(SnackBar(content: Text(message)));
        // E.g. REVIEW_ALREADY_SUBMITTED — reload so the stored review shows.
        ref.read(portalSessionControllerProvider.notifier).refresh();
      case PortalClosed():
      case PortalInvalid():
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    final review = widget.snapshot.review;
    if (review != null) {
      return AeraCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'YOUR REVIEW',
              style: AeraTypography.labelUpper.copyWith(
                color: AeraColors.inkSoft,
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: List.generate(
                5,
                (i) => Icon(
                  i < review.rating ? Icons.star : Icons.star_border,
                  size: 20,
                  color: Colors.amber,
                ),
              ),
            ),
            if (review.comment != null && review.comment!.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(review.comment!, style: AeraTypography.body),
            ],
          ],
        ),
      );
    }

    return AeraCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'HOW WAS YOUR SERVICE?',
            style: AeraTypography.labelUpper.copyWith(
              color: AeraColors.inkSoft,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(5, (i) {
              final starValue = i + 1;
              return IconButton(
                onPressed: _submitting
                    ? null
                    : () => setState(() => _rating = starValue),
                icon: Icon(
                  starValue <= _rating ? Icons.star : Icons.star_border,
                  color: Colors.amber,
                  size: 30,
                ),
              );
            }),
          ),
          TextField(
            controller: _commentController,
            enabled: !_submitting,
            maxLines: 3,
            maxLength: 2000,
            decoration: const InputDecoration(
              hintText: 'Optional comment',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          AeraButton(
            text: _submitting ? 'Submitting...' : 'Submit Review',
            isLoading: _submitting,
            onPressed: _submitting ? null : _submit,
          ),
        ],
      ),
    );
  }
}
