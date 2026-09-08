import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_text_field.dart';

class BusinessBasicsScreen extends StatefulWidget {
  const BusinessBasicsScreen({super.key});

  @override
  State<BusinessBasicsScreen> createState() => _BusinessBasicsScreenState();
}

class _BusinessBasicsScreenState extends State<BusinessBasicsScreen> {
  final _businessNameController =
      TextEditingController(text: 'Northstar Climate Solutions');
  final _phoneController =
      TextEditingController(text: '+92 (42) 3578-9000');
  final _taxIdController = TextEditingController(text: 'NTN-8492019-3');
  String _selectedCurrency = 'PKR (Rs)';

  @override
  void dispose() {
    _businessNameController.dispose();
    _phoneController.dispose();
    _taxIdController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: const AeraAppBar(
        title: 'Business Basics',
        subtitle: 'Step 01 / 04',
        showBrand: true,
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          children: [
            // Stepper Header
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Container(
                      width: 6,
                      height: 6,
                      decoration: const BoxDecoration(
                        color: AeraColors.accent,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      'STEP 01 / 04 • BUSINESS PROFILE',
                      style: AeraTypography.labelUpper.copyWith(
                        color: AeraColors.accent,
                        fontSize: 10,
                      ),
                    ),
                  ],
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: AeraColors.surface,
                    borderRadius: AeraRadii.borderFull,
                    border: Border.all(color: AeraColors.line),
                  ),
                  child: Text(
                    '25% Complete',
                    style: AeraTypography.label.copyWith(fontSize: 11),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),

            // 4 Progress Segments
            Row(
              children: [
                _progressSegment(true),
                const SizedBox(width: 6),
                _progressSegment(false),
                const SizedBox(width: 6),
                _progressSegment(false),
                const SizedBox(width: 6),
                _progressSegment(false),
              ],
            ),
            const SizedBox(height: 20),

            // Headline
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AeraColors.accentSoft,
                    borderRadius: AeraRadii.borderFull,
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.hvac, size: 14, color: AeraColors.accent),
                      const SizedBox(width: 4),
                      Text(
                        'FIELD OPERATIONS',
                        style: AeraTypography.labelUpper.copyWith(
                          fontSize: 10,
                          color: AeraColors.accent,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              'Set up your HVAC business',
              style: AeraTypography.display.copyWith(fontSize: 26),
            ),
            const SizedBox(height: 4),
            Text(
              'This information will appear on client estimates, invoices, and technician dispatches.',
              style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
            ),
            const SizedBox(height: 20),

            // Main Card
            AeraCard(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAlignment.start,
                children: [
                  // Logo/Emblem box
                  Text(
                    'Company Mark & Vehicle Emblem',
                    style: AeraTypography.label.copyWith(
                      color: AeraColors.inkSoft,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AeraColors.canvas,
                      borderRadius: AeraRadii.borderMd,
                      border: Border.all(color: AeraColors.line),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 48,
                          height: 48,
                          decoration: BoxDecoration(
                            color: AeraColors.accent,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: const Icon(Icons.ac_unit, color: Colors.white, size: 24),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Text(
                                    'Northstar Mark',
                                    style: AeraTypography.h3.copyWith(fontSize: 14),
                                  ),
                                  const SizedBox(width: 8),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: AeraColors.successSoft,
                                      borderRadius: BorderRadius.circular(4),
                                    ),
                                    child: Text(
                                      'Draft saved',
                                      style: AeraTypography.label.copyWith(
                                        fontSize: 10,
                                        color: AeraColors.success,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 2),
                              Text(
                                'PNG or SVG emblem under 5MB',
                                style: AeraTypography.bodySm.copyWith(fontSize: 11),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.cloud_upload_outlined, color: AeraColors.accent),
                          onPressed: () {},
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),

                  AeraTextField(
                    label: 'Registered Business Name',
                    hintText: 'e.g. Acme Heating & Air',
                    controller: _businessNameController,
                    prefixIcon: const Icon(Icons.domain, size: 20, color: AeraColors.outline),
                  ),
                  const SizedBox(height: 16),
                  AeraTextField(
                    label: 'Primary Phone (Dispatch Line)',
                    hintText: '+92 300 1234567',
                    controller: _phoneController,
                    keyboardType: TextInputType.phone,
                    prefixIcon: const Icon(Icons.phone_outlined, size: 20, color: AeraColors.outline),
                  ),
                  const SizedBox(height: 16),
                  AeraTextField(
                    label: 'National Tax ID / Business License',
                    hintText: 'NTN / Tax Registration',
                    controller: _taxIdController,
                    prefixIcon: const Icon(Icons.verified_outlined, size: 20, color: AeraColors.outline),
                  ),
                  const SizedBox(height: 18),

                  // Operating Currency
                  Text(
                    'Operating Currency',
                    style: AeraTypography.label.copyWith(
                      color: AeraColors.inkSoft,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      _currencyChip('PKR (Rs)', 'PKR (Rs)'),
                      const SizedBox(width: 10),
                      _currencyChip('USD (\Strict)', 'USD (\$)'),
                      const SizedBox(width: 10),
                      _currencyChip('EUR (€)', 'EUR (€)'),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Continue Button
            AeraButton(
              text: 'Save & Continue to Territory',
              icon: const Icon(Icons.arrow_forward, size: 18, color: Colors.white),
              onPressed: () => context.push('/onboarding/service-area'),
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _progressSegment(bool isCompleted) {
    return Expanded(
      child: Container(
        height: 5,
        decoration: BoxDecoration(
          color: isCompleted ? AeraColors.accent : AeraColors.surfaceContainerHighest,
          borderRadius: AeraRadii.borderFull,
        ),
      ),
    );
  }

  Widget _currencyChip(String label, String value) {
    final isSelected = _selectedCurrency == value;

    return Expanded(
      child: InkWell(
        onTap: () => setState(() => _selectedCurrency = value),
        borderRadius: AeraRadii.borderMd,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: isSelected ? AeraColors.accentSoft : AeraColors.surface,
            borderRadius: AeraRadii.borderMd,
            border: Border.all(
              color: isSelected ? AeraColors.accent : AeraColors.line,
              width: isSelected ? 1.5 : 1,
            ),
          ),
          child: Text(
            label,
            style: AeraTypography.label.copyWith(
              fontWeight: FontWeight.w700,
              color: isSelected ? AeraColors.accent : AeraColors.ink,
            ),
          ),
        ),
      ),
    );
  }
}
