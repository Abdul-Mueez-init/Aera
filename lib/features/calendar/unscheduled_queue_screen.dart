import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import 'data/booking_repository.dart';

final unscheduledQueueProvider =
    FutureProvider.autoDispose<List<UnscheduledJob>>(
      (ref) => ref.watch(bookingRepositoryProvider).listQueue(),
    );

/// Phase 5.6 — dispatcher unscheduled queue. Lists NEW/QUOTING jobs with
/// no scheduledStart and lets the dispatcher propose appointment windows
/// to the customer.
class UnscheduledQueueScreen extends ConsumerWidget {
  const UnscheduledQueueScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final queue = ref.watch(unscheduledQueueProvider);
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: const AeraAppBar(
        title: 'Unscheduled queue',
        subtitle: 'Jobs awaiting a booking',
        showBrand: true,
      ),
      body: queue.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: Text(
            'Could not load the queue',
            style: AeraTypography.bodySm.copyWith(color: AeraColors.danger),
          ),
        ),
        data: (jobs) => jobs.isEmpty
            ? Center(
                child: Text(
                  'Nothing waiting to be scheduled',
                  style: AeraTypography.bodySm,
                ),
              )
            : RefreshIndicator(
                onRefresh: () async => ref.invalidate(unscheduledQueueProvider),
                child: ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: jobs.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    final job = jobs[index];
                    return Card(
                      child: ListTile(
                        title: Text(
                          '#${job.jobNumber} · ${job.serviceType}',
                          style: AeraTypography.bodyMedium.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        subtitle: Text(
                          [
                            job.customerName,
                            job.status,
                            if (job.priority != null)
                              'Priority: ${job.priority}',
                          ].whereType<String>().join(' · '),
                        ),
                        trailing: FilledButton.tonal(
                          onPressed: () => _proposeWindows(context, ref, job),
                          child: const Text('Propose windows'),
                        ),
                      ),
                    );
                  },
                ),
              ),
      ),
    );
  }

  Future<void> _proposeWindows(
    BuildContext context,
    WidgetRef ref,
    UnscheduledJob job,
  ) async {
    final now = DateTime.now();
    final windows = await ref
        .read(bookingRepositoryProvider)
        .getAvailability(
          startsAt: now,
          endsAt: now.add(const Duration(days: 14)),
          durationMinutes: 60,
        );
    if (!context.mounted) return;
    if (windows.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No available windows in the next 14 days'),
        ),
      );
      return;
    }
    final selected = <int>{};
    final expiryDays = ValueNotifier<int>(3);
    final sent = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: Text('Propose windows — #${job.jobNumber}'),
          content: SizedBox(
            width: double.maxFinite,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Pick up to 3 windows (capacity ${windows.first.capacity}+)',
                    style: AeraTypography.bodySm,
                  ),
                  const SizedBox(height: 8),
                  for (var i = 0; i < windows.length && i < 20; i++)
                    CheckboxListTile(
                      dense: true,
                      value: selected.contains(i),
                      onChanged: (checked) => setState(() {
                        if (checked == true) {
                          if (selected.length < 3) selected.add(i);
                        } else {
                          selected.remove(i);
                        }
                      }),
                      title: Text(_fmt(windows[i])),
                      subtitle: Text('capacity: ${windows[i].capacity}'),
                    ),
                  const SizedBox(height: 8),
                  ValueListenableBuilder<int>(
                    valueListenable: expiryDays,
                    builder: (context, days, _) => DropdownButtonFormField<int>(
                      initialValue: days,
                      decoration: const InputDecoration(
                        labelText: 'Expires in',
                      ),
                      items: [1, 3, 7]
                          .map(
                            (d) => DropdownMenuItem(
                              value: d,
                              child: Text('$d days'),
                            ),
                          )
                          .toList(),
                      onChanged: (value) => expiryDays.value = value ?? 3,
                    ),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: selected.isEmpty
                  ? null
                  : () => Navigator.pop(dialogContext, true),
              child: const Text('Send proposal'),
            ),
          ],
        ),
      ),
    );
    if (sent != true || !context.mounted) return;
    try {
      await ref
          .read(bookingRepositoryProvider)
          .createProposal(
            jobId: job.id,
            windows: selected.map((i) => windows[i]).toList(),
            expiresAt: DateTime.now().add(Duration(days: expiryDays.value)),
          );
      ref.invalidate(unscheduledQueueProvider);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Proposal sent to customer')),
        );
      }
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not send proposal')),
        );
      }
    }
  }

  String _fmt(AvailabilityWindow window) {
    String two(int v) => v.toString().padLeft(2, '0');
    final start = window.startsAt.toLocal();
    final end = window.endsAt.toLocal();
    return '${start.month}/${start.day} ${two(start.hour)}:${two(start.minute)}'
        ' – ${two(end.hour)}:${two(end.minute)}';
  }
}
