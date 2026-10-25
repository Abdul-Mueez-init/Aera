import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_metric_card.dart';
import '../auth/providers/auth_provider.dart';
import '../onboarding/data/onboarding_repository.dart';
import 'data/dashboard_repository.dart';
import 'providers/dashboard_provider.dart';
import 'providers/get_started_provider.dart';
import 'widgets/get_started_checklist.dart';

String _formatMoney(String totalMinor, String currency) {
  final minor = int.tryParse(totalMinor) ?? 0;
  return '$currency ${(minor / 100).toStringAsFixed(2)}';
}

String _greetingForHour(int hour) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

String _formatWindow(String startIso, String endIso) {
  try {
    final start = DateTime.parse(startIso).toLocal();
    final end = DateTime.parse(endIso).toLocal();
    final startStr =
        '${start.hour.toString().padLeft(2, '0')}:${start.minute.toString().padLeft(2, '0')}';
    final endStr =
        '${end.hour.toString().padLeft(2, '0')}:${end.minute.toString().padLeft(2, '0')}';
    return '$startStr - $endStr';
  } catch (_) {
    return 'Scheduled';
  }
}

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    final company = ref.watch(currentCompanyProvider);
    final companyLogoAsync = ref.watch(companyLogoUrlProvider);
    final summaryAsync = ref.watch(dashboardSummaryProvider);
    final alertsAsync = ref.watch(dashboardAlertsProvider);
    final todayAsync = ref.watch(dashboardTodayProvider(50));

    final greeting =
        '${_greetingForHour(DateTime.now().hour)}${user != null && user.firstName.isNotEmpty ? ', ${user.firstName}' : ''}';
    final companyTitle = (company?.name.isNotEmpty ?? false)
        ? company!.name.toUpperCase()
        : 'AERA HVAC';

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
              child: companyLogoAsync.maybeWhen(
                data: (url) => url == null
                    ? const Icon(Icons.ac_unit, color: Colors.white, size: 18)
                    : ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Image.network(
                          url,
                          width: 32,
                          height: 32,
                          fit: BoxFit.cover,
                          errorBuilder: (_, _, _) => const Icon(
                            Icons.ac_unit,
                            color: Colors.white,
                            size: 18,
                          ),
                        ),
                      ),
                orElse: () =>
                    const Icon(Icons.ac_unit, color: Colors.white, size: 18),
              ),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  companyTitle,
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
                const Icon(
                  Icons.notifications_outlined,
                  color: AeraColors.ink,
                  size: 22,
                ),
                if ((alertsAsync.valueOrNull?.alerts.length ?? 0) > 0)
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
          ),
          IconButton(
            icon: CircleAvatar(
              radius: 14,
              backgroundColor: AeraColors.primary,
              child: Text(
                user != null && user.initials.isNotEmpty ? user.initials : 'U',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            onPressed: () => context.push('/profile-settings'),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          color: AeraColors.accent,
          onRefresh: () async {
            ref.invalidate(dashboardSummaryProvider);
            ref.invalidate(dashboardTodayProvider(50));
            ref.invalidate(dashboardAlertsProvider);
            ref.invalidate(getStartedProvider);
          },
          child: ListView(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            children: [
              // Dispatch Hero Bar
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        summaryAsync.valueOrNull?.date.isNotEmpty == true
                            ? 'DISPATCH · ${summaryAsync.valueOrNull!.date}'
                            : 'DISPATCH OVERVIEW',
                        style: AeraTypography.labelUpper.copyWith(fontSize: 10),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        greeting,
                        style: AeraTypography.display.copyWith(fontSize: 22),
                      ),
                    ],
                  ),
                  AeraCard(
                    padding: const EdgeInsets.all(8),
                    borderRadius: AeraRadii.borderMd,
                    onTap: () => context.push('/calendar'),
                    child: const Icon(
                      Icons.calendar_month_outlined,
                      color: AeraColors.accent,
                      size: 20,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // Get Started Checklist for new companies
              const GetStartedChecklist(),

              // Operational Metrics Grid
              summaryAsync.when(
                data: (summary) {
                  final inProgressCount = summary.jobsByStatus
                      .where(
                        (j) =>
                            j.status == 'IN_PROGRESS' || j.status == 'EN_ROUTE',
                      )
                      .fold<int>(0, (sum, j) => sum + j.count);

                  // Balances are per-currency on the backend — show every
                  // currency, never just the first.
                  final outstandingBalance =
                      summary
                          .outstandingInvoices
                          .balanceDueByCurrency
                          .isNotEmpty
                      ? summary.outstandingInvoices.balanceDueByCurrency
                            .map((c) => _formatMoney(c.totalMinor, c.currency))
                            .join(' · ')
                      : '0';

                  return Column(
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: AeraMetricCard(
                              label: "Today's Jobs",
                              value: summary.jobsToday.toString(),
                              sublabel: '${summary.unassignedJobs} unassigned',
                              icon: Icons.assignment_outlined,
                              onTap: () => context.push('/jobs'),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: AeraMetricCard(
                              label: 'In Progress',
                              value: inProgressCount.toString(),
                              sublabel: 'Active field units',
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
                              value: summary.unassignedJobs.toString(),
                              sublabel: summary.unassignedJobs > 0
                                  ? 'Needs technician'
                                  : 'All assigned',
                              valueColor: summary.unassignedJobs > 0
                                  ? AeraColors.warning
                                  : AeraColors.ink,
                              icon: Icons.person_add_outlined,
                              onTap: () => context.push('/jobs'),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: AeraMetricCard(
                              label: 'Outstanding',
                              value: '${summary.outstandingInvoices.count} inv',
                              sublabel: outstandingBalance,
                              icon: Icons.payments_outlined,
                              onTap: () => context.push('/invoices'),
                            ),
                          ),
                        ],
                      ),
                    ],
                  );
                },
                loading: () => const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Center(
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                ),
                error: (err, _) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: AeraCard(
                    padding: const EdgeInsets.all(12),
                    child: Text(
                      'Failed to load operational metrics: $err',
                      style: AeraTypography.bodySm.copyWith(
                        color: AeraColors.danger,
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 20),

              // Operational Alerts Section
              alertsAsync.when(
                data: (alertsData) {
                  final alerts = alertsData.alerts;
                  if (alerts.isEmpty) {
                    return Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: AeraColors.surface,
                        borderRadius: AeraRadii.borderMd,
                        border: Border.all(color: AeraColors.line),
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 28,
                            height: 28,
                            decoration: BoxDecoration(
                              color: AeraColors.successSoft,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: const Icon(
                              Icons.check_circle_outline,
                              size: 16,
                              color: AeraColors.success,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'All Systems Operational',
                                  style: AeraTypography.h3.copyWith(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                Text(
                                  'No dispatch delays or invoice bottlenecks.',
                                  style: AeraTypography.bodySm.copyWith(
                                    color: AeraColors.inkSoft,
                                    fontSize: 12,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    );
                  }

                  return Container(
                    decoration: BoxDecoration(
                      color: AeraColors.surface,
                      borderRadius: AeraRadii.borderLg,
                      border: Border.all(color: AeraColors.line),
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [
                          AeraColors.warningSoft.withValues(alpha: 0.3),
                          AeraColors.surface,
                        ],
                      ),
                    ),
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Row(
                              children: [
                                Container(
                                  width: 28,
                                  height: 28,
                                  decoration: BoxDecoration(
                                    color: AeraColors.warningSoft,
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: const Icon(
                                    Icons.warning_amber,
                                    size: 16,
                                    color: AeraColors.warning,
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  'Operational Alerts',
                                  style: AeraTypography.h3.copyWith(
                                    fontSize: 15,
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
                                color: AeraColors.warning,
                                borderRadius: AeraRadii.borderFull,
                              ),
                              child: Text(
                                '${alerts.length} ${alerts.length == 1 ? "Alert" : "Alerts"}',
                                style: AeraTypography.label.copyWith(
                                  color: Colors.white,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        for (final alert in alerts) ...[
                          _alertCard(context, alert),
                          const SizedBox(height: 8),
                        ],
                      ],
                    ),
                  );
                },
                loading: () => const SizedBox.shrink(),
                error: (e, s) => AeraCard(
                  padding: const EdgeInsets.all(12),
                  child: Row(
                    children: [
                      const Icon(
                        Icons.error_outline,
                        size: 18,
                        color: AeraColors.danger,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Could not load operational alerts.',
                          style: AeraTypography.bodySm.copyWith(
                            color: AeraColors.danger,
                          ),
                        ),
                      ),
                      TextButton(
                        onPressed: () =>
                            ref.invalidate(dashboardAlertsProvider),
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 20),

              // Today's Dispatch Queue Section
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
                        'Chronological jobs scheduled for today',
                        style: AeraTypography.bodySm.copyWith(fontSize: 11),
                      ),
                    ],
                  ),
                  AeraCard(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    borderRadius: AeraRadii.borderMd,
                    backgroundColor: AeraColors.accentSoft,
                    onTap: () => context.push('/create-job'),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.add,
                          size: 16,
                          color: AeraColors.accent,
                        ),
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

              todayAsync.when(
                data: (todayData) {
                  final jobs = todayData.jobs;
                  if (jobs.isEmpty) {
                    return AeraCard(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(
                            Icons.calendar_today_outlined,
                            size: 32,
                            color: AeraColors.inkSoft,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'No jobs scheduled for today',
                            style: AeraTypography.h3.copyWith(fontSize: 15),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Use the button above to schedule your first job.',
                            style: AeraTypography.bodySm.copyWith(
                              color: AeraColors.inkSoft,
                            ),
                          ),
                        ],
                      ),
                    );
                  }

                  return Column(
                    children: [
                      for (final job in jobs) ...[
                        _dispatchItem(context, job: job),
                        const SizedBox(height: 10),
                      ],
                    ],
                  );
                },
                loading: () => const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Center(
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                ),
                error: (err, _) => AeraCard(
                  padding: const EdgeInsets.all(12),
                  child: Text(
                    'Failed to load dispatch queue: $err',
                    style: AeraTypography.bodySm.copyWith(
                      color: AeraColors.danger,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }

  Widget _alertCard(BuildContext context, Alert alert) {
    final isError = alert.severity == 'error';
    return InkWell(
      borderRadius: AeraRadii.borderMd,
      onTap: () {
        if (alert.jobId != null && alert.jobId!.isNotEmpty) {
          context.push('/jobs/${alert.jobId}');
        } else if (alert.invoiceId != null && alert.invoiceId!.isNotEmpty) {
          context.push('/invoices/${alert.invoiceId}');
        }
      },
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AeraColors.surfaceContainerLow,
          borderRadius: AeraRadii.borderMd,
          border: Border.all(
            color: isError
                ? AeraColors.danger.withValues(alpha: 0.3)
                : AeraColors.warning.withValues(alpha: 0.3),
          ),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              isError ? Icons.error_outline : Icons.schedule,
              size: 16,
              color: isError ? AeraColors.danger : AeraColors.warning,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 1,
                        ),
                        decoration: BoxDecoration(
                          color: isError
                              ? AeraColors.dangerSoft
                              : AeraColors.warningSoft,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          alert.type,
                          style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w700,
                            color: isError
                                ? AeraColors.danger
                                : AeraColors.warning,
                          ),
                        ),
                      ),
                      if (alert.jobNumber != null) ...[
                        const SizedBox(width: 6),
                        Text(
                          alert.jobNumber!,
                          style: AeraTypography.label.copyWith(
                            fontWeight: FontWeight.w700,
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    alert.message,
                    style: AeraTypography.bodySm.copyWith(
                      color: AeraColors.ink,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(
              Icons.chevron_right,
              size: 16,
              color: AeraColors.inkSoft,
            ),
          ],
        ),
      ),
    );
  }

  Widget _dispatchItem(BuildContext context, {required TodayJob job}) {
    final windowStr = _formatWindow(job.windowStart, job.windowEnd);
    final isAtRisk =
        job.status == 'SCHEDULED' &&
        DateTime.tryParse(job.windowStart)?.isBefore(DateTime.now().toUtc()) ==
            true;

    return AeraCard(
      padding: const EdgeInsets.all(14),
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
                    windowStr,
                    style: AeraTypography.label.copyWith(
                      fontWeight: FontWeight.w700,
                      color: AeraColors.ink,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    // The backend already prefixes jobNumber with "JOB-".
                    '· ${job.jobNumber}',
                    style: AeraTypography.label.copyWith(
                      color: AeraColors.inkSoft,
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: isAtRisk
                      ? AeraColors.warningSoft
                      : AeraColors.accentSoft,
                  borderRadius: AeraRadii.borderFull,
                ),
                child: Text(
                  isAtRisk ? 'At Risk' : job.status,
                  style: AeraTypography.label.copyWith(
                    color: isAtRisk ? AeraColors.warning : AeraColors.accent,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            job.customerName,
            style: AeraTypography.h3.copyWith(fontSize: 15),
          ),
          const SizedBox(height: 2),
          Text(
            job.serviceType,
            style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
          ),
          const SizedBox(height: 8),
          const Divider(color: AeraColors.line),
          const SizedBox(height: 6),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Row(
                  children: [
                    const Icon(
                      Icons.location_on_outlined,
                      size: 14,
                      color: AeraColors.inkSoft,
                    ),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        job.addressLine,
                        style: AeraTypography.bodySm.copyWith(fontSize: 11),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
              Row(
                children: [
                  const Icon(
                    Icons.person_pin_outlined,
                    size: 14,
                    color: AeraColors.accent,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    job.technicianName ?? 'Unassigned',
                    style: AeraTypography.label.copyWith(
                      color: job.technicianName != null
                          ? AeraColors.accent
                          : AeraColors.warning,
                      fontSize: 11,
                    ),
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
