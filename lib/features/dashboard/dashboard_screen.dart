import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_metric_card.dart';
import '../auth/providers/auth_provider.dart';
import 'data/dashboard_repository.dart';
import 'providers/dashboard_provider.dart';
import 'widgets/get_started_checklist.dart';

class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});

  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);
    final summaryAsync = ref.watch(dashboardSummaryProvider);
    final todayAsync = ref.watch(dashboardTodayProvider(50));
    final alertsAsync = ref.watch(dashboardAlertsProvider);

    final firstName = user?.firstName ?? '';

    // Format greeting based on time of day
    final hour = DateTime.now().hour;
    final greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    // Format current date
    final now = DateTime.now();
    final dateFormatter = DateFormat('EEEE, MMM d · yyyy');
    final dateStr = dateFormatter.format(now);

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AppBar(
        backgroundColor: AeraColors.surface.withValues(alpha: 0.85),
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
                  'Dashboard',
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
            icon: Stack(
              children: [
                const Icon(Icons.notifications_outlined, color: AeraColors.ink, size: 22),
                Positioned(
                  right: 0,
                  top: 0,
                  child: Container(
                    width: 7,
                    height: 7,
                    decoration: const BoxDecoration(
                      color: AeraColors.accent,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
              ],
            ),
            onPressed: () => context.push('/notifications'),
            tooltip: 'Notifications',
          ),
          IconButton(
            icon: CircleAvatar(
              radius: 14,
              backgroundColor: AeraColors.primary,
              child: const Icon(Icons.person, color: Colors.white, size: 16),
            ),
            tooltip: 'Profile',
            onPressed: () => context.push('/profile-settings'),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(dashboardSummaryProvider);
            ref.invalidate(dashboardTodayProvider);
            ref.invalidate(dashboardAlertsProvider);
          },
          child: ListView(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            children: [
              // Real progress for new companies; hidden once everything is done.
              const GetStartedChecklist(),

              // Dispatch Hero Bar
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        dateStr.toUpperCase(),
                        style: AeraTypography.labelUpper.copyWith(fontSize: 10),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '$greeting, $firstName',
                        style: AeraTypography.display.copyWith(fontSize: 22),
                      ),
                    ],
                  ),
                  AeraCard(
                    padding: const EdgeInsets.all(8),
                    borderRadius: AeraRadii.borderMd,
                    onTap: () => context.push('/calendar'),
                    child: const Icon(Icons.map_outlined, color: AeraColors.accent, size: 20),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // 2x2 Operational Summary Grid
              summaryAsync.when(
                data: (summary) {
                  final jobsToday = summary.jobsToday.toString();
                  final inProgressCount = summary.jobsByStatus
                          .firstWhere(
                            (s) => s.status == 'IN_PROGRESS',
                            orElse: () => const JobStatusCount(status: 'IN_PROGRESS', count: 0),
                          )
                          .count
                          .toString();
                  final atRiskCount = summary.unassignedJobs.toString();
                  
                  // Format revenue
                  final revenue = summary.revenueThisMonth.collectedByCurrency.isEmpty
                      ? '0'
                      : _formatCurrency(
                          summary.revenueThisMonth.collectedByCurrency.first.totalMinor,
                          summary.revenueThisMonth.collectedByCurrency.first.currency,
                        );
                  
                  final invoicesCount = summary.outstandingInvoices.count.toString();

                  return Column(
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: AeraMetricCard(
                              label: "Today's Jobs",
                              value: jobsToday,
                              sublabel: 'Scheduled today',
                              icon: Icons.assignment_outlined,
                              onTap: () => context.push('/jobs'),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: AeraMetricCard(
                              label: 'In Progress',
                              value: inProgressCount,
                              sublabel: 'Active jobs',
                              valueColor: AeraColors.accent,
                              icon: Icons.precision_manufacturing_outlined,
                              iconColor: AeraColors.accent,
                              iconBgColor: AeraColors.accentSoft,
                              onTap: () => context.push('/jobs'),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Expanded(
                            child: AeraMetricCard(
                              label: 'Unassigned',
                              value: atRiskCount,
                              sublabel: 'Action required',
                              valueColor: atRiskCount != '0' ? AeraColors.warning : AeraColors.ink,
                              badge: atRiskCount != '0'
                                  ? Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: AeraColors.warningSoft,
                                        borderRadius: AeraRadii.borderFull,
                                      ),
                                      child: Text(
                                        'ALERT',
                                        style: AeraTypography.labelUpper.copyWith(
                                          fontSize: 9,
                                          color: AeraColors.warning,
                                          fontWeight: FontWeight.w800,
                                        ),
                                      ),
                                    )
                                  : null,
                              onTap: () => context.push('/jobs'),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: AeraMetricCard(
                              label: 'Awaiting Pay',
                              value: revenue,
                              sublabel: '$invoicesCount invoices pending',
                              icon: Icons.payments_outlined,
                              onTap: () => context.push('/invoices'),
                            ),
                          ),
                        ],
                      ),
                    ],
                  );
                },
                loading: () => const Center(
                  child: Padding(
                    padding: EdgeInsets.all(40),
                    child: CircularProgressIndicator(),
                  ),
                ),
                error: (error, stack) => AeraCard(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      Icon(Icons.error_outline, color: AeraColors.danger, size: 32),
                      const SizedBox(height: 8),
                      Text(
                        'Failed to load dashboard',
                        style: AeraTypography.bodySm,
                      ),
                      const SizedBox(height: 8),
                      ElevatedButton(
                        onPressed: () => ref.invalidate(dashboardSummaryProvider),
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 20),

              // Operational Alerts
              alertsAsync.when(
                data: (alerts) {
                  if (alerts.alerts.isEmpty) {
                    return const SizedBox.shrink();
                  }

                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'Operational Alerts',
                            style: AeraTypography.h3.copyWith(fontSize: 16),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: AeraColors.warning,
                              borderRadius: AeraRadii.borderFull,
                            ),
                            child: Text(
                              '${alerts.alerts.length}',
                              style: AeraTypography.label.copyWith(
                                color: Colors.white,
                                fontSize: 10,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      ...alerts.alerts.take(5).map((alert) => _AlertCard(alert: alert)),
                    ],
                  );
                },
                loading: () => const SizedBox.shrink(),
                error: (error, stack) => const SizedBox.shrink(),
              ),

              const SizedBox(height: 20),

              // Today's Dispatch Queue
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        "Today's Dispatch Queue",
                        style: AeraTypography.h3.copyWith(fontSize: 16),
                    ),
                      Text(
                        'Chronological order',
                        style: AeraTypography.bodySm.copyWith(fontSize: 11),
                      ),
                    ],
                  ),
                  AeraCard(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    borderRadius: AeraRadii.borderMd,
                    backgroundColor: AeraColors.accentSoft,
                    onTap: () => context.push('/create-job'),
                    child: Row(
                      children: [
                        const Icon(Icons.add, size: 16, color: AeraColors.accent),
                        const SizedBox(width: 4),
                        Text(
                          'New Job',
                          style: AeraTypography.label.copyWith(
                            color: AeraColors.accent,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // Queue Items
              todayAsync.when(
                data: (today) {
                  if (today.jobs.isEmpty) {
                    return AeraCard(
                      padding: const EdgeInsets.all(24),
                      child: Column(
                        children: [
                          Icon(Icons.assignment_outlined, color: AeraColors.inkSoft, size: 48),
                          const SizedBox(height: 12),
                          Text(
                            'No jobs scheduled today',
                            style: AeraTypography.body.copyWith(color: AeraColors.inkSoft),
                          ),
                        ],
                      ),
                    );
                  }

                  return Column(
                    children: today.jobs.map((job) => _JobCard(job: job)).toList(),
                  );
                },
                loading: () => const Center(
                  child: Padding(
                    padding: EdgeInsets.all(40),
                    child: CircularProgressIndicator(),
                  ),
                ),
                error: (error, stack) => AeraCard(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      Icon(Icons.error_outline, color: AeraColors.danger, size: 32),
                      const SizedBox(height: 8),
                      Text(
                        'Failed to load jobs',
                        style: AeraTypography.bodySm,
                      ),
                      const SizedBox(height: 8),
                      ElevatedButton(
                        onPressed: () => ref.invalidate(dashboardTodayProvider),
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _formatCurrency(String minorUnits, String currency) {
    try {
      final minor = int.parse(minorUnits);
      final major = minor / 100;
      final formatter = NumberFormat.currency(symbol: currency);
      return formatter.format(major);
    } catch (e) {
      return minorUnits;
    }
  }
}

class _AlertCard extends StatelessWidget {
  const _AlertCard({required this.alert});

  final Alert alert;

  @override
  Widget build(BuildContext context) {
    final isError = alert.severity == 'error';
    final icon = isError ? Icons.error : Icons.warning;
    final color = isError ? AeraColors.danger : AeraColors.warning;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AeraCard(
        padding: const EdgeInsets.all(12),
        backgroundColor: isError ? AeraColors.dangerSoft : AeraColors.warningSoft,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 20, color: color),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    alert.message,
                    style: AeraTypography.bodySm.copyWith(color: AeraColors.ink),
                  ),
                  if (alert.jobNumber != null) ...[
                    const SizedBox(height: 4),
                    GestureDetector(
                      onTap: () {
                        if (alert.jobId != null) {
                          context.push('/job/${alert.jobId}');
                        }
                      },
                      child: Text(
                        alert.jobNumber!,
                        style: AeraTypography.label.copyWith(
                          color: AeraColors.accent,
                          decoration: TextDecoration.underline,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _JobCard extends StatelessWidget {
  const _JobCard({required this.job});

  final TodayJob job;

  @override
  Widget build(BuildContext context) {
    final statusColor = _getStatusColor(job.status);
    
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AeraCard(
        padding: const EdgeInsets.all(12),
        onTap: () => context.push('/job/${job.id}'),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    job.jobNumber,
                    style: AeraTypography.label.copyWith(
                      color: AeraColors.accent,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.1),
                    borderRadius: AeraRadii.borderFull,
                  ),
                  child: Text(
                    job.status,
                    style: AeraTypography.label.copyWith(
                      color: statusColor,
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              job.customerName,
              style: AeraTypography.body.copyWith(fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 4),
            Text(
              job.serviceType,
              style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
            ),
            const SizedBox(height: 4),
            Text(
              job.addressLine,
              style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
            ),
            if (job.technicianName != null) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  const Icon(Icons.person, size: 14, color: AeraColors.inkSoft),
                  const SizedBox(width: 4),
                  Text(
                    job.technicianName!,
                    style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'SCHEDULED':
        return AeraColors.primary;
      case 'EN_ROUTE':
        return AeraColors.accent;
      case 'IN_PROGRESS':
        return AeraColors.success;
      case 'COMPLETED':
        return AeraColors.inkSoft;
      case 'CANCELLED':
        return AeraColors.danger;
      default:
        return AeraColors.ink;
    }
  }
}
