import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_text_field.dart';

class CreateJobScreen extends StatefulWidget {
  const CreateJobScreen({super.key});

  @override
  State<CreateJobScreen> createState() => _CreateJobScreenState();
}

class _CreateJobScreenState extends State<CreateJobScreen> {
  final _titleController =
      TextEditingController(text: 'AC Not Cooling · Emergency Diagnostic');
  final _notesController = TextEditingController(
      text:
          'Outdoor unit fan running but compressor humming and not kicking on. Blowing warm ambient air indoors.');
  String _selectedService = 'Emergency Diagnostic';
  String _selectedPriority = 'High';

  @override
  void dispose() {
    _titleController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
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
            // Customer Card
            AeraCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'CUSTOMER & SITE LOCATION',
                        style: AeraTypography.labelUpper.copyWith(fontSize: 10),
                      ),
                      Row(
                        children: [
                          GestureDetector(
                            onTap: () => context.push('/customers'),
                            child: Text(
                              'Change',
                              style: AeraTypography.label.copyWith(
                                color: AeraColors.accent,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          const Text('•', style: TextStyle(color: AeraColors.line)),
                          const SizedBox(width: 8),
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
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      CircleAvatar(
                        radius: 20,
                        backgroundColor: AeraColors.accentSoft,
                        child: const Text(
                          'SK',
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: AeraColors.accentDeep,
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Column(
                        crossAxisAlignment: CrossAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text('Sarah Khan', style: AeraTypography.h3.copyWith(fontSize: 15)),
                              const SizedBox(width: 6),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: AeraColors.successSoft,
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Text(
                                  'Active Contract',
                                  style: AeraTypography.label.copyWith(
                                    fontSize: 10,
                                    color: AeraColors.success,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 2),
                          Text('House 42-B, Block K, Gulberg III, Lahore', style: AeraTypography.bodySm.copyWith(fontSize: 11)),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),

            // Problem & Scope Form
            AeraCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAlignment.start,
                children: [
                  Text('What needs to be done?', style: AeraTypography.h3.copyWith(fontSize: 15)),
                  const SizedBox(height: 12),
                  AeraTextField(
                    label: 'Job Title / Problem Summary',
                    controller: _titleController,
                    prefixIcon: const Icon(Icons.build_circle_outlined, size: 20, color: AeraColors.outline),
                  ),
                  const SizedBox(height: 16),

                  Text('Service Category', style: AeraTypography.label.copyWith(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _serviceChip('Emergency Diagnostic'),
                      _serviceChip('Compressor Replacement'),
                      _serviceChip('Preventive Maintenance'),
                      _serviceChip('Refrigerant Recharge'),
                    ],
                  ),
                  const SizedBox(height: 16),

                  AeraTextField(
                    label: 'Detailed Diagnostic Brief',
                    controller: _notesController,
                    maxLines: 3,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),

            // Equipment Selection
            AeraCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Target Equipment', style: AeraTypography.h3.copyWith(fontSize: 15)),
                      Text(
                        'Carrier Infinity 24 (4T)',
                        style: AeraTypography.label.copyWith(
                          color: AeraColors.accent,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AeraColors.surfaceContainerLow,
                      borderRadius: AeraRadii.borderMd,
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.hvac, color: AeraColors.accent, size: 24),
                        const SizedBox(width: 12),
                        Column(
                          crossAxisAlignment: CrossAlignment.start,
                          children: [
                            Text('Carrier Infinity 24 Heat Pump', style: AeraTypography.bodyMedium.copyWith(fontWeight: FontWeight.w700)),
                            Text('Serial: CR-9824-2023 • R-410A', style: AeraTypography.bodySm.copyWith(fontSize: 11)),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),

            // Urgency / Priority
            AeraCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAlignment.start,
                children: [
                  Text('Priority & Response Target', style: AeraTypography.h3.copyWith(fontSize: 15)),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      _priorityPill('High (2h)', 'High', AeraColors.warning, AeraColors.warningSoft),
                      const SizedBox(width: 8),
                      _priorityPill('Standard (Same Day)', 'Standard', AeraColors.accent, AeraColors.accentSoft),
                      const SizedBox(width: 8),
                      _priorityPill('Flexible', 'Flexible', AeraColors.inkSoft, AeraColors.surfaceSubtle),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            AeraButton(
              text: 'Continue to Schedule & Dispatch',
              icon: const Icon(Icons.calendar_today, size: 18, color: Colors.white),
              onPressed: () => context.push('/schedule-job'),
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _serviceChip(String title) {
    final isSelected = _selectedService == title;
    return ChoiceChip(
      label: Text(title),
      selected: isSelected,
      onSelected: (val) => setState(() => _selectedService = title),
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

  Widget _priorityPill(String title, String val, Color color, Color bg) {
    final isSelected = _selectedPriority == val;
    return Expanded(
      child: InkWell(
        onTap: () => setState(() => _selectedPriority = val),
        borderRadius: AeraRadii.borderMd,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: isSelected ? bg : AeraColors.surfaceSubtle,
            borderRadius: AeraRadii.borderMd,
            border: Border.all(color: isSelected ? color : Colors.transparent, width: 1.5),
          ),
          child: Text(
            title,
            style: AeraTypography.label.copyWith(
              color: isSelected ? color : AeraColors.inkSoft,
              fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
              fontSize: 10,
            ),
          ),
        ),
      ),
    );
  }
}
