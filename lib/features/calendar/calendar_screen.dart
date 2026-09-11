import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/network/api_response.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_status_chip.dart';
import 'data/calendar_repository.dart';
import 'providers/calendar_provider.dart';

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

bool _isSameDay(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;

DateTime _startOfWeek(DateTime date) =>
    date.subtract(Duration(days: date.weekday - 1));

class CalendarScreen extends ConsumerStatefulWidget {
  const CalendarScreen({super.key});

  @override
  ConsumerState<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends ConsumerState<CalendarScreen> {
  String _selectedView = 'Timeline';

  @override
  Widget build(BuildContext context) {
    final selectedDate = ref.watch(selectedScheduleDateProvider);
    final scheduleAsync = ref.watch(dayScheduleProvider);
    final weekStart = _startOfWeek(selectedDate);
    final weekDays = List.generate(7, (i) => weekStart.add(Duration(days: i)));

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AppBar(
        backgroundColor: AeraColors.surface.withOpacity(0.85),
        elevation: 0,
        scrolledUnderElevation: 1,
        title: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: AeraColors.accent,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.ac_unit, color: Colors.white, size: 18),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'AERA HVAC',
                  style: AeraTypography.labelUpper.copyWith(fontSize: 9),
                ),
                Text(
                  'Schedule',
                  style: AeraTypography.h3.copyWith(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(
              Icons.notifications_outlined,
              color: AeraColors.ink,
              size: 22,
            ),
            onPressed: () => context.push('/notifications'),
          ),
          IconButton(
            icon: CircleAvatar(
              radius: 14,
              backgroundColor: AeraColors.primary,
              child: const Icon(Icons.person, color: Colors.white, size: 16),
            ),
            onPressed: () => context.push('/profile-settings'),
          ),
          const SizedBox(width: 8),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AeraColors.accent,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add, size: 20),
        label: Text(
          'New Job',
          style: AeraTypography.bodyMedium.copyWith(
            color: Colors.white,
            fontWeight: FontWeight.w700,
          ),
        ),
        // '/schedule-job' now requires a :jobId (it schedules an
        // existing job) — dispatch always starts from creating the
        // job first, same flow as the Jobs tab's FAB.
        onPressed: () => context.push('/create-job'),
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(dayScheduleProvider);
            ref.invalidate(workloadProvider);
            await ref.read(dayScheduleProvider.future);
          },
          child: ListView(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            children: [
              // Week Navigator & View Switcher
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      IconButton(
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                        icon: const Icon(
                          Icons.chevron_left,
                          color: AeraColors.inkSoft,
                        ),
                        onPressed: () {
                          ref
                              .read(selectedScheduleDateProvider.notifier)
                              .state = selectedDate.subtract(
                            const Duration(days: 7),
                          );
                        },
                      ),
                      const SizedBox(width: 4),
                      Text(
                        DateFormat('MMMM yyyy').format(selectedDate),
                        style: AeraTypography.h3.copyWith(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(width: 4),
                      IconButton(
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                        icon: const Icon(
                          Icons.chevron_right,
                          color: AeraColors.inkSoft,
                        ),
                        onPressed: () {
                          ref
                              .read(selectedScheduleDateProvider.notifier)
                              .state = selectedDate.add(
                            const Duration(days: 7),
                          );
                        },
                      ),
                    ],
                  ),
                  Container(
                    padding: const EdgeInsets.all(2),
                    decoration: BoxDecoration(
                      color: AeraColors.surfaceSubtle,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      children: [
                        _viewToggleOption('Lanes'),
                        _viewToggleOption('Timeline'),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),

              // Day Scroller Bar
              Row(
                children: weekDays.map((day) {
                  final isSelected = _isSameDay(day, selectedDate);
                  final isToday = _isSameDay(day, DateTime.now());
                  return Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 2),
                      child: InkWell(
                        onTap: () {
                          ref
                                  .read(selectedScheduleDateProvider.notifier)
                                  .state =
                              day;
                        },
                        borderRadius: AeraRadii.borderMd,
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          decoration: BoxDecoration(
                            color: isSelected
                                ? AeraColors.accent
                                : AeraColors.surface,
                            borderRadius: AeraRadii.borderMd,
                            border: Border.all(
                              color: isSelected
                                  ? Colors.transparent
                                  : AeraColors.line,
                            ),
                          ),
                          child: Column(
                            children: [
                              Text(
                                DateFormat('EEE').format(day).toUpperCase(),
                                style: AeraTypography.label.copyWith(
                                  fontSize: 10,
                                  color: isSelected
                                      ? Colors.white70
                                      : AeraColors.inkSoft,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                '${day.day}',
                                style: AeraTypography.bodyMedium.copyWith(
                                  fontWeight: FontWeight.w700,
                                  color: isSelected
                                      ? Colors.white
                                      : AeraColors.ink,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Container(
                                width: 4,
                                height: 4,
                                decoration: BoxDecoration(
                                  color: isToday
                                      ? (isSelected
                                            ? AeraColors.successSoft
                                            : AeraColors.accent)
                                      : Colors.transparent,
                                  shape: BoxShape.circle,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
              const SizedBox(height: 16),

              scheduleAsync.when(
                loading: () => const Padding(
                  padding: EdgeInsets.symmetric(vertical: 48),
                  child: Center(child: CircularProgressIndicator()),
                ),
                error: (error, _) => _ErrorBlock(
                  message: error is ApiException
                      ? error.message
                      : 'Could not load the schedule',
                  onRetry: () => ref.invalidate(dayScheduleProvider),
                ),
                data: (day) {
                  final unassignedCount = day.jobs
                      .where((j) => j.assignedTechnician == null)
                      .length;
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Real day summary (replaces the old fabricated
                      // "Intelligent Travel Buffers" AI copy — no
                      // routing/ETA data exists in the backend).
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AeraColors.surfaceSubtle,
                          borderRadius: AeraRadii.borderMd,
                        ),
                        child: Row(
                          children: [
                            const Icon(
                              Icons.event_note_outlined,
                              color: AeraColors.accent,
                              size: 18,
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    '${day.jobs.length} job${day.jobs.length == 1 ? '' : 's'} scheduled',
                                    style: AeraTypography.label.copyWith(
                                      fontWeight: FontWeight.w700,
                                      color: AeraColors.ink,
                                    ),
                                  ),
                                  if (unassignedCount > 0)
                                    Text(
                                      '$unassignedCount unassigned',
                                      style: AeraTypography.bodySm.copyWith(
                                        fontSize: 11,
                                        color: AeraColors.warning,
                                      ),
                                    )
                                  else
                                    Text(
                                      'All jobs have a technician',
                                      style: AeraTypography.bodySm.copyWith(
                                        fontSize: 11,
                                        color: AeraColors.inkSoft,
                                      ),
                                    ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),

                      if (day.jobs.isEmpty)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 32),
                          child: Center(
                            child: Column(
                              children: [
                                const Icon(
                                  Icons.event_available,
                                  size: 44,
                                  color: AeraColors.outline,
                                ),
                                const SizedBox(height: 10),
                                Text(
                                  'Nothing scheduled for this day',
                                  style: AeraTypography.bodyMedium,
                                ),
                              ],
                            ),
                          ),
                        )
                      else if (_selectedView == 'Timeline')
                        _TimelineView(jobs: day.jobs)
                      else
                        _LanesView(jobs: day.jobs),

                      const SizedBox(height: 60),
                    ],
                  );
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _viewToggleOption(String label) {
    final isSelected = _selectedView == label;
    return InkWell(
      onTap: () => setState(() => _selectedView = label),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: isSelected ? AeraColors.surface : Colors.transparent,
          borderRadius: BorderRadius.circular(6),
          boxShadow: isSelected
              ? const [BoxShadow(color: Colors.black12, blurRadius: 2)]
              : null,
        ),
        child: Text(
          label,
          style: AeraTypography.label.copyWith(
            fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
            color: isSelected ? AeraColors.ink : AeraColors.inkSoft,
          ),
        ),
      ),
    );
  }
}

/// Groups the day's jobs by scheduled hour. Jobs already arrive sorted
/// by `scheduledStart` from the backend, so a plain (insertion-ordered)
/// map is enough — no re-sort needed.
class _TimelineView extends StatelessWidget {
  const _TimelineView({required this.jobs});

  final List<ScheduledJob> jobs;

  @override
  Widget build(BuildContext context) {
    final buckets = <String, List<ScheduledJob>>{};
    for (final job in jobs) {
      final start = job.scheduledStart?.toLocal();
      final key = start != null
          ? DateFormat('HH:00').format(start)
          : 'Time TBD';
      buckets.putIfAbsent(key, () => []).add(job);
    }

    return Column(
      children: buckets.entries
          .map((entry) => _timelineSlot(entry.key, entry.value))
          .toList(),
    );
  }

  Widget _timelineSlot(String hour, List<ScheduledJob> jobsAtHour) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 44,
            child: Text(
              hour,
              style: AeraTypography.label.copyWith(
                fontWeight: FontWeight.w700,
                color: AeraColors.inkSoft,
              ),
            ),
          ),
          Expanded(
            child: Column(
              children: jobsAtHour
                  .map(
                    (job) => Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: _ScheduledJobCard(job: job),
                    ),
                  )
                  .toList(),
            ),
          ),
        ],
      ),
    );
  }
}

/// Groups by assigned technician using the real workload roster (so
/// technicians with zero jobs today still get a lane), plus an
/// "Unassigned" lane for jobs with no technician.
class _LanesView extends ConsumerWidget {
  const _LanesView({required this.jobs});

  final List<ScheduledJob> jobs;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final workloadAsync = ref.watch(workloadProvider);

    return workloadAsync.when(
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
      ),
      error: (error, _) => _ErrorBlock(
        message: error is ApiException
            ? error.message
            : 'Could not load technician workload',
        onRetry: () => ref.invalidate(workloadProvider),
      ),
      data: (workload) {
        final unassigned = jobs
            .where((j) => j.assignedTechnician == null)
            .toList();

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ...workload.entries.map((entry) {
              final techJobs = jobs
                  .where((j) => j.assignedTechnician?.id == entry.technician.id)
                  .toList();
              return _lane(
                title: entry.technician.fullName,
                subtitle:
                    '${entry.jobCount} job${entry.jobCount == 1 ? '' : 's'} today',
                avatarInitials: entry.technician.initials,
                jobs: techJobs,
              );
            }),
            if (unassigned.isNotEmpty)
              _lane(
                title: 'Unassigned',
                subtitle:
                    '${unassigned.length} job${unassigned.length == 1 ? '' : 's'} need a technician',
                avatarInitials: '?',
                jobs: unassigned,
                isWarning: true,
              ),
          ],
        );
      },
    );
  }

  Widget _lane({
    required String title,
    required String subtitle,
    required String avatarInitials,
    required List<ScheduledJob> jobs,
    bool isWarning = false,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 14,
                backgroundColor: isWarning
                    ? AeraColors.warningSoft
                    : AeraColors.accentSoft,
                child: Text(
                  avatarInitials,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: isWarning ? AeraColors.warning : AeraColors.accent,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: AeraTypography.bodyMedium.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(
                    subtitle,
                    style: AeraTypography.label.copyWith(
                      fontSize: 10,
                      color: AeraColors.inkSoft,
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 8),
          if (jobs.isEmpty)
            Padding(
              padding: const EdgeInsets.only(left: 36),
              child: Text(
                'No jobs scheduled',
                style: AeraTypography.bodySm.copyWith(
                  fontSize: 11,
                  color: AeraColors.inkSoft,
                ),
              ),
            )
          else
            Padding(
              padding: const EdgeInsets.only(left: 36),
              child: Column(
                children: jobs
                    .map(
                      (job) => Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: _ScheduledJobCard(job: job),
                      ),
                    )
                    .toList(),
              ),
            ),
        ],
      ),
    );
  }
}

class _ScheduledJobCard extends StatelessWidget {
  const _ScheduledJobCard({required this.job});

  final ScheduledJob job;

  @override
  Widget build(BuildContext context) {
    final start = job.scheduledStart?.toLocal();
    final end = job.scheduledEnd?.toLocal();
    final time = (start != null && end != null)
        ? '${DateFormat('h:mm a').format(start)} - ${DateFormat('h:mm a').format(end)}'
        : 'Time TBD';

    return AeraCard(
      padding: const EdgeInsets.all(12),
      onTap: () => context.push('/jobs/${job.id}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                time,
                style: AeraTypography.label.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              AeraStatusChip(
                label: job.status.replaceAll('_', ' '),
                type: _jobStatusType(job.status),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            '${job.customer.fullName} · ${job.serviceType}',
            style: AeraTypography.bodyMedium.copyWith(
              fontWeight: FontWeight.w700,
              color: AeraColors.ink,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              const Icon(Icons.person_pin, size: 14, color: AeraColors.inkSoft),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  job.assignedTechnician?.fullName ?? 'Unassigned',
                  style: AeraTypography.bodySm.copyWith(
                    fontSize: 11,
                    color: AeraColors.inkSoft,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ErrorBlock extends StatelessWidget {
  const _ErrorBlock({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 32),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.error_outline,
              size: 40,
              color: AeraColors.warning,
            ),
            const SizedBox(height: 10),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            FilledButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }
}
