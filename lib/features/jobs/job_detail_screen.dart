import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/network/api_response.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/utils/map_links.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_status_chip.dart';
import '../../core/widgets/text_prompt_dialog.dart';
import '../auth/providers/auth_provider.dart';
import '../calendar/providers/calendar_provider.dart';
import '../customers/providers/customers_provider.dart';
import '../technician/widgets/handshake_code_sheet.dart';
import '../invoices/data/invoices_repository.dart';
import '../invoices/providers/invoices_provider.dart';
import 'data/jobs_repository.dart' show Job, Technician, jobsRepositoryProvider;
import 'providers/jobs_provider.dart';
import 'widgets/job_portal_card.dart';

// Needed for technician list
final techniciansProvider = FutureProvider.autoDispose<List<Technician>>((
  ref,
) async {
  final repo = ref.watch(jobsRepositoryProvider);
  return repo.listTechnicians();
});

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
  bool _generatingInvoice = false;
  bool _assigning = false;

  /// Opens the phone's maps app with directions to the service address.
  /// Works for every role, and needs no customer portal token.
  Future<void> _openDirections(Iterable<String?> addressParts) async {
    final destination = addressParts
        .whereType<String>()
        .map((part) => part.trim())
        .where((part) => part.isNotEmpty)
        .join(', ');
    if (destination.isEmpty) return;

    final opened = await openMapsForAddress(destination, directions: true);
    if (!opened && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open a maps app')),
      );
    }
  }

  Future<void> _callCustomer(String phone) async {
    final uri = Uri(scheme: 'tel', path: phone.replaceAll(' ', ''));
    try {
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri);
        return;
      }
    } catch (_) {}
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not open phone dialer for $phone')),
      );
    }
  }

  Future<void> _generateInvoiceForJob({bool allowZeroAmount = false}) async {
    setState(() => _generatingInvoice = true);
    try {
      final invoice = await ref
          .read(invoicesRepositoryProvider)
          .generateFromJob(widget.jobId, allowZeroAmount: allowZeroAmount);
      ref.invalidate(jobDetailProvider(widget.jobId));
      ref.invalidate(invoicesListProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Invoice ${invoice.invoiceNumber} created')),
        );
        context.push('/invoices/${invoice.id}');
      }
    } on ApiException catch (e) {
      if (e.code == 'INVOICE_ZERO_AMOUNT') {
        if (!mounted) return;
        final confirmZero = await showDialog<bool>(
          context: context,
          builder: (dialogContext) => AlertDialog(
            backgroundColor: AeraColors.surface,
            shape: RoundedRectangleBorder(borderRadius: AeraRadii.borderLg),
            title: const Text('Zero-Cost Invoice Confirmation'),
            content: const Text(
              'This job has no approved quote and no logged parts (\$0 total). Do you want to generate a zero-cost courtesy / warranty invoice?',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(dialogContext).pop(false),
                child: const Text('Cancel'),
              ),
              TextButton(
                onPressed: () => Navigator.of(dialogContext).pop(true),
                child: const Text('Confirm Zero-Cost'),
              ),
            ],
          ),
        );
        if (confirmZero == true && mounted) {
          await _generateInvoiceForJob(allowZeroAmount: true);
        }
      } else {
        if (mounted) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text(e.message)));
        }
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not generate invoice')),
        );
      }
    } finally {
      if (mounted) setState(() => _generatingInvoice = false);
    }
  }

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
    final summary = await showTextPromptDialog(
      context,
      title: 'Complete Job',
      hintText: 'What was done? (required)',
      confirmLabel: 'Complete',
    );

    if (summary == null || summary.isEmpty) return;

    setState(() => _updating = true);
    try {
      await ref.read(jobsRepositoryProvider).completeJob(widget.jobId, summary);
      ref.invalidate(jobDetailProvider(widget.jobId));
      ref.invalidate(jobsListProvider);
      // The customer's job list and the schedule views show this job too.
      ref.invalidate(customerJobsProvider);
      ref.invalidate(dayScheduleProvider);
      ref.invalidate(workloadProvider);
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

  /// Phase 6.4 — approve or request changes on a completed job awaiting
  /// review. CHANGES_REQUESTED reopens the evidence path for the
  /// technician; APPROVED unblocks invoicing.
  Future<void> _reviewJob(String decision) async {
    final note = decision == 'CHANGES_REQUESTED'
        ? await showTextPromptDialog(
            context,
            title: 'Request Changes',
            hintText: 'What needs to be corrected? (optional)',
            confirmLabel: 'Request Changes',
          )
        : null;
    // Require a note for CHANGES_REQUESTED so the technician knows what
    // to correct — the backend stores it as the review audit note.
    if (decision == 'CHANGES_REQUESTED' && (note == null || note.isEmpty)) {
      return;
    }

    setState(() => _updating = true);
    try {
      await ref
          .read(jobsRepositoryProvider)
          .reviewJob(widget.jobId, decision: decision, note: note);
      ref.invalidate(jobDetailProvider(widget.jobId));
      ref.invalidate(jobFindingsProvider(widget.jobId));
      ref.invalidate(jobChangeRequestsProvider(widget.jobId));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              decision == 'APPROVED'
                  ? 'Completion approved'
                  : 'Changes requested',
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
    } finally {
      if (mounted) setState(() => _updating = false);
    }
  }

  /// Phase 6.5 — staff actions on a change request: quote it as a
  /// CHANGE_ORDER, authorize it as an emergency, or decline it.
  Future<void> _changeRequestAction(
    String changeRequestId,
    String action,
  ) async {
    String? reason;
    if (action == 'authorize') {
      reason = await showTextPromptDialog(
        context,
        title: 'Emergency Authorization',
        hintText: 'Reason customer could not approve (required)',
        confirmLabel: 'Authorize',
      );
      if (reason == null || reason.trim().length < 5) return;
    }

    setState(() => _updating = true);
    try {
      final repo = ref.read(jobsRepositoryProvider);
      switch (action) {
        case 'quote':
          await repo.quoteChangeRequest(widget.jobId, changeRequestId);
        case 'authorize':
          await repo.authorizeChangeRequest(
            widget.jobId,
            changeRequestId,
            reason!,
          );
        case 'decline':
          await repo.declineChangeRequest(widget.jobId, changeRequestId);
      }
      ref.invalidate(jobChangeRequestsProvider(widget.jobId));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Change request $action'.replaceAll('_', ' ')),
          ),
        );
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(e.message)));
      }
    } finally {
      if (mounted) setState(() => _updating = false);
    }
  }

  /// Findings + change-request cards for the job detail screen. Returns
  /// an empty list while either provider is loading or errored so the
  /// section never blocks the rest of the page.
  List<Widget> _fieldReportSection(Job job, bool canManagePortal) {
    final findings = ref.watch(jobFindingsProvider(widget.jobId)).valueOrNull;
    final changeRequests = ref
        .watch(jobChangeRequestsProvider(widget.jobId))
        .valueOrNull;
    if (findings == null && changeRequests == null) {
      return const [];
    }

    return [
      if (findings != null && findings.isNotEmpty)
        AeraCard(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Field Findings (${findings.length})',
                style: AeraTypography.h3.copyWith(fontSize: 15),
              ),
              const SizedBox(height: 8),
              ...findings.map(
                (finding) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        finding.summary,
                        style: AeraTypography.bodySm.copyWith(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      if (finding.recommendedWork != null)
                        Text(
                          '→ ${finding.recommendedWork}',
                          style: AeraTypography.bodySm.copyWith(
                            fontSize: 11,
                            color: AeraColors.inkSoft,
                          ),
                        ),
                      Text(
                        '${finding.customerVisible ? 'Shared with customer' : 'Internal'} · ${DateFormat('MMM d, h:mm a').format(finding.createdAt)}',
                        style: AeraTypography.label.copyWith(fontSize: 10),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      if (changeRequests != null && changeRequests.isNotEmpty)
        AeraCard(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Change Requests (${changeRequests.length})',
                style: AeraTypography.h3.copyWith(fontSize: 15),
              ),
              const SizedBox(height: 8),
              ...changeRequests.map(
                (cr) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Text(
                              '${cr.reason} — ${cr.currency} ${(cr.estimatedPriceMinor / 100).toStringAsFixed(2)}',
                              style: AeraTypography.bodySm.copyWith(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          AeraStatusChip(
                            label: cr.status,
                            type: cr.status == 'OPEN'
                                ? AeraStatusType.warning
                                : cr.status == 'QUOTED' ||
                                      cr.authorizedBy != null
                                ? AeraStatusType.completed
                                : AeraStatusType.neutral,
                          ),
                        ],
                      ),
                      Text(
                        cr.description,
                        style: AeraTypography.bodySm.copyWith(
                          fontSize: 11,
                          color: AeraColors.inkSoft,
                        ),
                      ),
                      if (cr.authorizationReason != null)
                        Text(
                          'Authorized: ${cr.authorizationReason}',
                          style: AeraTypography.label.copyWith(
                            fontSize: 10,
                            color: AeraColors.accent,
                          ),
                        ),
                      if (canManagePortal &&
                          (cr.status == 'OPEN' || cr.status == 'QUOTED'))
                        Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Wrap(
                            spacing: 8,
                            children: [
                              if (cr.status == 'OPEN') ...[
                                TextButton(
                                  onPressed: _updating
                                      ? null
                                      : () => _changeRequestAction(
                                          cr.id,
                                          'quote',
                                        ),
                                  child: const Text('Quote'),
                                ),
                                TextButton(
                                  onPressed: _updating
                                      ? null
                                      : () => _changeRequestAction(
                                          cr.id,
                                          'authorize',
                                        ),
                                  child: const Text('Authorize'),
                                ),
                              ],
                              TextButton(
                                onPressed: _updating
                                    ? null
                                    : () => _changeRequestAction(
                                        cr.id,
                                        'decline',
                                      ),
                                child: Text(
                                  'Decline',
                                  style: TextStyle(color: AeraColors.danger),
                                ),
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      const SizedBox(height: 14),
    ];
  }

  void _scheduleThis(Job job) {
    context.push('/schedule-job/${job.id}');
  }

  /// EN_ROUTE → IN_PROGRESS can never go through the generic status
  /// transition (the backend rejects it with 422 HANDSHAKE_REQUIRED for
  /// every role). The assigned technician starts with the customer's
  /// handshake code; office staff use the audited override. Mirrors the
  /// two working flows in `EnRouteScreen` and `JobPortalCard`.
  Future<void> _startWithHandshake() async {
    final result = await showModalBottomSheet<Object?>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => HandshakeCodeSheet(jobId: widget.jobId),
    );
    if (!mounted) return;
    if (result == true) {
      ref.invalidate(jobDetailProvider(widget.jobId));
      ref.invalidate(jobsListProvider);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Job started')));
    } else if (result is String) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(result)));
    }
  }

  Future<void> _overrideStart() async {
    final reason = await showTextPromptDialog(
      context,
      title: 'Override start',
      message:
          'Starts the job without the customer code. The reason '
          'is recorded in the job history and portal activity.',
      hintText: 'Reason (required, 5–300 characters)',
      confirmLabel: 'Start job',
      minLength: 5,
      maxLength: 300,
    );
    if (reason == null) return;

    setState(() => _updating = true);
    try {
      await ref
          .read(jobsRepositoryProvider)
          .overrideStartJob(widget.jobId, reason);
      ref.invalidate(jobDetailProvider(widget.jobId));
      ref.invalidate(jobsListProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Job started — override recorded')),
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
          const SnackBar(content: Text('Could not start the job')),
        );
      }
    } finally {
      if (mounted) setState(() => _updating = false);
    }
  }

  /// The EN_ROUTE primary action: handshake sheet for the assigned
  /// technician, audited override for office staff, nothing for anyone
  /// else (e.g. a technician who is not assigned to this job).
  Widget _enRoutePrimaryAction(Job job, String? role, String? userId) {
    final isAssignedTechnician =
        role == 'TECHNICIAN' &&
        userId != null &&
        job.assignedTechnician?.id == userId;
    if (isAssignedTechnician) {
      return AeraButton(
        text: 'Arrived On Site',
        icon: const Icon(Icons.check, size: 18, color: Colors.white),
        isLoading: _updating,
        onPressed: _updating ? null : _startWithHandshake,
      );
    }
    if (role == 'OWNER' || role == 'DISPATCHER') {
      return AeraButton(
        text: 'Arrived On Site',
        icon: const Icon(Icons.check, size: 18, color: Colors.white),
        isLoading: _updating,
        onPressed: _updating ? null : _overrideStart,
      );
    }
    return const SizedBox.shrink();
  }

  Future<void> _assignTechnician(Job job) async {
    // Show loading dialog while technicians are being fetched
    if (!mounted) return;

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AeraColors.surface,
        shape: RoundedRectangleBorder(borderRadius: AeraRadii.borderLg),
        content: const Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(),
            SizedBox(height: 16),
            Text('Loading technicians...'),
          ],
        ),
      ),
    );

    // Actually wait for the roster. ref.read(techniciansProvider) alone
    // returns "loading" on the first tap, which looked like "no technicians".
    List<Technician> technicians = const [];
    Object? loadError;
    try {
      technicians = await ref.read(jobsRepositoryProvider).listTechnicians();
    } catch (e) {
      loadError = e;
    }

    // Dismiss loading dialog
    if (!mounted) return;
    Navigator.of(context).pop();

    // Handle error state
    if (loadError != null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Failed to load technicians')),
        );
      }
      return;
    }

    if (technicians.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No active technicians available')),
        );
      }
      return;
    }

    final selectedTechnicianId = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AeraColors.surface,
        shape: RoundedRectangleBorder(borderRadius: AeraRadii.borderLg),
        title: Text(
          'Assign Technician',
          style: AeraTypography.h3.copyWith(fontSize: 17),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: technicians
              .map(
                (tech) => ListTile(
                  title: Text(tech.fullName),
                  onTap: () => Navigator.of(dialogContext).pop(tech.id),
                ),
              )
              .toList(),
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
        ],
      ),
    );

    if (selectedTechnicianId == null) return;

    setState(() => _assigning = true);
    try {
      await ref
          .read(jobsRepositoryProvider)
          .assignTechnician(job.id, selectedTechnicianId);
      ref.invalidate(jobDetailProvider(job.id));
      ref.invalidate(customerJobsProvider);
      ref.invalidate(dayScheduleProvider);
      ref.invalidate(workloadProvider);
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Technician assigned')));
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
          const SnackBar(content: Text('Could not assign technician')),
        );
      }
    } finally {
      if (mounted) setState(() => _assigning = false);
    }
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
              onPressed: () => _callCustomer(jobAsync.value!.customer.phone!),
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
            final role = ref.watch(currentRoleProvider);
            final currentUserId = ref.watch(currentUserProvider)?.id;
            final canManagePortal = role == 'OWNER' || role == 'DISPATCHER';
            final companyName = ref.watch(currentCompanyProvider)?.name ?? '';

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

                // Phase 6.4 — completion review. PENDING blocks invoicing
                // until a manager approves; CHANGES_REQUESTED reopens the
                // technician's evidence path.
                if (job.reviewState == 'PENDING' ||
                    job.reviewState == 'CHANGES_REQUESTED' ||
                    job.reviewState == 'APPROVED') ...[
                  AeraCard(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(
                              job.reviewState == 'APPROVED'
                                  ? Icons.verified_outlined
                                  : job.reviewState == 'CHANGES_REQUESTED'
                                  ? Icons.assignment_return_outlined
                                  : Icons.rate_review_outlined,
                              size: 18,
                              color: job.reviewState == 'APPROVED'
                                  ? AeraColors.accent
                                  : job.reviewState == 'CHANGES_REQUESTED'
                                  ? AeraColors.warning
                                  : AeraColors.inkSoft,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                switch (job.reviewState) {
                                  'APPROVED' => 'Completion approved',
                                  'CHANGES_REQUESTED' => 'Changes requested',
                                  _ => 'Completion review pending',
                                },
                                style: AeraTypography.bodyMedium.copyWith(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ],
                        ),
                        if (job.reviewNote != null &&
                            job.reviewNote!.isNotEmpty) ...[
                          const SizedBox(height: 6),
                          Text(
                            job.reviewNote!,
                            style: AeraTypography.bodySm.copyWith(
                              color: AeraColors.inkSoft,
                            ),
                          ),
                        ],
                        if (job.reviewState == 'PENDING' &&
                            canManagePortal) ...[
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              Expanded(
                                child: AeraButton(
                                  text: 'Approve',
                                  isLoading: _updating,
                                  onPressed: _updating
                                      ? null
                                      : () => _reviewJob('APPROVED'),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: AeraButton(
                                  text: 'Request Changes',
                                  variant: AeraButtonVariant.secondary,
                                  isLoading: _updating,
                                  onPressed: _updating
                                      ? null
                                      : () => _reviewJob('CHANGES_REQUESTED'),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                ],

                // Phase 6.3/6.5 — field findings and change requests.
                // Staff review these before approving completion or
                // invoicing; technicians mutate them from the work screen.
                ..._fieldReportSection(job, canManagePortal),

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
                            onPressed: () => _openDirections([
                              job.serviceAddress.line1,
                              job.serviceAddress.line2,
                              job.serviceAddress.city,
                              job.serviceAddress.region,
                              job.serviceAddress.postalCode,
                              job.serviceAddress.countryCode,
                            ]),
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
                          Expanded(
                            child: Text(
                              job.assignedTechnician?.fullName ??
                                  'No technician assigned',
                              style: AeraTypography.bodySm.copyWith(
                                fontSize: 12,
                              ),
                            ),
                          ),
                          if (job.assignedTechnician == null &&
                              (job.status == 'NEW' || job.status == 'QUOTING'))
                            TextButton(
                              onPressed: _assigning
                                  ? null
                                  : () => _assignTechnician(job),
                              child: Text(
                                'Assign',
                                style: AeraTypography.label.copyWith(
                                  fontSize: 11,
                                  color: AeraColors.accent,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),

                // Portal access (owner/dispatcher only): link status,
                // send/reissue/deactivate, WhatsApp hand-off, and the
                // audited override start for EN_ROUTE jobs.
                if (canManagePortal) ...[
                  JobPortalCard(job: job, companyName: companyName),
                  const SizedBox(height: 14),
                ],

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
                  _enRoutePrimaryAction(job, role, currentUserId)
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
                else if (job.status == 'COMPLETED') ...[
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
                  ),
                  if (job.invoices.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    AeraCard(
                      padding: const EdgeInsets.all(14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Row(
                                children: [
                                  const Icon(
                                    Icons.receipt_long,
                                    size: 18,
                                    color: AeraColors.accent,
                                  ),
                                  const SizedBox(width: 8),
                                  Text(
                                    'Invoice ${job.invoices.first.invoiceNumber}',
                                    style: AeraTypography.bodyMedium.copyWith(
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ],
                              ),
                              AeraStatusChip(
                                label: job.invoices.first.status,
                                type: job.invoices.first.status == 'PAID'
                                    ? AeraStatusType.paid
                                    : job.invoices.first.status == 'ISSUED'
                                    ? AeraStatusType.info
                                    : AeraStatusType.pending,
                              ),
                            ],
                          ),
                          // Technicians receive no financial fields
                          // (amounts are null): show number + status only,
                          // and no View Invoice button — the route guard
                          // would bounce them home anyway.
                          if (job.invoices.first.totalMinor != null &&
                              job.invoices.first.balanceDueMinor != null) ...[
                            const SizedBox(height: 8),
                            Text(
                              'Total: ${job.invoices.first.currency ?? ''} ${(job.invoices.first.totalMinor! / 100).toStringAsFixed(2)}  •  Balance: ${job.invoices.first.currency ?? ''} ${(job.invoices.first.balanceDueMinor! / 100).toStringAsFixed(2)}',
                              style: AeraTypography.bodySm.copyWith(
                                color: AeraColors.inkSoft,
                              ),
                            ),
                            const SizedBox(height: 10),
                            SizedBox(
                              width: double.infinity,
                              child: AeraButton(
                                text: 'View Invoice',
                                variant: AeraButtonVariant.secondary,
                                onPressed: () => context.push(
                                  '/invoices/${job.invoices.first.id}',
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ] else if (ref.watch(currentRoleProvider) !=
                      'TECHNICIAN') ...[
                    const SizedBox(height: 12),
                    AeraButton(
                      text: 'Generate Invoice',
                      icon: const Icon(
                        Icons.receipt,
                        size: 18,
                        color: Colors.white,
                      ),
                      isLoading: _generatingInvoice,
                      onPressed: () => _generateInvoiceForJob(),
                    ),
                  ],
                ] else if (job.status == 'CANCELLED')
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

                // Technician field-execution entry point: notes, evidence
                // photos, parts, and completion all live in the dedicated
                // Work In Progress screen rather than being crammed into
                // this brief, per the Phase 6 handoff's "don't fork Job
                // Brief" decision.
                if (ref.watch(currentRoleProvider) == 'TECHNICIAN' &&
                    (job.status == 'EN_ROUTE' ||
                        job.status == 'IN_PROGRESS' ||
                        job.status == 'WAITING_PARTS')) ...[
                  const SizedBox(height: 10),
                  AeraButton(
                    text: 'Open Work Screen',
                    variant: AeraButtonVariant.secondary,
                    icon: const Icon(
                      Icons.engineering,
                      size: 18,
                      color: AeraColors.ink,
                    ),
                    onPressed: () =>
                        context.push('/technician/jobs/${job.id}/work'),
                  ),
                ],

                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: AeraButton(
                        text: 'Create Quote',
                        variant: AeraButtonVariant.secondary,
                        onPressed: () => context.push(
                          '/create-quote?customerId=${job.customer.id}&jobId=${job.id}',
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: AeraButton(
                        text: 'Create Invoice',
                        variant: AeraButtonVariant.outline,
                        onPressed: () =>
                            context.push('/create-invoice?jobId=${job.id}'),
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
