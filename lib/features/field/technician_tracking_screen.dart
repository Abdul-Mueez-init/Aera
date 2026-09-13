import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/network/api_response.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_status_chip.dart';
import '../portal/data/portal_repository.dart';
import '../portal/providers/portal_provider.dart';

/// Ordered customer-visible milestones. `NEW`/`QUOTING` collapse into "not
/// yet scheduled" (index -1, nothing highlighted); `WAITING_PARTS` is
/// annotated as a sub-state of `IN_PROGRESS` rather than its own step,
/// since from the customer's perspective the technician is still on the
/// job. `CANCELLED` is handled separately as a banner, not a step index.
const List<String> _milestones = [
  'SCHEDULED',
  'EN_ROUTE',
  'IN_PROGRESS',
  'COMPLETED',
];

int _milestoneIndex(String status) {
  if (status == 'WAITING_PARTS') return _milestones.indexOf('IN_PROGRESS');
  return _milestones.indexOf(status);
}

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
      return (AeraStatusType.inProgress, 'Technician En Route');
    case 'SCHEDULED':
      return (AeraStatusType.scheduled, 'Scheduled');
    case 'QUOTING':
      return (AeraStatusType.info, 'Awaiting Estimate');
    case 'NEW':
    default:
      return (AeraStatusType.neutral, 'Not Yet Scheduled');
  }
}

/// Customer-facing job status view, reached through a customer's portal
/// link. Shows the real job status machine (`architecture.md` §8) as
/// recorded server-side — no simulated live GPS, ETA, or map, since the
/// backend has no location-tracking data to back that up.
class TechnicianTrackingScreen extends ConsumerWidget {
  const TechnicianTrackingScreen({
    super.key,
    required this.token,
    required this.jobId,
  });

  final String token;
  final String jobId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final portalAsync = ref.watch(portalSnapshotProvider(token));

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AeraAppBar(
        showBrand: true,
        subtitle: 'Aera Client Portal',
        title: 'Job Status',
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
                    error is ApiException
                        ? error.message
                        : 'Could not load this job',
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: () =>
                        ref.invalidate(portalSnapshotProvider(token)),
                    child: const Text('Retry'),
                  ),
                ],
              ),
            ),
          ),
          data: (customer) {
            final job = customer.jobs
                .where((j) => j.id == jobId)
                .cast<PortalJob?>()
                .firstWhere((_) => true, orElse: () => null);

            if (job == null) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(
                    'This job is no longer available.',
                    style: AeraTypography.body.copyWith(
                      color: AeraColors.inkSoft,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ),
              );
            }

            final (statusType, statusLabel) = _jobStatusPresentation(
              job.status,
            );
            final currentStep = _milestoneIndex(job.status);

            return ListView(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    AeraStatusChip(
                      label: statusLabel,
                      type: statusType,
                      showDot: true,
                    ),
                    Text(
                      'Job #${job.jobNumber}',
                      style: AeraTypography.bodySm.copyWith(
                        color: AeraColors.inkSoft,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),

                AeraCard(
                  padding: const EdgeInsets.all(18),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        job.serviceType,
                        style: AeraTypography.h3.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        job.problemDescription,
                        style: AeraTypography.bodySm.copyWith(
                          color: AeraColors.inkSoft,
                        ),
                      ),
                      const SizedBox(height: 12),
                      if (job.address != null)
                        _infoRow(
                          Icons.location_on_outlined,
                          job.address!.formatted,
                        ),
                      if (job.scheduledStart != null)
                        _infoRow(
                          Icons.event_outlined,
                          DateFormat(
                            'EEE, MMM d • h:mm a',
                          ).format(job.scheduledStart!),
                        ),
                      if (job.technician != null)
                        _infoRow(
                          Icons.badge_outlined,
                          '${job.technician!.fullName} assigned',
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),

                if (job.status == 'CANCELLED') ...[
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: AeraColors.dangerSoft,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: AeraColors.danger.withOpacity(0.3),
                      ),
                    ),
                    child: Column(
                      children: [
                        const Icon(
                          Icons.event_busy_outlined,
                          size: 40,
                          color: AeraColors.danger,
                        ),
                        const SizedBox(height: 10),
                        Text(
                          'This job was cancelled',
                          style: AeraTypography.h3.copyWith(
                            color: AeraColors.danger,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Contact our office if you\'d like to reschedule.',
                          textAlign: TextAlign.center,
                          style: AeraTypography.bodySm.copyWith(
                            color: AeraColors.inkSoft,
                          ),
                        ),
                      ],
                    ),
                  ),
                ] else ...[
                  AeraCard(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'SERVICE PROGRESS',
                          style: AeraTypography.labelUpper.copyWith(
                            color: AeraColors.inkSoft,
                          ),
                        ),
                        const SizedBox(height: 12),
                        for (var i = 0; i < _milestones.length; i++)
                          _stepRow(
                            _milestoneLabel(_milestones[i]),
                            completed: currentStep > i,
                            inProgress: currentStep == i,
                            isLast: i == _milestones.length - 1,
                          ),
                        if (job.status == 'WAITING_PARTS')
                          Padding(
                            padding: const EdgeInsets.only(top: 4, left: 34),
                            child: Text(
                              'Currently waiting on parts before work can continue.',
                              style: AeraTypography.label.copyWith(
                                color: AeraColors.warning,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 24),
              ],
            );
          },
        ),
      ),
    );
  }

  String _milestoneLabel(String milestone) {
    switch (milestone) {
      case 'SCHEDULED':
        return 'Appointment Scheduled';
      case 'EN_ROUTE':
        return 'Technician En Route';
      case 'IN_PROGRESS':
        return 'Work In Progress';
      case 'COMPLETED':
        return 'Job Completed';
      default:
        return milestone;
    }
  }

  Widget _infoRow(IconData icon, String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16, color: AeraColors.accent),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: AeraTypography.bodySm.copyWith(
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _stepRow(
    String title, {
    required bool completed,
    required bool inProgress,
    required bool isLast,
  }) {
    return Padding(
      padding: EdgeInsets.only(bottom: isLast ? 0 : 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 24,
            height: 24,
            decoration: BoxDecoration(
              color: completed
                  ? AeraColors.accent
                  : inProgress
                  ? AeraColors.accentSoft
                  : AeraColors.surfaceSubtle,
              shape: BoxShape.circle,
            ),
            child: Center(
              child: completed
                  ? const Icon(Icons.check, size: 14, color: AeraColors.surface)
                  : Icon(
                      inProgress
                          ? Icons.radio_button_checked
                          : Icons.circle_outlined,
                      size: 12,
                      color: inProgress
                          ? AeraColors.accent
                          : AeraColors.inkSoft,
                    ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              title,
              style: AeraTypography.bodySm.copyWith(
                fontWeight: inProgress ? FontWeight.w700 : FontWeight.w500,
                color: inProgress ? AeraColors.accent : AeraColors.ink,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
