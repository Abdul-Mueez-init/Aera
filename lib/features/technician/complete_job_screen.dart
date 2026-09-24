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
import '../../core/widgets/aera_text_field.dart';
import '../jobs/providers/jobs_provider.dart';
import '../jobs/data/jobs_repository.dart';
import 'providers/technician_provider.dart';

class CompleteJobScreen extends ConsumerStatefulWidget {
  const CompleteJobScreen({super.key, required this.jobId});

  final String jobId;

  @override
  ConsumerState<CompleteJobScreen> createState() => _CompleteJobScreenState();
}

class _CompleteJobScreenState extends ConsumerState<CompleteJobScreen> {
  final _summaryController = TextEditingController();
  bool _submitting = false;
  bool _autoInvoice = false;
  String? _error;

  @override
  void dispose() {
    _summaryController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final summary = _summaryController.text.trim();
    if (summary.isEmpty) {
      setState(() => _error = 'A completion summary is required');
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await ref.read(jobsRepositoryProvider).completeJob(
        widget.jobId,
        summary,
        autoInvoice: _autoInvoice,
      );
      ref.invalidate(jobDetailProvider(widget.jobId));
      ref.invalidate(jobsListProvider);
      ref.invalidate(technicianTodayProvider);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Job marked as completed')),
        );
        // Pop the Evidence/Work/Complete stack back to Technician Home.
        // Note: context.pop() returns void in go_router ^14.x, so it can't
        // be used as a loop condition — check canPop() before each pop.
        while (context.canPop()) {
          context.pop();
        }
        if (context.mounted) {
          context.go('/technician-home');
        }
      }
    } catch (e) {
      setState(() {
        _error = e is ApiException
            ? e.message
            : 'Could not complete job. Please try again.';
      });
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final jobAsync = ref.watch(jobDetailProvider(widget.jobId));

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: const AeraAppBar(title: 'Complete Job', subtitle: 'Final Step'),
      body: SafeArea(
        child: jobAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Center(
            child: Text(
              error is ApiException ? error.message : 'Could not load job',
            ),
          ),
          data: (Job job) => ListView(
            padding: const EdgeInsets.all(16),
            children: [
              AeraCard(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '#${job.jobNumber} · ${job.customer.fullName}',
                      style: AeraTypography.h3.copyWith(fontSize: 16),
                    ),
                    const SizedBox(height: 6),
                    Text(job.serviceType, style: AeraTypography.bodySm),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        _SummaryStat(
                          icon: Icons.image_outlined,
                          label: '${job.photos.length} photos',
                        ),
                        const SizedBox(width: 16),
                        _SummaryStat(
                          icon: Icons.inventory_2_outlined,
                          label: '${job.parts.length} parts',
                        ),
                        const SizedBox(width: 16),
                        _SummaryStat(
                          icon: Icons.note_outlined,
                          label: '${job.notes.length} notes',
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              AeraTextField(
                label: 'Completion summary (required)',
                hintText: 'What was diagnosed and fixed?',
                controller: _summaryController,
                maxLines: 5,
              ),
              const SizedBox(height: 12),
              Container(
                decoration: BoxDecoration(
                  color: AeraColors.surfaceSubtle,
                  borderRadius: AeraRadii.borderMd,
                ),
                child: CheckboxListTile(
                  value: _autoInvoice,
                  onChanged: (val) => setState(() => _autoInvoice = val ?? false),
                  title: Text(
                    'Generate invoice draft immediately',
                    style: AeraTypography.bodyMedium.copyWith(fontWeight: FontWeight.w600),
                  ),
                  subtitle: Text(
                    'Creates a draft invoice from approved quote or logged parts',
                    style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
                  ),
                  activeColor: AeraColors.accent,
                  controlAffinity: ListTileControlAffinity.leading,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 10),
                Text(
                  _error!,
                  style: AeraTypography.bodySm.copyWith(
                    color: AeraColors.danger,
                  ),
                ),
              ],
              const SizedBox(height: 20),
              AeraButton(
                text: 'Mark Job Complete',
                icon: const Icon(
                  Icons.check_circle,
                  size: 18,
                  color: Colors.white,
                ),
                isLoading: _submitting,
                onPressed: _submitting ? null : _submit,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SummaryStat extends StatelessWidget {
  const _SummaryStat({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 15, color: AeraColors.accent),
        const SizedBox(width: 4),
        Text(label, style: AeraTypography.label),
      ],
    );
  }
}
