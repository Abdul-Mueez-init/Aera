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
import 'data/jobs_repository.dart';
import 'providers/jobs_provider.dart';

const _statusTabs = <String, String?>{
  'All': null,
  'Scheduled': 'SCHEDULED',
  'En Route': 'EN_ROUTE',
  'In Progress': 'IN_PROGRESS',
  'Completed': 'COMPLETED',
};

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

class JobsScreen extends ConsumerStatefulWidget {
  const JobsScreen({super.key});

  @override
  ConsumerState<JobsScreen> createState() => _JobsScreenState();
}

class _JobsScreenState extends ConsumerState<JobsScreen> {
  String _activeTab = 'All';

  @override
  Widget build(BuildContext context) {
    final jobsAsync = ref.watch(jobsListProvider);

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
                  'Jobs Directory',
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
        onPressed: () => context.push('/create-job'),
      ),
      body: SafeArea(
        child: jobsAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => _ErrorState(
            message: error is ApiException
                ? error.message
                : 'Could not load jobs',
            onRetry: () => ref.invalidate(jobsListProvider),
          ),
          data: (page) => RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(jobsListProvider);
              await ref.read(jobsListProvider.future);
            },
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              children: [
                Row(
                  children: [
                    Text(
                      'Jobs',
                      style: AeraTypography.display.copyWith(fontSize: 22),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      width: 5,
                      height: 5,
                      decoration: const BoxDecoration(
                        color: AeraColors.accent,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      '${page.meta.total} Total',
                      style: AeraTypography.bodySm,
                    ),
                  ],
                ),
                const SizedBox(height: 14),

                // Status Tabs
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: _statusTabs.keys
                        .map(
                          (title) => Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: _tabChip(title, _statusTabs[title]),
                          ),
                        )
                        .toList(),
                  ),
                ),
                const SizedBox(height: 14),

                if (page.items.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 48),
                    child: Center(
                      child: Column(
                        children: [
                          const Icon(
                            Icons.work_outline,
                            size: 48,
                            color: AeraColors.outline,
                          ),
                          const SizedBox(height: 12),
                          Text(
                            _activeTab == 'All'
                                ? 'No jobs yet'
                                : 'No jobs in this status',
                            style: AeraTypography.bodyMedium,
                          ),
                          if (_activeTab == 'All') ...[
                            const SizedBox(height: 8),
                            Text(
                              'Create your first work order to get started',
                              style: AeraTypography.bodySm,
                            ),
                          ],
                        ],
                      ),
                    ),
                  )
                else
                  ...page.items.map(
                    (job) => Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: _JobCard(job: job),
                    ),
                  ),

                if (page.meta.pageCount > 1) ...[
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      IconButton(
                        onPressed: page.meta.page > 1
                            ? () {
                                ref
                                    .read(jobsQueryProvider.notifier)
                                    .state = JobsQuery(
                                  page: page.meta.page - 1,
                                  status: _statusTabs[_activeTab],
                                );
                              }
                            : null,
                        icon: const Icon(Icons.chevron_left),
                      ),
                      Text(
                        'Page ${page.meta.page} of ${page.meta.pageCount}',
                        style: AeraTypography.bodySm,
                      ),
                      IconButton(
                        onPressed: page.meta.page < page.meta.pageCount
                            ? () {
                                ref
                                    .read(jobsQueryProvider.notifier)
                                    .state = JobsQuery(
                                  page: page.meta.page + 1,
                                  status: _statusTabs[_activeTab],
                                );
                              }
                            : null,
                        icon: const Icon(Icons.chevron_right),
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: 60),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _tabChip(String title, String? statusValue) {
    final isSelected = _activeTab == title;
    return InkWell(
      onTap: () {
        setState(() => _activeTab = title);
        ref.read(jobsQueryProvider.notifier).state = JobsQuery(
          status: statusValue,
        );
      },
      borderRadius: AeraRadii.borderFull,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? AeraColors.accent : AeraColors.surface,
          borderRadius: AeraRadii.borderFull,
          border: Border.all(
            color: isSelected ? Colors.transparent : AeraColors.line,
          ),
        ),
        child: Text(
          title,
          style: AeraTypography.label.copyWith(
            color: isSelected ? Colors.white : AeraColors.ink,
            fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
          ),
        ),
      ),
    );
  }
}

class _JobCard extends StatelessWidget {
  const _JobCard({required this.job});

  final Job job;

  @override
  Widget build(BuildContext context) {
    final time = job.scheduledStart != null
        ? DateFormat('MMM d, h:mm a').format(job.scheduledStart!)
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
                  Text(
                    time,
                    style: AeraTypography.label.copyWith(
                      fontWeight: FontWeight.w700,
                      color: AeraColors.ink,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Container(
                    width: 4,
                    height: 4,
                    decoration: const BoxDecoration(
                      color: AeraColors.line,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    '#${job.jobNumber}',
                    style: AeraTypography.label.copyWith(
                      color: AeraColors.inkSoft,
                    ),
                  ),
                ],
              ),
              AeraStatusChip(
                label: job.status.replaceAll('_', ' '),
                type: _jobStatusType(job.status),
              ),
            ],
          ),
          const SizedBox(height: 8),
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
          const Divider(color: AeraColors.line),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    radius: 10,
                    backgroundColor: AeraColors.accentSoft,
                    child: Text(
                      job.assignedTechnician?.initials ?? '?',
                      style: const TextStyle(
                        fontSize: 9,
                        color: AeraColors.accent,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    job.assignedTechnician?.fullName ?? 'Unassigned',
                    style: AeraTypography.label.copyWith(color: AeraColors.ink),
                  ),
                ],
              ),
              Row(
                children: [
                  Text(
                    'View details',
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
            ],
          ),
        ],
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.error_outline,
              size: 48,
              color: AeraColors.warning,
            ),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }
}
