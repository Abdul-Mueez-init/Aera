import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/network/api_response.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_status_chip.dart';
import '../jobs/data/jobs_repository.dart';
import '../jobs/providers/jobs_provider.dart';
import 'providers/technician_provider.dart';

class JobBriefScreen extends ConsumerStatefulWidget {
  const JobBriefScreen({super.key, required this.jobId});

  final String jobId;

  @override
  ConsumerState<JobBriefScreen> createState() => _JobBriefScreenState();
}

class _JobBriefScreenState extends ConsumerState<JobBriefScreen> {
  bool _busy = false;

  void _refreshEverywhere() {
    ref.invalidate(jobDetailProvider(widget.jobId));
    ref.invalidate(jobsListProvider);
    ref.invalidate(technicianTodayProvider);
  }

  void _showError(Object error) {
    if (!mounted) return;
    final message = error is ApiException
        ? error.message
        : 'Something went wrong. Please try again.';
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _startJob() async {
    setState(() => _busy = true);
    try {
      await ref
          .read(jobsRepositoryProvider)
          .transitionStatus(widget.jobId, 'EN_ROUTE');
      _refreshEverywhere();
      if (mounted) {
        context.push('/technician/jobs/${widget.jobId}/work');
      }
    } catch (e) {
      _showError(e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _openMaps() async {
    final jobAsync = ref.read(jobDetailProvider(widget.jobId));
    final job = jobAsync.value;
    if (job == null) return;

    final address = job.serviceAddress;
    final query = '${address.line1}, ${address.city} ${address.region} ${address.postalCode}';
    final encodedQuery = Uri.encodeComponent(query);
    final mapsUrl = 'https://www.google.com/maps/search/?api=1&query=$encodedQuery';

    final uri = Uri.parse(mapsUrl);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not open maps')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final jobAsync = ref.watch(jobDetailProvider(widget.jobId));

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: const AeraAppBar(
        title: 'Job Brief',
        subtitle: 'Before You Arrive',
      ),
      body: SafeArea(
        child: jobAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Center(
            child: Text(
              error is ApiException ? error.message : 'Could not load job',
            ),
          ),
          data: (job) => ListView(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            children: [
              // Job header card
              AeraCard(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          '#${job.jobNumber}',
                          style: AeraTypography.h3.copyWith(fontSize: 16),
                        ),
                        AeraStatusChip(
                          label: job.status.replaceAll('_', ' '),
                          type: _jobStatusType(job.status),
                          showDot: true,
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      job.serviceType,
                      style: AeraTypography.bodyMedium.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      job.problemDescription,
                      style: AeraTypography.bodySm.copyWith(
                        color: AeraColors.inkSoft,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),

              // Customer information
              AeraCard(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(
                          Icons.person_outline,
                          size: 18,
                          color: AeraColors.accent,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          'Customer',
                          style: AeraTypography.label.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(
                      job.customer.fullName,
                      style: AeraTypography.h3.copyWith(fontSize: 16),
                    ),
                    if (job.customer.phone != null) ...[
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          const Icon(
                            Icons.phone_outlined,
                            size: 15,
                            color: AeraColors.inkSoft,
                          ),
                          const SizedBox(width: 6),
                          Text(
                            job.customer.phone!,
                            style: AeraTypography.bodySm,
                          ),
                        ],
                      ),
                    ],
                    if (job.customer.email != null) ...[
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          const Icon(
                            Icons.email_outlined,
                            size: 15,
                            color: AeraColors.inkSoft,
                          ),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              job.customer.email!,
                              style: AeraTypography.bodySm,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 14),

              // Service address
              AeraCard(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(
                          Icons.location_on_outlined,
                          size: 18,
                          color: AeraColors.accent,
                        ),
                        const SizedBox(width: 8),
                        Text(
                          'Service Address',
                          style: AeraTypography.label.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(
                      job.serviceAddress.label,
                      style: AeraTypography.bodyMedium.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      job.serviceAddress.line1,
                      style: AeraTypography.bodyMedium,
                    ),
                    if (job.serviceAddress.line2 != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        job.serviceAddress.line2!,
                        style: AeraTypography.bodyMedium,
                      ),
                    ],
                    const SizedBox(height: 2),
                    Text(
                      '${job.serviceAddress.city}, ${job.serviceAddress.region} ${job.serviceAddress.postalCode}',
                      style: AeraTypography.bodyMedium,
                    ),
                    const SizedBox(height: 12),
                    AeraButton(
                      text: 'Open in Maps',
                      variant: AeraButtonVariant.outline,
                      icon: const Icon(
                        Icons.map_outlined,
                        size: 18,
                        color: AeraColors.ink,
                      ),
                      onPressed: _openMaps,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),

              // Scheduled time
              if (job.scheduledStart != null)
                AeraCard(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(
                            Icons.schedule,
                            size: 18,
                            color: AeraColors.accent,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            'Scheduled Time',
                            style: AeraTypography.label.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Text(
                        DateFormat('EEEE, MMM d, yyyy').format(job.scheduledStart!),
                        style: AeraTypography.bodyMedium,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${DateFormat('h:mm a').format(job.scheduledStart!)} - ${job.scheduledEnd != null ? DateFormat('h:mm a').format(job.scheduledEnd!) : 'TBD'}',
                        style: AeraTypography.h3.copyWith(fontSize: 18),
                      ),
                    ],
                  ),
                ),
              const SizedBox(height: 14),

              // Priority indicator
              AeraCard(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    Icon(
                      _priorityIcon(job.priority),
                      size: 18,
                      color: _priorityColor(job.priority),
                    ),
                    const SizedBox(width: 12),
                    Text(
                      'Priority: ${job.priority}',
                      style: AeraTypography.bodyMedium.copyWith(
                        fontWeight: FontWeight.w600,
                        color: _priorityColor(job.priority),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // Start job action
              AeraButton(
                text: 'Start Job — En Route',
                icon: const Icon(
                  Icons.directions_car,
                  size: 18,
                  color: Colors.white,
                ),
                isLoading: _busy,
                onPressed: _busy ? null : _startJob,
              ),
              const SizedBox(height: 10),
              AeraButton(
                text: 'View Full Job Details',
                variant: AeraButtonVariant.outline,
                onPressed: () => context.push('/jobs/${widget.jobId}'),
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }

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

  IconData _priorityIcon(String priority) {
    switch (priority) {
      case 'URGENT':
        return Icons.warning_amber_rounded;
      case 'HIGH':
        return Icons.trending_up;
      case 'LOW':
        return Icons.trending_down;
      default:
        return Icons.flag;
    }
  }

  Color _priorityColor(String priority) {
    switch (priority) {
      case 'URGENT':
        return AeraColors.danger;
      case 'HIGH':
        return AeraColors.warning;
      case 'LOW':
        return AeraColors.info;
      default:
        return AeraColors.inkSoft;
    }
  }
}
