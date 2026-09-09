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
import '../customers/data/customers_repository.dart';
import '../customers/providers/customers_provider.dart';
import 'data/jobs_repository.dart';
import 'providers/jobs_provider.dart';

const _priorityOptions = <String, String>{
  'High': 'HIGH',
  'Normal': 'NORMAL',
  'Low': 'LOW',
};

const _serviceSuggestions = <String>[
  'Emergency Diagnostic',
  'Compressor Replacement',
  'Preventive Maintenance',
  'Refrigerant Recharge',
];

class CreateJobScreen extends ConsumerStatefulWidget {
  const CreateJobScreen({super.key});

  @override
  ConsumerState<CreateJobScreen> createState() => _CreateJobScreenState();
}

class _CreateJobScreenState extends ConsumerState<CreateJobScreen> {
  final _titleController = TextEditingController();
  final _notesController = TextEditingController();
  String _selectedPriority = 'NORMAL';
  String? _customerId;
  String? _addressId;
  bool _saving = false;

  @override
  void dispose() {
    _titleController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final title = _titleController.text.trim();
    final problem = _notesController.text.trim();

    if (_customerId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Choose a customer for this job')),
      );
      return;
    }
    if (_addressId == null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Choose a service address')));
      return;
    }
    if (title.isEmpty || problem.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Job title and diagnostic brief are required'),
        ),
      );
      return;
    }

    setState(() => _saving = true);
    try {
      final job = await ref
          .read(jobsRepositoryProvider)
          .createJob(
            CreateJobInput(
              customerId: _customerId!,
              serviceAddressId: _addressId!,
              serviceType: title,
              problemDescription: problem,
              priority: _selectedPriority,
            ),
          );

      ref.invalidate(jobsListProvider);
      ref.read(jobDraftProvider.notifier).state = job;

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Work order created — now schedule it')),
        );
        context.push('/schedule-job/${job.id}');
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
        ).showSnackBar(const SnackBar(content: Text('Could not create job')));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final customersAsync = ref.watch(customersListProvider);
    final customerId = _customerId;

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: const AeraAppBar(
        title: 'Create Work Order',
        subtitle: 'Dispatch Intake',
        showBrand: true,
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          children: [
            // Customer & Site Location
            AeraCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'CUSTOMER & SITE LOCATION',
                        style: AeraTypography.labelUpper.copyWith(fontSize: 10),
                      ),
                      GestureDetector(
                        onTap: () => context.push('/create-customer'),
                        child: Text(
                          '+ New',
                          style: AeraTypography.label.copyWith(
                            color: AeraColors.accent,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  customersAsync.when(
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
                          : 'Could not load customers',
                      style: AeraTypography.bodySm.copyWith(
                        color: AeraColors.danger,
                      ),
                    ),
                    data: (page) {
                      if (page.items.isEmpty) {
                        return Text(
                          'No customers yet — add one first',
                          style: AeraTypography.bodySm,
                        );
                      }
                      return DropdownButtonFormField<String>(
                        initialValue: customerId,
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
                          hintText: 'Select a customer',
                        ),
                        items: page.items
                            .map(
                              (c) => DropdownMenuItem(
                                value: c.id,
                                child: Text(
                                  c.fullName,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            )
                            .toList(),
                        onChanged: (value) {
                          setState(() {
                            _customerId = value;
                            _addressId = null;
                          });
                        },
                      );
                    },
                  ),
                  if (customerId != null) ...[
                    const SizedBox(height: 12),
                    Consumer(
                      builder: (context, ref, _) {
                        final detailAsync = ref.watch(
                          customerDetailProvider(customerId),
                        );
                        return detailAsync.when(
                          loading: () => const Padding(
                            padding: EdgeInsets.symmetric(vertical: 8),
                            child: SizedBox(
                              height: 16,
                              width: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                          ),
                          error: (error, _) => Text(
                            error is ApiException
                                ? error.message
                                : 'Could not load addresses',
                            style: AeraTypography.bodySm.copyWith(
                              color: AeraColors.danger,
                            ),
                          ),
                          data: (customer) {
                            if (customer.serviceAddresses.isEmpty) {
                              return Text(
                                'This customer has no address on file yet',
                                style: AeraTypography.bodySm,
                              );
                            }
                            return DropdownButtonFormField<String>(
                              initialValue: _addressId,
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
                                hintText: 'Select a service address',
                              ),
                              items: customer.serviceAddresses
                                  .map(
                                    (a) => DropdownMenuItem(
                                      value: a.id,
                                      child: Text(
                                        '${a.label} · ${a.formatted}',
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                    ),
                                  )
                                  .toList(),
                              onChanged: (value) =>
                                  setState(() => _addressId = value),
                            );
                          },
                        );
                      },
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 14),

            // Problem & Scope
            AeraCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'What needs to be done?',
                    style: AeraTypography.h3.copyWith(fontSize: 15),
                  ),
                  const SizedBox(height: 12),
                  AeraTextField(
                    label: 'Job Title / Problem Summary',
                    hintText: 'AC Not Cooling · Emergency Diagnostic',
                    controller: _titleController,
                    prefixIcon: const Icon(
                      Icons.build_circle_outlined,
                      size: 20,
                      color: AeraColors.outline,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Quick Fill',
                    style: AeraTypography.label.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: _serviceSuggestions
                        .map((s) => _serviceChip(s))
                        .toList(),
                  ),
                  const SizedBox(height: 16),
                  AeraTextField(
                    label: 'Detailed Diagnostic Brief',
                    hintText: 'What is the customer reporting?',
                    controller: _notesController,
                    maxLines: 3,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),

            // Priority
            AeraCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Priority',
                    style: AeraTypography.h3.copyWith(fontSize: 15),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: _priorityOptions.entries
                        .map(
                          (entry) => Expanded(
                            child: Padding(
                              padding: const EdgeInsets.only(right: 8),
                              child: _priorityPill(entry.key, entry.value),
                            ),
                          ),
                        )
                        .toList(),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            AeraButton(
              text: _saving ? 'Creating...' : 'Continue to Schedule & Dispatch',
              icon: _saving
                  ? null
                  : const Icon(
                      Icons.calendar_today,
                      size: 18,
                      color: Colors.white,
                    ),
              isLoading: _saving,
              onPressed: _saving ? null : _submit,
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _serviceChip(String title) {
    final isSelected = _titleController.text == title;
    return ChoiceChip(
      label: Text(title),
      selected: isSelected,
      onSelected: (_) => setState(() => _titleController.text = title),
      selectedColor: AeraColors.accentSoft,
      backgroundColor: AeraColors.surface,
      labelStyle: AeraTypography.label.copyWith(
        color: isSelected ? AeraColors.accent : AeraColors.ink,
        fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
      ),
      side: BorderSide(color: isSelected ? AeraColors.accent : AeraColors.line),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
    );
  }

  Widget _priorityPill(String title, String value) {
    final isSelected = _selectedPriority == value;
    return InkWell(
      onTap: () => setState(() => _selectedPriority = value),
      borderRadius: AeraRadii.borderMd,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: isSelected ? AeraColors.accentSoft : AeraColors.surfaceSubtle,
          borderRadius: AeraRadii.borderMd,
          border: Border.all(
            color: isSelected ? AeraColors.accent : Colors.transparent,
            width: 1.5,
          ),
        ),
        child: Text(
          title,
          style: AeraTypography.label.copyWith(
            color: isSelected ? AeraColors.accent : AeraColors.inkSoft,
            fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
            fontSize: 11,
          ),
        ),
      ),
    );
  }
}
