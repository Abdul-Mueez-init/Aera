import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_status_chip.dart';
import 'customer_home_screen.dart';
import 'data/portal_repository.dart';
import 'providers/portal_provider.dart';

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
            onPressed: addresses.isEmpty
                ? null
                : () => _showCreateRequest(context, ref, addresses),
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
                ),
              ),
            );
          }),
      ],
    );
  }

  Future<void> _showCreateRequest(
    BuildContext context,
    WidgetRef ref,
    List<dynamic> addresses,
  ) async {
    final titleController = TextEditingController();
    final descriptionController = TextEditingController();
    final categoryController = TextEditingController();
    var addressId =
        (addresses.first as Map<String, dynamic>)['id']?.toString() ?? '';
    final created = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('New service request'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: titleController,
                  decoration: const InputDecoration(
                    labelText: 'What do you need?',
                  ),
                ),
                TextField(
                  controller: descriptionController,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    labelText: 'Describe the issue',
                  ),
                ),
                TextField(
                  controller: categoryController,
                  decoration: const InputDecoration(
                    labelText: 'Service category',
                  ),
                ),
                DropdownButtonFormField<String>(
                  initialValue: addressId,
                  decoration: const InputDecoration(
                    labelText: 'Service address',
                  ),
                  items: addresses.map((raw) {
                    final address = raw as Map<String, dynamic>;
                    return DropdownMenuItem(
                      value: address['id']?.toString(),
                      child: Text(
                        address['label']?.toString() ??
                            address['line1']?.toString() ??
                            'Address',
                      ),
                    );
                  }).toList(),
                  onChanged: (value) =>
                      setState(() => addressId = value ?? addressId),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () async {
                if (titleController.text.trim().isEmpty ||
                    descriptionController.text.trim().isEmpty ||
                    categoryController.text.trim().isEmpty) {
                  return;
                }
                final result = await ref
                    .read(portalRepositoryProvider)
                    .createWorkspaceRequest(
                      submissionKey:
                          '${DateTime.now().microsecondsSinceEpoch}-${titleController.text.hashCode}',
                      serviceAddressId: addressId,
                      title: titleController.text,
                      description: descriptionController.text,
                      serviceCategory: categoryController.text,
                    );
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
    if (created == true && context.mounted) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Request submitted')));
    }
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
          await _showInvoice(context, detail);
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
              if (job['scheduledStart'] != null) ...[
                const SizedBox(height: 12),
                Text('Appointment: ${job['scheduledStart']}'),
                if (job['scheduledEnd'] != null)
                  Text('Until ${job['scheduledEnd']}'),
              ],
              if (proposals.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text('Appointment options', style: AeraTypography.labelUpper),
                ...proposals.map(
                  (raw) => Text(
                    '${(raw as Map<String, dynamic>)['status']} · '
                    '${raw['windows']}',
                  ),
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
    Map<String, dynamic> invoice,
  ) {
    return showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) => Padding(
        padding: const EdgeInsets.all(24),
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
            Text(
              'Total: ${invoice['currency'] ?? ''} ${_money(invoice['totalMinor'])}',
            ),
            Text('Balance due: ${_money(invoice['balanceDueMinor'])}'),
            if (invoice['dueAt'] != null) Text('Due ${invoice['dueAt']}'),
          ],
        ),
      ),
    );
  }

  String _money(dynamic minor) =>
      ((int.tryParse(minor?.toString() ?? '') ?? 0) / 100).toStringAsFixed(2);

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
