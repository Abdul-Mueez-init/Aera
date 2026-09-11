import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/network/api_response.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';
import '../jobs/data/jobs_repository.dart';
import '../jobs/providers/jobs_provider.dart';
import 'data/invoices_repository.dart';
import 'providers/invoices_provider.dart';

/// Screen-local, autoDispose: deliberately does NOT reuse the shared
/// `jobsQueryProvider`/`jobsListProvider` pair, since those back the global
/// Jobs list screen — pointing them at `status: COMPLETED` here would leak
/// this screen's filter into that one. A narrow local provider avoids that
/// cross-talk.
final _completedJobsProvider = FutureProvider.autoDispose<List<Job>>((
  ref,
) async {
  final repo = ref.watch(jobsRepositoryProvider);
  final page = await repo.listJobs(status: 'COMPLETED', pageSize: 100);
  return page.items;
});

class CreateInvoiceScreen extends ConsumerStatefulWidget {
  const CreateInvoiceScreen({super.key});

  @override
  ConsumerState<CreateInvoiceScreen> createState() =>
      _CreateInvoiceScreenState();
}

/// Avoids depending on `package:collection`'s `firstOrNull` extension for
/// a single call site — `collection` is only a transitive dependency here.
Job? _findById(List<Job> jobs, String? id) {
  if (id == null) return null;
  for (final job in jobs) {
    if (job.id == id) return job;
  }
  return null;
}

class _CreateInvoiceScreenState extends ConsumerState<CreateInvoiceScreen> {
  String? _jobId;
  bool _saving = false;

  Future<void> _submit() async {
    final jobId = _jobId;
    if (jobId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Choose a completed job to invoice')),
      );
      return;
    }

    setState(() => _saving = true);
    try {
      // Idempotent server-side — if an invoice already exists for this job
      // it's returned instead of erroring, so no pre-check is needed here.
      final invoice = await ref
          .read(invoicesRepositoryProvider)
          .generateFromJob(jobId);

      ref.invalidate(invoicesListProvider);

      if (!mounted) return;

      if (invoice.totalMinor == 0) {
        // Per invoice.service.ts getCompletedJobSource fallback order: no
        // approved quote and no logged parts means a $0 placeholder line
        // item was generated. Warn clearly before navigating — there is no
        // line-item-editing endpoint yet, so this needs a manual fix.
        await showDialog<void>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Placeholder \$0 invoice'),
            content: const Text(
              'This job had no approved quote and no logged parts, so the '
              'generated invoice has a \$0 total. There is currently no way '
              'to edit invoice line items through the app — this will need '
              'a manual correction.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('Understood'),
              ),
            ],
          ),
        );
      }

      if (mounted) {
        context.pushReplacement('/invoices/${invoice.id}');
      }
    } catch (e) {
      if (mounted) {
        final message = e is ApiException
            ? e.message
            : 'Could not generate invoice. Please try again.';
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(message)));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final jobsAsync = ref.watch(_completedJobsProvider);
    final jobId = _jobId;
    final selectedJob = jobsAsync.maybeWhen(
      data: (jobs) => _findById(jobs, jobId),
      orElse: () => null,
    );

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: const AeraAppBar(
        title: 'Create Invoice',
        subtitle: 'From Completed Job',
        showBrand: true,
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          children: [
            AeraCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'COMPLETED JOB',
                    style: AeraTypography.labelUpper.copyWith(fontSize: 10),
                  ),
                  const SizedBox(height: 10),
                  jobsAsync.when(
                    loading: () => const Padding(
                      padding: EdgeInsets.symmetric(vertical: 12),
                      child: Center(
                        child: SizedBox(
                          height: 18,
                          width: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      ),
                    ),
                    error: (error, _) => Text(
                      error is ApiException
                          ? error.message
                          : 'Could not load completed jobs',
                      style: AeraTypography.bodySm.copyWith(
                        color: AeraColors.danger,
                      ),
                    ),
                    data: (jobs) {
                      if (jobs.isEmpty) {
                        return Text(
                          'No completed jobs yet — invoices can only be '
                          'generated once a job is marked complete',
                          style: AeraTypography.bodySm,
                        );
                      }
                      return DropdownButtonFormField<String>(
                        initialValue: jobId,
                        isExpanded: true,
                        decoration: InputDecoration(
                          filled: true,
                          fillColor: AeraColors.surface,
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 10,
                          ),
                          border: OutlineInputBorder(
                            borderRadius: AeraRadii.borderMd,
                            borderSide: const BorderSide(
                              color: AeraColors.line,
                            ),
                          ),
                          hintText: 'Select a completed job',
                        ),
                        items: jobs
                            .map(
                              (j) => DropdownMenuItem(
                                value: j.id,
                                child: Text(
                                  '#${j.jobNumber} · ${j.customer.fullName} · ${j.serviceType}',
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            )
                            .toList(),
                        onChanged: (value) => setState(() => _jobId = value),
                      );
                    },
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),

            if (selectedJob != null) ...[
              AeraCard(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: AeraColors.accentSoft,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Icon(
                        Icons.receipt_long,
                        color: AeraColors.accent,
                        size: 22,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            selectedJob.customer.fullName,
                            style: AeraTypography.h3.copyWith(fontSize: 15),
                          ),
                          Text(
                            'Job #${selectedJob.jobNumber} · ${selectedJob.serviceType}',
                            style: AeraTypography.bodySm.copyWith(fontSize: 11),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              Text(
                'Line items are sourced automatically from this job\'s most '
                'recently approved quote, or from its logged parts if there '
                'is no quote. The server computes and returns the final '
                'totals — nothing is editable here before generating.',
                style: AeraTypography.bodySm.copyWith(
                  color: AeraColors.inkSoft,
                ),
              ),
              const SizedBox(height: 24),
            ],

            AeraButton(
              text: 'Generate Invoice',
              icon: const Icon(
                Icons.receipt_long_outlined,
                size: 18,
                color: Colors.white,
              ),
              isLoading: _saving,
              onPressed: (_jobId == null || _saving) ? null : _submit,
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }
}
