import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/network/api_response.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_status_chip.dart';
import '../../core/widgets/aera_text_field.dart';
import '../jobs/data/jobs_repository.dart';
import '../jobs/providers/jobs_provider.dart';
import 'data/technician_repository.dart';
import 'providers/technician_provider.dart';

class WorkInProgressScreen extends ConsumerStatefulWidget {
  const WorkInProgressScreen({super.key, required this.jobId});

  final String jobId;

  @override
  ConsumerState<WorkInProgressScreen> createState() =>
      _WorkInProgressScreenState();
}

class _WorkInProgressScreenState extends ConsumerState<WorkInProgressScreen> {
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

  Future<void> _transition(String status) async {
    setState(() => _busy = true);
    try {
      await ref
          .read(jobsRepositoryProvider)
          .transitionStatus(widget.jobId, status);
      _refreshEverywhere();
    } catch (e) {
      _showError(e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _addNote() async {
    final controller = TextEditingController();
    final note = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AeraColors.surface,
        shape: RoundedRectangleBorder(borderRadius: AeraRadii.borderLg),
        title: Text(
          'Add Field Note',
          style: AeraTypography.h3.copyWith(fontSize: 17),
        ),
        content: TextField(
          controller: controller,
          maxLines: 3,
          autofocus: true,
          decoration: const InputDecoration(
            hintText: 'What did you observe or do?',
          ),
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
          TextButton(
            onPressed: () {
              final text = controller.text.trim();
              if (text.isEmpty) return;
              Navigator.of(dialogContext).pop(text);
            },
            child: Text(
              'Save',
              style: AeraTypography.bodyMedium.copyWith(
                color: AeraColors.accent,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
    if (note == null || note.isEmpty) return;

    setState(() => _busy = true);
    try {
      await ref
          .read(technicianRepositoryProvider)
          .addNote(widget.jobId, body: note);
      _refreshEverywhere();
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Note added')));
      }
    } catch (e) {
      _showError(e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _addPart() async {
    final nameController = TextEditingController();
    final qtyController = TextEditingController(text: '1');
    final priceController = TextEditingController();

    final result = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AeraColors.surface,
        shape: RoundedRectangleBorder(borderRadius: AeraRadii.borderLg),
        title: Text(
          'Log Part Used',
          style: AeraTypography.h3.copyWith(fontSize: 17),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AeraTextField(
              label: 'Part name',
              hintText: 'e.g. Capacitor 45/5 MFD',
              controller: nameController,
            ),
            const SizedBox(height: 12),
            AeraTextField(
              label: 'Quantity',
              controller: qtyController,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
            ),
            const SizedBox(height: 12),
            AeraTextField(
              label: 'Unit price (in whole currency units, e.g. 25.00)',
              hintText: '0.00',
              controller: priceController,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(
              'Cancel',
              style: AeraTypography.bodyMedium.copyWith(
                color: AeraColors.inkSoft,
              ),
            ),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(
              'Add',
              style: AeraTypography.bodyMedium.copyWith(
                color: AeraColors.accent,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );

    if (result != true) return;
    final name = nameController.text.trim();
    final quantity = double.tryParse(qtyController.text.trim());
    final unitPrice = double.tryParse(priceController.text.trim());
    if (name.isEmpty ||
        quantity == null ||
        quantity <= 0 ||
        unitPrice == null ||
        unitPrice < 0) {
      _showError(Exception('Enter a valid part name, quantity, and price'));
      return;
    }

    setState(() => _busy = true);
    try {
      await ref
          .read(technicianRepositoryProvider)
          .addPart(
            widget.jobId,
            name: name,
            quantity: quantity,
            unitPriceMinor: (unitPrice * 100).round(),
            currency: 'USD',
          );
      _refreshEverywhere();
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Part logged')));
      }
    } catch (e) {
      _showError(e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final jobAsync = ref.watch(jobDetailProvider(widget.jobId));

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: const AeraAppBar(
        title: 'Work In Progress',
        subtitle: 'Field Execution',
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
              AeraCard(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          '#${job.jobNumber} · ${job.customer.fullName}',
                          style: AeraTypography.h3.copyWith(fontSize: 16),
                        ),
                        AeraStatusChip(
                          label: job.status.replaceAll('_', ' '),
                          type: job.status == 'WAITING_PARTS'
                              ? AeraStatusType.warning
                              : AeraStatusType.inProgress,
                          showDot: true,
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      job.serviceAddress.formatted,
                      style: AeraTypography.bodySm,
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

              // Status controls — same commands job_detail_screen.dart uses,
              // framed for the technician's step-by-step field workflow.
              if (job.status == 'EN_ROUTE')
                AeraButton(
                  text: 'Arrived — Start Job',
                  icon: const Icon(Icons.check, size: 18, color: Colors.white),
                  isLoading: _busy,
                  onPressed: _busy ? null : () => _transition('IN_PROGRESS'),
                )
              else if (job.status == 'IN_PROGRESS')
                AeraButton(
                  text: 'Pause — Waiting on Parts',
                  variant: AeraButtonVariant.secondary,
                  icon: const Icon(
                    Icons.pause_circle_outline,
                    size: 18,
                    color: AeraColors.ink,
                  ),
                  isLoading: _busy,
                  onPressed: _busy ? null : () => _transition('WAITING_PARTS'),
                )
              else if (job.status == 'WAITING_PARTS')
                AeraButton(
                  text: 'Resume Work',
                  icon: const Icon(
                    Icons.play_arrow,
                    size: 18,
                    color: Colors.white,
                  ),
                  isLoading: _busy,
                  onPressed: _busy ? null : () => _transition('IN_PROGRESS'),
                ),
              const SizedBox(height: 10),

              Row(
                children: [
                  Expanded(
                    child: AeraButton(
                      text: 'Add Evidence',
                      variant: AeraButtonVariant.outline,
                      icon: const Icon(
                        Icons.camera_alt_outlined,
                        size: 18,
                        color: AeraColors.ink,
                      ),
                      onPressed: () => context.push(
                        '/technician/jobs/${widget.jobId}/evidence',
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: AeraButton(
                      text: 'Log Part',
                      variant: AeraButtonVariant.outline,
                      icon: const Icon(
                        Icons.inventory_2_outlined,
                        size: 18,
                        color: AeraColors.ink,
                      ),
                      onPressed: _busy ? null : _addPart,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              AeraButton(
                text: 'Add Note',
                variant: AeraButtonVariant.outline,
                icon: const Icon(
                  Icons.note_add_outlined,
                  size: 18,
                  color: AeraColors.ink,
                ),
                onPressed: _busy ? null : _addNote,
              ),

              const SizedBox(height: 20),

              // Evidence summary
              AeraCard(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Evidence (${job.photos.length})',
                      style: AeraTypography.h3.copyWith(fontSize: 15),
                    ),
                    const SizedBox(height: 8),
                    if (job.photos.isEmpty)
                      Text('No photos yet', style: AeraTypography.bodySm)
                    else
                      ...job.photos
                          .take(5)
                          .map(
                            (photo) => Padding(
                              padding: const EdgeInsets.only(bottom: 6),
                              child: Row(
                                children: [
                                  Icon(
                                    photo.kind == 'BEFORE'
                                        ? Icons.looks_one_outlined
                                        : photo.kind == 'AFTER'
                                        ? Icons.looks_two_outlined
                                        : Icons.image_outlined,
                                    size: 16,
                                    color: AeraColors.accent,
                                  ),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(
                                      '${photo.kind} · ${photo.caption ?? 'No caption'}',
                                      style: AeraTypography.bodySm.copyWith(
                                        fontSize: 12,
                                      ),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                  Text(
                                    DateFormat(
                                      'h:mm a',
                                    ).format(photo.createdAt),
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
              const SizedBox(height: 14),

              // Parts summary
              AeraCard(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Parts Used (${job.parts.length})',
                      style: AeraTypography.h3.copyWith(fontSize: 15),
                    ),
                    const SizedBox(height: 8),
                    if (job.parts.isEmpty)
                      Text('No parts logged yet', style: AeraTypography.bodySm)
                    else
                      ...job.parts.map(
                        (part) => Padding(
                          padding: const EdgeInsets.only(bottom: 6),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Expanded(
                                child: Text(
                                  '${part.name} × ${part.quantity.toStringAsFixed(part.quantity == part.quantity.roundToDouble() ? 0 : 2)}',
                                  style: AeraTypography.bodySm.copyWith(
                                    fontSize: 12,
                                  ),
                                ),
                              ),
                              Text(
                                '${part.currency} ${(part.totalMinor / 100).toStringAsFixed(2)}',
                                style: AeraTypography.label.copyWith(
                                  fontWeight: FontWeight.w700,
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

              // Notes summary
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
                                child: Text(
                                  note.body,
                                  style: AeraTypography.bodySm.copyWith(
                                    fontSize: 12,
                                  ),
                                ),
                              ),
                            ),
                          ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              if (job.status == 'IN_PROGRESS' || job.status == 'WAITING_PARTS')
                AeraButton(
                  text: 'Complete Job',
                  icon: const Icon(
                    Icons.check_circle,
                    size: 18,
                    color: Colors.white,
                  ),
                  onPressed: () =>
                      context.push('/technician/jobs/${widget.jobId}/complete'),
                ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }
}
