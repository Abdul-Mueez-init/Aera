import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/network/api_response.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_status_chip.dart';
import '../jobs/data/jobs_repository.dart';
import 'providers/technician_provider.dart';

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
    default:
      return AeraStatusType.neutral;
  }
}

class TechnicianHomeScreen extends ConsumerWidget {
  const TechnicianHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final date = ref.watch(selectedTechDateProvider);
    final jobsAsync = ref.watch(technicianTodayProvider);
    final isToday = _isSameDay(date, DateTime.now());

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: const AeraAppBar(title: 'Today', subtitle: 'Technician'),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
              child: AeraCard(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 8,
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    IconButton(
                      icon: const Icon(Icons.chevron_left),
                      onPressed: () =>
                          ref.read(selectedTechDateProvider.notifier).state =
                              date.subtract(const Duration(days: 1)),
                    ),
                    Column(
                      children: [
                        Text(
                          DateFormat('EEEE').format(date),
                          style: AeraTypography.h3.copyWith(fontSize: 15),
                        ),
                        Text(
                          isToday
                              ? 'Today · ${DateFormat('MMM d').format(date)}'
                              : DateFormat('MMM d, yyyy').format(date),
                          style: AeraTypography.bodySm.copyWith(
                            color: AeraColors.inkSoft,
                          ),
                        ),
                      ],
                    ),
                    IconButton(
                      icon: const Icon(Icons.chevron_right),
                      onPressed: () =>
                          ref.read(selectedTechDateProvider.notifier).state =
                              date.add(const Duration(days: 1)),
                    ),
                  ],
                ),
              ),
            ),
            Expanded(
              child: jobsAsync.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (error, _) => Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        error is ApiException
                            ? error.message
                            : 'Could not load today\'s jobs',
                      ),
                      const SizedBox(height: 12),
                      FilledButton(
                        onPressed: () =>
                            ref.invalidate(technicianTodayProvider),
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                ),
                data: (jobs) {
                  if (jobs.isEmpty) {
                    return Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(
                            Icons.event_available_outlined,
                            size: 48,
                            color: AeraColors.outline,
                          ),
                          const SizedBox(height: 12),
                          Text(
                            isToday
                                ? 'No jobs scheduled for today'
                                : 'No jobs on this day',
                            style: AeraTypography.bodyMedium,
                          ),
                        ],
                      ),
                    );
                  }
                  return RefreshIndicator(
                    onRefresh: () async {
                      ref.invalidate(technicianTodayProvider);
                      await ref.read(technicianTodayProvider.future);
                    },
                    child: ListView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                      itemCount: jobs.length,
                      itemBuilder: (context, index) => Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: _TechJobCard(job: jobs[index]),
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  bool _isSameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;
}

class _TechJobCard extends StatelessWidget {
  const _TechJobCard({required this.job});

  final Job job;

  @override
  Widget build(BuildContext context) {
    final time = job.scheduledStart != null
        ? DateFormat('h:mm a').format(job.scheduledStart!)
        : 'Unscheduled';

    return AeraCard(
      padding: const EdgeInsets.all(16),
      onTap: () => context.push('/jobs/${job.id}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(
                    Icons.schedule,
                    size: 16,
                    color: AeraColors.accent,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    time,
                    style: AeraTypography.label.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
              AeraStatusChip(
                label: job.status.replaceAll('_', ' '),
                type: _jobStatusType(job.status),
                showDot: true,
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            job.customer.fullName,
            style: AeraTypography.h3.copyWith(fontSize: 16),
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              const Icon(Icons.hvac, size: 15, color: AeraColors.accent),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  job.serviceType,
                  style: AeraTypography.bodySm.copyWith(
                    color: AeraColors.inkSoft,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              const Icon(
                Icons.location_on_outlined,
                size: 15,
                color: AeraColors.outline,
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  job.serviceAddress.formatted,
                  style: AeraTypography.bodySm.copyWith(fontSize: 12),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.symmetric(vertical: 6),
            alignment: Alignment.centerRight,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Open job',
                  style: AeraTypography.label.copyWith(
                    color: AeraColors.accent,
                  ),
                ),
                const Icon(
                  Icons.chevron_right,
                  size: 16,
                  color: AeraColors.accent,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
