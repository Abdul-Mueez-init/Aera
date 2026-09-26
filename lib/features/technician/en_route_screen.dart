import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/network/api_response.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_status_chip.dart';
import '../jobs/data/jobs_repository.dart';
import '../jobs/providers/jobs_provider.dart';
import 'providers/technician_provider.dart';

class EnRouteScreen extends ConsumerStatefulWidget {
  const EnRouteScreen({super.key, required this.jobId});

  final String jobId;

  @override
  ConsumerState<EnRouteScreen> createState() => _EnRouteScreenState();
}

class _EnRouteScreenState extends ConsumerState<EnRouteScreen> {
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

  Future<void> _arrived() async {
    setState(() => _busy = true);
    try {
      await ref
          .read(jobsRepositoryProvider)
          .transitionStatus(widget.jobId, 'IN_PROGRESS');
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
    final mapsUrl = 'https://www.google.com/maps/dir/?api=1&destination=$encodedQuery';

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

  Future<void> _callCustomer() async {
    final jobAsync = ref.read(jobDetailProvider(widget.jobId));
    final job = jobAsync.value;
    if (job == null || job.customer.phone == null) return;

    final phoneUrl = 'tel:${job.customer.phone}';
    final uri = Uri.parse(phoneUrl);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    } else {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not make call')),
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
        title: 'En Route',
        subtitle: 'Navigation Context',
      ),
      body: SafeArea(
        child: jobAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Center(
            child: Text(
              error is ApiException ? error.message : 'Could not load job',
            ),
          ),
          data: (job) => Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  children: [
                    // Navigation header card
                    AeraCard(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  color: AeraColors.accentSoft,
                                  borderRadius: AeraRadii.borderMd,
                                ),
                                child: const Icon(
                                  Icons.navigation,
                                  size: 24,
                                  color: AeraColors.accent,
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'Heading to',
                                      style: AeraTypography.label.copyWith(
                                        color: AeraColors.inkSoft,
                                      ),
                                    ),
                                    Text(
                                      job.customer.fullName,
                                      style: AeraTypography.h3.copyWith(fontSize: 16),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          Text(
                            job.serviceAddress.formatted,
                            style: AeraTypography.bodyMedium,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),

                    // Quick actions
                    Row(
                      children: [
                        Expanded(
                          child: AeraButton(
                            text: 'Navigate',
                            variant: AeraButtonVariant.secondary,
                            icon: const Icon(
                              Icons.map,
                              size: 18,
                              color: AeraColors.ink,
                            ),
                            onPressed: _openMaps,
                          ),
                        ),
                        const SizedBox(width: 10),
                        if (job.customer.phone != null)
                          Expanded(
                            child: AeraButton(
                              text: 'Call',
                              variant: AeraButtonVariant.secondary,
                              icon: const Icon(
                                Icons.phone,
                                size: 18,
                                color: AeraColors.ink,
                              ),
                              onPressed: _callCustomer,
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 14),

                    // Job details card
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
                                type: AeraStatusType.inProgress,
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
                                  Icons.access_time,
                                  size: 18,
                                  color: AeraColors.accent,
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  'Scheduled',
                                  style: AeraTypography.label.copyWith(
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            Text(
                              DateFormat('EEEE, MMM d').format(job.scheduledStart!),
                              style: AeraTypography.bodyMedium,
                            ),
                            const SizedBox(height: 4),
                            Text(
                              DateFormat('h:mm a').format(job.scheduledStart!),
                              style: AeraTypography.h3.copyWith(fontSize: 18),
                            ),
                          ],
                        ),
                      ),
                    const SizedBox(height: 14),

                    // Priority
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
                            job.priority,
                            style: AeraTypography.bodyMedium.copyWith(
                              fontWeight: FontWeight.w600,
                              color: _priorityColor(job.priority),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 14),

                    // Notes from dispatcher
                    if (job.notes.isNotEmpty)
                      AeraCard(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                const Icon(
                                  Icons.note_outlined,
                                  size: 18,
                                  color: AeraColors.accent,
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  'Notes (${job.notes.length})',
                                  style: AeraTypography.label.copyWith(
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            ...job.notes.take(3).map(
                              (note) => Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: Container(
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: AeraColors.surfaceContainerLow,
                                    borderRadius: AeraRadii.borderMd,
                                  ),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                        children: [
                                          Text(
                                            note.authorName ?? 'Unknown',
                                            style: AeraTypography.label,
                                          ),
                                          Text(
                                            DateFormat('h:mm a').format(note.createdAt),
                                            style: AeraTypography.label.copyWith(
                                              fontSize: 10,
                                              color: AeraColors.inkSoft,
                                            ),
                                          ),
                                        ],
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        note.body,
                                        style: AeraTypography.bodySm.copyWith(
                                          fontSize: 12,
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
                  ],
                ),
              ),

              // Bottom action bar
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AeraColors.surface,
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.05),
                      blurRadius: 10,
                      offset: const Offset(0, -2),
                    ),
                  ],
                ),
                child: AeraButton(
                  text: 'Arrived — Start Work',
                  icon: const Icon(
                    Icons.check_circle,
                    size: 18,
                    color: Colors.white,
                  ),
                  isLoading: _busy,
                  onPressed: _busy ? null : _arrived,
                ),
              ),
            ],
          ),
        ),
      ),
    );
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
