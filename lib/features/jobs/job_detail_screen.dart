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
import '../../core/widgets/aera_status_chip.dart';
import 'data/jobs_repository.dart';
import 'providers/jobs_provider.dart';

AeraStatusType _jobStatusType(String status) {
  switch (status) {
    case 'COMPLETED':
      return AeraStatusType.completed;
    case 'CANCELLED':
      return AeraStatusType.danger;
    case 'IN_PROGRESS':
    case 'EN_ROUTE':
      return AeraStatusType.inProgress;
    case 'WAITING_PARTS':
      return AeraStatusType.warning;
    case 'SCHEDULED':
      return AeraStatusType.scheduled;
    case 'QUOTING':
      return AeraStatusType.info;
    case 'NEW':
    default:
      return AeraStatusType.neutral;
  }
}

(Color, Color) _priorityColors(String priority) {
  switch (priority) {
    case 'URGENT':
    case 'HIGH':
      return (AeraColors.warning, AeraColors.warningSoft);
    case 'LOW':
      return (AeraColors.inkSoft, AeraColors.surfaceSubtle);
    case 'NORMAL':
    default:
      return (AeraColors.accent, AeraColors.accentSoft);
  }
}

class JobDetailScreen extends ConsumerStatefulWidget {
  const JobDetailScreen({super.key, required this.jobId});

  final String jobId;

  @override
  ConsumerState<JobDetailScreen> createState() => _JobDetailScreenState();
}

class _JobDetailScreenState extends ConsumerState<JobDetailScreen> {
  bool _updating = false;

  Future<void> _transition(String status) async {
    setState(() => _updating = true);
    try {
      await ref
          .read(jobsRepositoryProvider)
          .transitionStatus(widget.jobId, status);
      ref.invalidate(jobDetailProvider(widget.jobId));
      ref.invalidate(jobsListProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Job status updated to ${status.replaceAll('_', ' ')}',
            ),
          ),
        );
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
          const SnackBar(content: Text('Could not update job status')),
        );
      }
    } finally {
      if (mounted) setState(() => _updating = false);
    }
  }

  Future<void> _completeJob() async {
    final summaryController = TextEditingController();
    final summary = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AeraColors.surface,
        shape: RoundedRectangleBorder(borderRadius: AeraRadii.borderLg),
        title: Text(
          'Complete Job',
          style: AeraTypography.h3.copyWith(fontSize: 17),
        ),
        content: TextField(
          controller: summaryController,
          maxLines: 3,
          decoration: const InputDecoration(
            hintText: 'What was done? (required)',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: Text(
              'Cancel',
              style: AeraTypography.bodyMedium.copyWith(
                color: AeraColors.inkSoft,
              ),
            ),
          ),
          TextButton(
            onPressed: () {
              final text = summaryController.text.trim();
              if (text.isEmpty) return;
              Navigator.of(dialogContext).pop(text);
            },
            child: Text(
              'Complete',
              style: AeraTypography.bodyMedium.copyWith(
                color: AeraColors.accent,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );

    if (summary == null || summary.isEmpty) return;

    setState(() => _updating = true);
    try {
      await ref.read(jobsRepositoryProvider).completeJob(widget.jobId, summary);
      ref.invalidate(jobDetailProvider(widget.jobId));
      ref.invalidate(jobsListProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Job marked as completed')),
        );
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(e.message)));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Could not complete job')));
      }
    } finally {
      if (mounted) setState(() => _updating = false);
    }
  }

  void _scheduleThis(Job job) {
    context.push('/schedule-job/${job.id}');
  }

  @override
  Widget build(BuildContext context) {
    final jobAsync = ref.watch(jobDetailProvider(widget.jobId));

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AeraAppBar(
        title: 'Job Details',
        subtitle: jobAsync.maybeWhen(
          data: (job) => '#${job.jobNumber}',
          orElse: () => '#${widget.jobId}',
        ),
        actions: [
          if (jobAsync.hasValue && jobAsync.value!.customer.phone != null)
            IconButton(
              icon: const Icon(Icons.phone_outlined, color: AeraColors.accent),
              onPressed: () {},
            ),
        ],
      ),
      body: SafeArea(
        child: jobAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  error is ApiException ? error.message : 'Could not load job',
                ),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: () =>
                      ref.invalidate(jobDetailProvider(widget.jobId)),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
          data: (job) {
            final (priorityColor, prioritySoft) = _priorityColors(job.priority);

            return ListView(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              children: [
                // Header Card
                AeraCard(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Row(
                            children: [
                              Text(
                                '#${job.jobNumber}',
                                style: AeraTypography.h3.copyWith(fontSize: 18),
                              ),
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 2,
                                ),
                                decoration: BoxDecoration(
                                  color: AeraColors.surfaceSubtle,
                                  borderRadius: AeraRadii.borderFull,
                                ),
                                child: Text(
                                  job.serviceType,
                                  style: AeraTypography.label.copyWith(
                                    fontSize: 10,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 3,
                            ),
                            decoration: BoxDecoration(
                              color: prioritySoft,
                              borderRadius: AeraRadii.borderFull,
                            ),
                            child: Text(
                              'Priority ${job.priority.toLowerCase()}',
                              style: AeraTypography.label.copyWith(
                                color: priorityColor,
                                fontWeight: FontWeight.w700,
                                fontSize: 10,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      AeraStatusChip(
                        label: job.status.replaceAll('_', ' '),
                        type: _jobStatusType(job.status),
                        showDot: true,
                      ),
                      if (job.scheduledStart != null) ...[
                        const SizedBox(height: 6),
                        Text(
                          DateFormat(
                            'EEE, MMM d · h:mm a',
                          ).format(job.scheduledStart!),
                          style: AeraTypography.bodySm,
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 14),

                // Customer & Site Block
                AeraCard(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          CircleAvatar(
                            radius: 20,
                            backgroundColor: AeraColors.secondaryFixed,
                            child: Text(
                              job.customer.fullName.isNotEmpty
                                  ? job.customer.fullName[0].toUpperCase()
                                  : '?',
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                                color: AeraColors.accentDeep,
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  job.customer.fullName,
                                  style: AeraTypography.h3.copyWith(
                                    fontSize: 15,
                                  ),
                                ),
                                if (job.customer.phone != null)
                                  Text(
                                    job.customer.phone!,
                                    style: AeraTypography.bodySm.copyWith(
                                      fontSize: 11,
                                    ),
                                  ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      const Divider(color: AeraColors.line),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          const Icon(
                            Icons.location_on_outlined,
                            size: 18,
                            color: AeraColors.accent,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              job.serviceAddress.formatted,
                              style: AeraTypography.bodySm.copyWith(
                                fontSize: 12,
                              ),
                            ),
                          ),
                          TextButton(
                            onPressed: () =>
                                context.push('/technician-tracking'),
                            child: Text(
                              'Directions',
                              style: AeraTypography.label.copyWith(
                                fontSize: 11,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          const Icon(
                            Icons.engineering_outlined,
                            size: 18,
                            color: AeraColors.accent,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            job.assignedTechnician?.fullName ??
                                'No technician assigned',
                            style: AeraTypography.bodySm.copyWith(fontSize: 12),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),

                // Problem description
                AeraCard(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Reported Issue & Brief',
                        style: AeraTypography.h3.copyWith(fontSize: 15),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        job.problemDescription,
                        style: AeraTypography.bodySm.copyWith(
                          color: AeraColors.inkSoft,
                          height: 1.4,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),

                // Notes
                AeraCard(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Field Notes (${job.notes.length})',
                        style: AeraTypography.h3.copyWith(fontSize: 15),
                      ),
                      const SizedBox(height: 8),
                      if (job.notes.isEmpty)
                        Text('No notes yet', style: AeraTypography.bodySm)
                      else
                        ...job.notes
                            .take(3)
                            .map(
                              (note) => Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: Container(
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: AeraColors.surfaceContainerLow,
                                    borderRadius: AeraRadii.borderMd,
                                  ),
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        note.body,
                                        style: AeraTypography.bodySm.copyWith(
                                          fontSize: 12,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        '${note.authorName ?? 'Team'} · ${DateFormat('MMM d, h:mm a').format(note.createdAt)}',
                                        style: AeraTypography.label.copyWith(
                                          fontSize: 10,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),

                // Recent activity
                if (job.statusHistory.isNotEmpty)
                  AeraCard(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Recent Activity',
                          style: AeraTypography.h3.copyWith(fontSize: 15),
                        ),
                        const SizedBox(height: 8),
                        ...job.statusHistory
                            .take(4)
                            .map(
                              (entry) => Padding(
                                padding: const EdgeInsets.only(bottom: 6),
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Icon(
                                      Icons.circle,
                                      size: 6,
                                      color: AeraColors.accent,
                                    ),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: Text(
                                        '${entry.fromStatus != null ? '${entry.fromStatus!.replaceAll('_', ' ')} → ' : ''}'
                                        '${entry.toStatus.replaceAll('_', ' ')} · ${entry.actorName ?? 'System'}',
                                        style: AeraTypography.bodySm.copyWith(
                                          fontSize: 11,
                                        ),
                                      ),
                                    ),
                                    Text(
                                      DateFormat(
                                        'MMM d',
                                      ).format(entry.createdAt),
                                      style: AeraTypography.label.copyWith(
                                        fontSize: 10,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                      ],
                    ),
                  ),
                const SizedBox(height: 20),

                // Primary dispatch action, driven by the backend state machine
                if (job.status == 'NEW' || job.status == 'QUOTING')
                  AeraButton(
                    text: 'Schedule This Job',
                    icon: const Icon(
                      Icons.calendar_today,
                      size: 18,
                      color: Colors.white,
                    ),
                    isLoading: _updating,
                    onPressed: _updating ? null : () => _scheduleThis(job),
                  )
                else if (job.status == 'SCHEDULED')
                  AeraButton(
                    text: 'Mark En Route',
                    icon: const Icon(
                      Icons.navigation,
                      size: 18,
                      color: Colors.white,
                    ),
                    isLoading: _updating,
                    onPressed: _updating ? null : () => _transition('EN_ROUTE'),
                  )
                else if (job.status == 'EN_ROUTE')
                  AeraButton(
                    text: 'Arrived On Site',
                    icon: const Icon(
                      Icons.check,
                      size: 18,
                      color: Colors.white,
                    ),
                    isLoading: _updating,
                    onPressed: _updating
                        ? null
                        : () => _transition('IN_PROGRESS'),
                  )
                else if (job.status == 'IN_PROGRESS' ||
                    job.status == 'WAITING_PARTS')
                  AeraButton(
                    text: 'Complete Job',
                    icon: const Icon(
                      Icons.check_circle,
                      size: 18,
                      color: Colors.white,
                    ),
                    isLoading: _updating,
                    onPressed: _updating ? null : _completeJob,
                  )
                else if (job.status == 'COMPLETED')
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: AeraColors.successSoft,
                      borderRadius: AeraRadii.borderMd,
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.check_circle,
                          color: AeraColors.success,
                          size: 18,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            job.completionSummary ?? 'Job completed',
                            style: AeraTypography.bodySm.copyWith(
                              color: AeraColors.success,
                            ),
                          ),
                        ),
                      ],
                    ),
                  )
                else if (job.status == 'CANCELLED')
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: AeraColors.dangerSoft,
                      borderRadius: AeraRadii.borderMd,
                    ),
                    child: Text(
                      'This job was cancelled',
                      style: AeraTypography.bodySm.copyWith(
                        color: AeraColors.danger,
                      ),
                    ),
                  ),

                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: AeraButton(
                        text: 'Create Quote',
                        variant: AeraButtonVariant.secondary,
                        onPressed: () => context.push('/create-quote'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: AeraButton(
                        text: 'Create Invoice',
                        variant: AeraButtonVariant.outline,
                        onPressed: () => context.push('/create-invoice'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
              ],
            );
          },
        ),
      ),
    );
  }
}
