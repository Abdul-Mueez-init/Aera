import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_status_chip.dart';
import 'booking_proposals.dart';
import 'customer_home_screen.dart';
import 'data/portal_repository.dart';
import 'providers/portal_provider.dart';
import 'request_intake.dart';

class PortalWorkspaceHomeScreen extends ConsumerStatefulWidget {
  const PortalWorkspaceHomeScreen({super.key});

  @override
  ConsumerState<PortalWorkspaceHomeScreen> createState() =>
      _PortalWorkspaceHomeScreenState();
}

class _PortalWorkspaceHomeScreenState
    extends ConsumerState<PortalWorkspaceHomeScreen> {
  late Future<_WorkspaceData?> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<_WorkspaceData?> _load() async {
    final repository = ref.read(portalRepositoryProvider);
    final me = await repository.workspace();
    if (me is! PortalSessionActive || me.workspace == null) return null;
    final results = await Future.wait([
      repository.workspaceResource('requests'),
      repository.workspaceResource('quotes'),
      repository.workspaceResource('jobs'),
      repository.workspaceResource('invoices'),
    ]);
    if (results.any((result) => result is! PortalSessionActive)) {
      throw StateError('Could not load workspace');
    }
    return _WorkspaceData(
      me.workspace!,
      (results[0] as PortalSessionActive).workspace!,
      (results[1] as PortalSessionActive).workspace!,
      (results[2] as PortalSessionActive).workspace!,
      (results[3] as PortalSessionActive).workspace!,
    );
  }

  void _retry() => setState(() => _future = _load());

  @override
  Widget build(BuildContext context) => FutureBuilder<_WorkspaceData?>(
    future: _future,
    builder: (context, snapshot) {
      if (snapshot.connectionState == ConnectionState.waiting) {
        return const Scaffold(
          backgroundColor: AeraColors.canvas,
          body: Center(child: CircularProgressIndicator()),
        );
      }
      if (snapshot.hasError) {
        return _ErrorView(onRetry: _retry);
      }
      final workspace = snapshot.data;
      if (workspace == null) return const CustomerHomeScreen();
      return _WorkspaceBody(workspace: workspace);
    },
  );
}

class _WorkspaceBody extends ConsumerWidget {
  const _WorkspaceBody({required this.workspace});
  final _WorkspaceData workspace;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final customer = workspace.me['customer'] as Map<String, dynamic>? ?? {};
    final company = workspace.me['company'] as Map<String, dynamic>? ?? {};
    final name = customer['firstName']?.toString() ?? 'there';
    return DefaultTabController(
      length: 4,
      child: Scaffold(
        backgroundColor: AeraColors.canvas,
        appBar: AppBar(
          title: Text(company['name']?.toString() ?? 'Service workspace'),
          bottom: const TabBar(
            isScrollable: true,
            tabs: [
              Tab(text: 'Requests'),
              Tab(text: 'Quotes'),
              Tab(text: 'Jobs'),
              Tab(text: 'Invoices'),
            ],
          ),
          actions: [
            IconButton(
              tooltip: 'Profile',
              onPressed: () => _showProfile(context, customer),
              icon: const Icon(Icons.person_outline),
            ),
            IconButton(
              tooltip: 'Log out',
              onPressed: () async {
                await ref
                    .read(portalSessionControllerProvider.notifier)
                    .logout();
                if (context.mounted) context.go('/');
              },
              icon: const Icon(Icons.logout),
            ),
          ],
        ),
        body: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
              child: Text('Welcome, $name', style: AeraTypography.h2),
            ),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16),
              child: Text('Everything for your service in one place.'),
            ),
            Expanded(
              child: TabBarView(
                children: [
                  _WorkspaceRequestsList(
                    data: workspace.requests,
                    customer: customer,
                  ),
                  _ResourceList(data: workspace.quotes, title: 'Quotes'),
                  _ResourceList(data: workspace.jobs, title: 'Jobs'),
                  _ResourceList(data: workspace.invoices, title: 'Invoices'),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showProfile(BuildContext context, Map<String, dynamic> customer) {
    showModalBottomSheet<void>(
      context: context,
      builder: (context) => Padding(
        padding: const EdgeInsets.all(24),
        child: ListTile(
          title: Text(
            '${customer['firstName'] ?? ''} ${customer['lastName'] ?? ''}',
            style: AeraTypography.h3,
          ),
          subtitle: Text(customer['email']?.toString() ?? 'No email on file'),
        ),
      ),
    );
  }
}

class _WorkspaceRequestsList extends ConsumerWidget {
  const _WorkspaceRequestsList({required this.data, required this.customer});
  final Map<String, dynamic> data;
  final Map<String, dynamic> customer;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = data['items'] as List<dynamic>? ?? const [];
    final addresses =
        customer['serviceAddresses'] as List<dynamic>? ?? const [];
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Align(
          alignment: Alignment.centerRight,
          child: FilledButton.icon(
            onPressed: () =>
                RequestIntakeSheet.show(context, addresses: addresses),
            icon: const Icon(Icons.add),
            label: const Text('New request'),
          ),
        ),
        const SizedBox(height: 12),
        if (items.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 56),
            child: Center(child: Text('No requests yet')),
          )
        else
          ...items.map((raw) {
            final item = raw as Map<String, dynamic>;
            final status =
                item['status']?.toString().replaceAll('_', ' ') ?? '';
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: AeraCard(
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(item['title']?.toString() ?? 'Service request'),
                  subtitle: Text(status),
                  trailing: AeraStatusChip(
                    label: status,
                    type: AeraStatusType.info,
                  ),
                  onTap: item['id'] == null
                      ? null
                      : () => RequestThreadSheet.show(
                          context,
                          item['id'].toString(),
                        ),
                ),
              ),
            );
          }),
      ],
    );
  }
}

class _ResourceList extends ConsumerWidget {
  const _ResourceList({required this.data, required this.title});
  final Map<String, dynamic> data;
  final String title;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = data['items'] as List<dynamic>? ?? const [];
    if (items.isEmpty) {
      return Center(child: Text('No $title yet'));
    }
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: items.length,
      separatorBuilder: (context, _) => const SizedBox(height: 10),
      itemBuilder: (context, index) {
        final item = items[index] as Map<String, dynamic>;
        final heading =
            item['title'] ??
            item['invoiceNumber'] ??
            item['serviceType'] ??
            '${title.substring(0, title.length - 1)} #${item['requestNumber'] ?? item['jobNumber'] ?? ''}';
        final status = item['status']?.toString().replaceAll('_', ' ') ?? '';
        final isEnRoute = title == 'Jobs' && status == 'EN ROUTE';
        return AeraCard(
          child: Column(
            children: [
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(heading.toString()),
                subtitle: Text(status),
                trailing: status.isEmpty
                    ? null
                    : AeraStatusChip(label: status, type: AeraStatusType.info),
                onTap: () => _showResource(context, ref, item),
              ),
              if (isEnRoute && item['id'] != null)
                _TrackingStatus(jobId: item['id'].toString()),
            ],
          ),
        );
      },
    );
  }

  Future<void> _showResource(
    BuildContext context,
    WidgetRef ref,
    Map<String, dynamic> item,
  ) async {
    if (title == 'Quotes' && item['id'] != null) {
      final result = await ref
          .read(portalRepositoryProvider)
          .workspaceResource('quotes/${item['id']}');
      if (context.mounted && result is PortalSessionActive) {
        final detail = result.workspace;
        if (detail != null) {
          await _showQuote(context, ref, {...item, ...detail});
        }
      }
      return;
    }
    if (title == 'Jobs' && item['id'] != null) {
      final result = await ref
          .read(portalRepositoryProvider)
          .workspaceResource('jobs/${item['id']}');
      if (context.mounted && result is PortalSessionActive) {
        final detail = result.workspace;
        if (detail != null) {
          await _showJob(context, ref, detail);
        }
      }
      return;
    }
    if (title == 'Invoices' && item['id'] != null) {
      final result = await ref
          .read(portalRepositoryProvider)
          .workspaceResource('invoices/${item['id']}');
      if (context.mounted && result is PortalSessionActive) {
        final detail = result.workspace;
        if (detail != null) {
          await _showInvoice(context, ref, detail);
        }
      }
    }
  }

  Future<void> _showJob(
    BuildContext context,
    WidgetRef ref,
    Map<String, dynamic> job,
  ) async {
    final proposals = job['appointmentProposals'] as List<dynamic>? ?? const [];
    final review = job['reviews'] as List<dynamic>? ?? const [];
    final findings = job['findings'] as List<dynamic>? ?? const [];
    final reviewState = job['reviewState']?.toString();
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Service details', style: AeraTypography.h2),
              const SizedBox(height: 8),
              Text(job['problemDescription']?.toString() ?? ''),
              // Phase 6 — completion summary and customer-visible findings
              // recorded by the technician.
              if (job['completionSummary'] != null) ...[
                const SizedBox(height: 12),
                Text(
                  'Completion notes',
                  style: AeraTypography.label.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 4),
                Text(job['completionSummary'].toString()),
              ],
              if (findings.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text(
                  'Findings',
                  style: AeraTypography.label.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 4),
                ...findings.map(
                  (finding) => Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          finding['summary']?.toString() ?? '',
                          style: AeraTypography.bodySm.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        if (finding['recommendedWork'] != null)
                          Text(
                            'Recommended: ${finding['recommendedWork']}',
                            style: AeraTypography.bodySm.copyWith(
                              color: Colors.grey.shade600,
                              fontSize: 12,
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
              ],
              if (reviewState == 'CHANGES_REQUESTED') ...[
                const SizedBox(height: 8),
                Text(
                  'The team is reviewing this job and may follow up with you.',
                  style: AeraTypography.bodySm.copyWith(
                    color: Colors.orange.shade800,
                  ),
                ),
              ],
              if (job['scheduledStart'] != null) ...[
                const SizedBox(height: 12),
                Text('Appointment: ${job['scheduledStart']}'),
                if (job['scheduledEnd'] != null)
                  Text('Until ${job['scheduledEnd']}'),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: () => _requestReschedule(context, ref, job),
                  icon: const Icon(Icons.event_repeat, size: 18),
                  label: const Text('Request different time'),
                ),
              ],
              if (proposals.isNotEmpty) ...[
                const SizedBox(height: 12),
                BookingProposals(
                  proposals: proposals,
                  fallbackRequestId:
                      job['serviceRequestId']?.toString() ??
                      job['id']?.toString(),
                ),
              ],
              const SizedBox(height: 16),
              if (job['status'] == 'COMPLETED' && review.isEmpty)
                FilledButton(
                  onPressed: () async {
                    final result = await _showReviewDialog(
                      context,
                      ref,
                      job['id'].toString(),
                    );
                    if (result == true && context.mounted) {
                      Navigator.pop(context);
                    }
                  },
                  child: const Text('Review service'),
                )
              else if (review.isNotEmpty)
                Text('Review submitted: ${review.first['rating']}/5'),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _requestReschedule(
    BuildContext context,
    WidgetRef ref,
    Map<String, dynamic> job,
  ) async {
    final windows = <({DateTime start, DateTime end})>[];
    var addAnother = true;
    while (windows.length < 3 && addAnother) {
      final picked = await _pickWindow(context, windows.length + 1);
      if (picked == null) break;
      windows.add((start: picked.start, end: picked.end));
      addAnother = picked.addAnother;
    }
    if (windows.isEmpty || !context.mounted) return;
    final result = await ref
        .read(portalRepositoryProvider)
        .requestJobReschedule(job['id'].toString(), windows);
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          result is PortalSessionActive
              ? 'Reschedule request sent'
              : result is PortalFailure
              ? result.message
              : 'Could not send request',
        ),
      ),
    );
  }

  Future<({DateTime start, DateTime end, bool addAnother})?> _pickWindow(
    BuildContext context,
    int index,
  ) async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: now.add(const Duration(days: 1)),
      firstDate: now,
      lastDate: now.add(const Duration(days: 60)),
    );
    if (date == null || !context.mounted) return null;
    final startTime = await showTimePicker(
      context: context,
      initialTime: const TimeOfDay(hour: 9, minute: 0),
    );
    if (startTime == null || !context.mounted) return null;
    final start = DateTime(
      date.year,
      date.month,
      date.day,
      startTime.hour,
      startTime.minute,
    );
    final end = start.add(const Duration(hours: 2));
    // Let the customer add another window or finish.
    if (!context.mounted) return null;
    final addAnother = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text('Window $index'),
        content: Text(
          '${_windowLabel(start)} – ${_windowLabel(end)}\n\nAdd another preferred time?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Done'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Add another'),
          ),
        ],
      ),
    );
    return (start: start, end: end, addAnother: addAnother ?? false);
  }

  String _windowLabel(DateTime value) {
    final hh = value.hour.toString().padLeft(2, '0');
    final mm = value.minute.toString().padLeft(2, '0');
    return '${value.month}/${value.day} $hh:$mm';
  }

  Future<bool?> _showReviewDialog(
    BuildContext context,
    WidgetRef ref,
    String jobId,
  ) async {
    var rating = 5;
    final comment = TextEditingController();
    return showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Review service'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButton<int>(
                value: rating,
                items: [1, 2, 3, 4, 5]
                    .map(
                      (value) => DropdownMenuItem(
                        value: value,
                        child: Text('$value / 5'),
                      ),
                    )
                    .toList(),
                onChanged: (value) => setState(() => rating = value ?? rating),
              ),
              TextField(
                controller: comment,
                maxLines: 3,
                decoration: const InputDecoration(labelText: 'Comment'),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () async {
                final result = await ref
                    .read(portalRepositoryProvider)
                    .submitWorkspaceReview(jobId, rating, comment.text);
                if (context.mounted) {
                  Navigator.pop(context, result is PortalSessionActive);
                }
              },
              child: const Text('Submit'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _showInvoice(
    BuildContext context,
    WidgetRef ref,
    Map<String, dynamic> invoice,
  ) {
    return showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (context) => _InvoiceSheet(invoice: invoice),
    );
  }

  Future<String?> _askQuoteQuestion(BuildContext context) {
    final controller = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Ask a question'),
        content: TextField(
          controller: controller,
          autofocus: true,
          maxLines: 3,
          decoration: const InputDecoration(
            hintText: 'Your question about this quote…',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              final value = controller.text.trim();
              if (value.isEmpty) return;
              Navigator.of(dialogContext).pop(value);
            },
            child: const Text('Send'),
          ),
        ],
      ),
    );
  }

  Future<void> _showQuote(
    BuildContext context,
    WidgetRef ref,
    Map<String, dynamic> item,
  ) async {
    final quoteId = item['id']?.toString();
    if (quoteId == null || quoteId.isEmpty) return;
    final action = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Quote', style: AeraTypography.h2),
              const SizedBox(height: 8),
              Text(
                '${item['currency'] ?? 'USD'} '
                '${((int.tryParse(item['totalMinor']?.toString() ?? '') ?? 0) / 100).toStringAsFixed(2)}',
              ),
              if (item['expiresAt'] != null) ...[
                const SizedBox(height: 6),
                Text('Expires ${item['expiresAt']}'),
              ],
              if ((item['assumptions']?.toString() ?? '').isNotEmpty) ...[
                const SizedBox(height: 14),
                Text('Assumptions', style: AeraTypography.labelUpper),
                const SizedBox(height: 4),
                Text(item['assumptions'].toString()),
              ],
              if ((item['exclusions']?.toString() ?? '').isNotEmpty) ...[
                const SizedBox(height: 14),
                Text('Exclusions', style: AeraTypography.labelUpper),
                const SizedBox(height: 4),
                Text(item['exclusions'].toString()),
              ],
              if ((item['items'] as List<dynamic>?)?.isNotEmpty ?? false) ...[
                const SizedBox(height: 14),
                Text('Line items', style: AeraTypography.labelUpper),
                const SizedBox(height: 4),
                ...((item['items'] as List<dynamic>).map(
                  (raw) => Text(
                    '${(raw as Map<String, dynamic>)['description'] ?? 'Item'}'
                    ' x${raw['quantity'] ?? 0}',
                  ),
                )),
              ],
              const SizedBox(height: 18),
              FilledButton.icon(
                onPressed: () async {
                  final confirmed = await showDialog<bool>(
                    context: context,
                    builder: (context) => AlertDialog(
                      title: const Text('Accept quote?'),
                      content: const Text(
                        'Accepting this quote authorizes the service to proceed.',
                      ),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(context, false),
                          child: const Text('Cancel'),
                        ),
                        FilledButton(
                          onPressed: () => Navigator.pop(context, true),
                          child: const Text('Accept'),
                        ),
                      ],
                    ),
                  );
                  if (confirmed == true && context.mounted) {
                    Navigator.pop(context, 'APPROVED');
                  }
                },
                icon: const Icon(Icons.check),
                label: const Text('Accept quote'),
              ),
              OutlinedButton.icon(
                onPressed: () async {
                  final confirmed = await showDialog<bool>(
                    context: context,
                    builder: (context) => AlertDialog(
                      title: const Text('Decline quote?'),
                      content: const Text(
                        'You can ask the service provider for a revised quote.',
                      ),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(context, false),
                          child: const Text('Cancel'),
                        ),
                        FilledButton(
                          onPressed: () => Navigator.pop(context, true),
                          child: const Text('Decline'),
                        ),
                      ],
                    ),
                  );
                  if (confirmed == true && context.mounted) {
                    Navigator.pop(context, 'DECLINED');
                  }
                },
                icon: const Icon(Icons.close),
                label: const Text('Decline quote'),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: () async {
                  final question = await _askQuoteQuestion(context);
                  if (question == null ||
                      question.isEmpty ||
                      !context.mounted) {
                    return;
                  }
                  final result = await ref
                      .read(portalRepositoryProvider)
                      .askQuoteQuestion(quoteId, question);
                  if (!context.mounted) return;
                  if (result is PortalSessionActive) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Question sent')),
                    );
                  } else if (result is PortalFailure) {
                    ScaffoldMessenger.of(
                      context,
                    ).showSnackBar(SnackBar(content: Text(result.message)));
                  }
                },
                icon: const Icon(Icons.help_outline),
                label: const Text('Ask a question'),
              ),
            ],
          ),
        ),
      ),
    );
    if (action == null || !context.mounted) return;
    final result = await ref
        .read(portalRepositoryProvider)
        .respondToQuote(quoteId, action);
    if (!context.mounted) return;
    if (result is PortalSessionActive) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            action == 'APPROVED' ? 'Quote accepted' : 'Quote declined',
          ),
        ),
      );
    } else if (result is PortalFailure) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(result.message)));
    }
  }
}

class _TrackingStatus extends ConsumerStatefulWidget {
  const _TrackingStatus({required this.jobId});
  final String jobId;

  @override
  ConsumerState<_TrackingStatus> createState() => _TrackingStatusState();
}

class _TrackingStatusState extends ConsumerState<_TrackingStatus> {
  late Future<PortalResult> _future;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _refresh();
    _timer = Timer.periodic(const Duration(seconds: 15), (_) => _refresh());
  }

  void _refresh() {
    final future = ref.read(portalRepositoryProvider).tracking(widget.jobId);
    if (mounted) setState(() => _future = future);
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<PortalResult>(
    future: _future,
    builder: (context, snapshot) {
      final result = snapshot.data;
      if (result is! PortalSessionActive || result.workspace == null) {
        return const Align(
          alignment: Alignment.centerLeft,
          child: Padding(
            padding: EdgeInsets.only(bottom: 8),
            child: Text('Live tracking is temporarily unavailable'),
          ),
        );
      }
      final state = result.workspace!;
      if (state['stale'] == true) {
        return const Align(
          alignment: Alignment.centerLeft,
          child: Padding(
            padding: EdgeInsets.only(bottom: 8),
            child: Text('Technician location is temporarily stale'),
          ),
        );
      }
      final eta = state['etaMinutes'];
      return Align(
        alignment: Alignment.centerLeft,
        child: Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Text(
            eta is num
                ? 'Approximate arrival: $eta min'
                : 'Technician is on the way',
          ),
        ),
      );
    },
  );
}

/// Phase 7.7 — customer invoice sheet: balance, online checkout, payment
/// states, receipts and disputes.
class _InvoiceSheet extends ConsumerStatefulWidget {
  const _InvoiceSheet({required this.invoice});
  final Map<String, dynamic> invoice;

  @override
  ConsumerState<_InvoiceSheet> createState() => _InvoiceSheetState();
}

class _InvoiceSheetState extends ConsumerState<_InvoiceSheet> {
  bool _paying = false;
  bool _disputing = false;
  String? _message;
  String _payKey = '';

  Map<String, dynamic> get invoice => widget.invoice;

  String _money(dynamic minor) =>
      ((int.tryParse(minor?.toString() ?? '') ?? 0) / 100).toStringAsFixed(2);

  bool get _payable {
    final status = invoice['status']?.toString() ?? '';
    final balance =
        int.tryParse(invoice['balanceDueMinor']?.toString() ?? '') ?? 0;
    return balance > 0 &&
        const {'ISSUED', 'PARTIALLY_PAID', 'OVERDUE'}.contains(status);
  }

  String? get _latestSessionStatus {
    final sessions = invoice['paymentSessions'] as List<dynamic>? ?? const [];
    if (sessions.isEmpty) return null;
    return sessions.first['status']?.toString();
  }

  Future<void> _pay() async {
    final id = invoice['id']?.toString();
    if (id == null || _paying) return;
    if (_payKey.isEmpty) {
      _payKey =
          'portal-pay-${DateTime.now().microsecondsSinceEpoch}-${UniqueKey().hashCode}';
    }
    setState(() {
      _paying = true;
      _message = null;
    });
    final result = await ref
        .read(portalRepositoryProvider)
        .workspaceAction('invoices/$id/pay', body: {'idempotencyKey': _payKey});
    if (!mounted) return;
    if (result is PortalSessionActive && result.workspace != null) {
      final url = result.workspace!['checkoutUrl']?.toString();
      if (url != null && url.isNotEmpty) {
        final uri = Uri.tryParse(url);
        if (uri != null) {
          await launchUrl(uri, mode: LaunchMode.externalApplication);
        }
        _payKey = '';
      } else {
        setState(() => _message = 'Could not start checkout.');
      }
    } else {
      setState(
        () => _message = result is PortalFailure
            ? result.message
            : 'Payment failed',
      );
    }
    if (mounted) setState(() => _paying = false);
  }

  Future<void> _showReceipt(Map<String, dynamic> payment) async {
    final id = payment['id']?.toString();
    if (id == null) return;
    final result = await ref
        .read(portalRepositoryProvider)
        .workspaceResource('payments/$id/receipt');
    if (!mounted) return;
    if (result is! PortalSessionActive || result.workspace == null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Could not load receipt')));
      return;
    }
    final receipt = result.workspace!;
    final invoiceRef = receipt['invoice'] as Map<String, dynamic>? ?? const {};
    final company = invoiceRef['company'] as Map<String, dynamic>? ?? const {};
    await showDialog<void>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text('Receipt — ${invoiceRef['invoiceNumber'] ?? ''}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(company['name']?.toString() ?? ''),
            Text(
              'Amount: ${receipt['currency'] ?? ''} ${_money(receipt['amountMinor'])}',
            ),
            Text('Method: ${receipt['method'] ?? ''}'),
            if (receipt['receivedAt'] != null)
              Text('Paid: ${receipt['receivedAt']}'),
            if (receipt['providerPaymentId'] != null)
              Text('Ref: ${receipt['providerPaymentId']}'),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  Future<void> _dispute() async {
    final id = invoice['id']?.toString();
    if (id == null || _disputing) return;
    const reasons = {
      'INCORRECT_AMOUNT': 'Incorrect amount',
      'DUPLICATE_CHARGE': 'Duplicate charge',
      'SERVICE_NOT_RENDERED': 'Service not rendered',
      'GOODS_NOT_RECEIVED': 'Goods not received',
      'OTHER': 'Other',
    };
    String reason = reasons.keys.first;
    final messageController = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) => AlertDialog(
          title: const Text('Dispute this invoice'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                initialValue: reason,
                decoration: const InputDecoration(labelText: 'Reason'),
                items: reasons.entries
                    .map(
                      (e) =>
                          DropdownMenuItem(value: e.key, child: Text(e.value)),
                    )
                    .toList(),
                onChanged: (v) => setDialogState(() => reason = v ?? reason),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: messageController,
                maxLines: 3,
                decoration: const InputDecoration(
                  hintText: 'Tell us what is wrong…',
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: const Text('Submit dispute'),
            ),
          ],
        ),
      ),
    );
    final message = messageController.text.trim();
    messageController.dispose();
    if (confirmed != true || message.isEmpty || !mounted) return;
    setState(() {
      _disputing = true;
      _message = null;
    });
    final result = await ref
        .read(portalRepositoryProvider)
        .workspaceAction(
          'invoices/$id/disputes',
          body: {'reason': reason, 'message': message},
        );
    if (!mounted) return;
    if (result is PortalSessionActive) {
      setState(() {
        _message = 'Dispute submitted — our team will review it.';
        _disputing = false;
      });
    } else {
      setState(() {
        _message = result is PortalFailure
            ? result.message
            : 'Could not submit dispute';
        _disputing = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final currency = invoice['currency']?.toString() ?? '';
    final payments = invoice['payments'] as List<dynamic>? ?? const [];
    final disputes = invoice['disputes'] as List<dynamic>? ?? const [];
    final openDispute = disputes.any(
      (d) => const {
        'OPEN',
        'UNDER_REVIEW',
      }.contains((d as Map)['status']?.toString()),
    );
    final sessionStatus = _latestSessionStatus;

    return Padding(
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        top: 8,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Invoice ${invoice['invoiceNumber'] ?? ''}',
              style: AeraTypography.h2,
            ),
            const SizedBox(height: 8),
            Text('Status: ${invoice['status'] ?? ''}'),
            if (invoice['kind'] == 'DEPOSIT') const Text('Type: Deposit'),
            Text('Total: $currency ${_money(invoice['totalMinor'])}'),
            Text('Balance due: ${_money(invoice['balanceDueMinor'])}'),
            if (invoice['dueAt'] != null) Text('Due ${invoice['dueAt']}'),
            if (sessionStatus == 'OPEN')
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text(
                  'Payment pending — complete checkout to confirm.',
                  style: TextStyle(color: Colors.orange),
                ),
              )
            else if (sessionStatus == 'EXPIRED' || sessionStatus == 'FAILED')
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  sessionStatus == 'EXPIRED'
                      ? 'Checkout expired — start a new payment.'
                      : 'Payment failed — please try again.',
                  style: const TextStyle(color: Colors.red),
                ),
              ),
            if (_message != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(_message!),
              ),
            if (_payable) ...[
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: _paying ? null : _pay,
                icon: _paying
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.payment),
                label: Text(
                  _paying
                      ? 'Starting checkout…'
                      : 'Pay $currency ${_money(invoice['balanceDueMinor'])}',
                ),
              ),
            ],
            if (payments.isNotEmpty) ...[
              const SizedBox(height: 16),
              Text('Payments', style: AeraTypography.h3),
              ...payments.map((raw) {
                final p = raw as Map<String, dynamic>;
                return ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  title: Text(
                    '$currency ${_money(p['amountMinor'])} — ${p['method'] ?? ''}',
                  ),
                  subtitle: Text('${p['receivedAt'] ?? ''}'),
                  trailing: const Icon(Icons.receipt_long),
                  onTap: () => _showReceipt(p),
                );
              }),
            ],
            if (disputes.isNotEmpty) ...[
              const SizedBox(height: 16),
              Text('Disputes', style: AeraTypography.h3),
              ...disputes.map((raw) {
                final d = raw as Map<String, dynamic>;
                return ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  title: Text('${d['reason'] ?? ''} — ${d['status'] ?? ''}'),
                  subtitle: d['resolution'] != null
                      ? Text('Resolved: ${d['resolution']}')
                      : null,
                );
              }),
            ],
            if (!openDispute &&
                invoice['status'] != 'PAID' &&
                invoice['status'] != 'VOID') ...[
              const SizedBox(height: 8),
              TextButton.icon(
                onPressed: _disputing ? null : _dispute,
                icon: const Icon(Icons.flag_outlined),
                label: Text(
                  _disputing ? 'Submitting…' : 'Dispute this invoice',
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _WorkspaceData {
  const _WorkspaceData(
    this.me,
    this.requests,
    this.quotes,
    this.jobs,
    this.invoices,
  );
  final Map<String, dynamic> me;
  final Map<String, dynamic> requests;
  final Map<String, dynamic> quotes;
  final Map<String, dynamic> jobs;
  final Map<String, dynamic> invoices;
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.onRetry});
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: AeraColors.canvas,
    body: Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('Could not load your workspace.'),
          const SizedBox(height: 12),
          FilledButton(onPressed: onRetry, child: const Text('Retry')),
        ],
      ),
    ),
  );
}
