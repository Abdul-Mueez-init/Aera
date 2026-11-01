import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:go_router/go_router.dart';
import '../../core/network/api_response.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';
import '../auth/providers/auth_provider.dart';
import 'providers/onboarding_wizard_provider.dart';

class BusinessBasicsScreen extends ConsumerStatefulWidget {
  const BusinessBasicsScreen({super.key});

  @override
  ConsumerState<BusinessBasicsScreen> createState() =>
      _BusinessBasicsScreenState();
}

class _BusinessBasicsScreenState extends ConsumerState<BusinessBasicsScreen> {
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _taxIdController = TextEditingController();
  String _currency = 'USD';
  bool _saving = false;
  bool _uploadingLogo = false;
  String? _error;

  bool get _businessFieldsValid {
    final name = _nameController.text.trim();
    final phone = _phoneController.text.trim();
    final digits = phone.replaceAll(RegExp(r'\D'), '').length;
    return name.isNotEmpty &&
        phone.length >= 7 &&
        phone.length <= 25 &&
        RegExp(r'^\+?[0-9()\s.-]+$').hasMatch(phone) &&
        digits >= 7 &&
        digits <= 15;
  }

  @override
  void initState() {
    super.initState();
    // Prefill company name from session only
    final session = ref.read(authNotifierProvider).valueOrNull;
    if (session?.company.name != null) {
      _nameController.text = session!.company.name;
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _taxIdController.dispose();
    super.dispose();
  }

  Future<void> _saveAndContinue() async {
    if (!_businessFieldsValid) {
      setState(
        () => _error =
            'Enter a business name and a valid dispatch phone number (7–15 digits).',
      );
      return;
    }
    final name = _nameController.text.trim();
    final phone = _phoneController.text.trim();
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      ref
          .read(onboardingWizardProvider.notifier)
          .updateBusinessBasics(
            name: name,
            phone: phone,
            taxId: _taxIdController.text,
            currency: _currency,
          );
      if (mounted) context.push('/onboarding/service-area');
    } catch (error) {
      if (mounted) {
        setState(
          () => _error = error is ApiException
              ? error.message
              : 'Could not save business details. Check your connection and retry.',
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _uploadLogo() async {
    try {
      final image = await ImagePicker().pickImage(
        source: ImageSource.gallery,
        maxWidth: 1600,
        maxHeight: 1600,
        imageQuality: 88,
      );
      if (image == null || !mounted) return;
      setState(() {
        _uploadingLogo = true;
        _error = null;
      });
      final bytes = await image.readAsBytes();
      ref.read(onboardingWizardProvider.notifier).setLogo(bytes, image.name);
    } catch (error) {
      if (mounted) {
        setState(
          () => _error = error is ApiException
              ? error.message
              : error.toString().replaceFirst('Exception: ', ''),
        );
      }
    } finally {
      if (mounted) setState(() => _uploadingLogo = false);
    }
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
            const SizedBox(height: 20),
            Text(
              'Set up your HVAC business',
              style: AeraTypography.display.copyWith(fontSize: 26),
            ),
            const SizedBox(height: 4),
            Text(
              'These saved details appear on estimates, invoices, and dispatches.',
              style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
            ),
            const SizedBox(height: 20),
            AeraCard(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Company logo (optional)',
                    style: AeraTypography.label.copyWith(
                      color: AeraColors.inkSoft,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: AeraColors.canvas,
                      borderRadius: AeraRadii.borderMd,
                      border: Border.all(color: AeraColors.line),
                    ),
                    child: Row(
                      children: [
                        Consumer(
                          builder: (context, ref, child) {
                            final wizard = ref.watch(onboardingWizardProvider);
                            if (wizard.logoBytes == null) {
                              return const Icon(
                                Icons.image_outlined,
                                color: AeraColors.outline,
                                size: 42,
                              );
                            }
                            return ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: Image.memory(
                                Uint8List.fromList(wizard.logoBytes!),
                                width: 48,
                                height: 48,
                                fit: BoxFit.cover,
                                errorBuilder: (_, _, _) => const Icon(
                                  Icons.image_outlined,
                                  color: AeraColors.outline,
                                  size: 42,
                                ),
                              ),
                            );
                          },
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            _uploadingLogo
                                ? 'Uploading and verifying…'
                                : 'JPEG, PNG, or WebP • maximum 5 MB',
                            style: AeraTypography.bodySm.copyWith(
                              color: AeraColors.inkSoft,
                            ),
                          ),
                        ),
                        IconButton(
                          tooltip: 'Upload company logo',
                          onPressed: _uploadingLogo ? null : _uploadLogo,
                          icon: _uploadingLogo
                              ? const SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                )
                              : const Icon(
                                  Icons.upload_outlined,
                                  color: AeraColors.accent,
                                ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),
                  _field(
                    'Registered Business Name *',
                    'e.g. Acme Heating & Air',
                    _nameController,
                    Icons.domain,
                  ),
                  const SizedBox(height: 16),
                  _field(
                    'Primary Phone (Dispatch Line) *',
                    'Your dispatch phone number',
                    _phoneController,
                    Icons.phone_outlined,
                    keyboardType: TextInputType.phone,
                  ),
                  const SizedBox(height: 16),
                  _field(
                    'Tax ID / Business License (optional)',
                    'Tax registration number',
                    _taxIdController,
                    Icons.verified_outlined,
                  ),
                  const SizedBox(height: 18),
                  Text(
                    'Operating Currency',
                    style: AeraTypography.label.copyWith(
                      color: AeraColors.inkSoft,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    children: [
                      _currencyChip('USD', 'USD'),
                      _currencyChip('EUR', 'EUR'),
                      _currencyChip('PKR', 'PKR'),
                    ],
                  ),
                ],
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(
                _error!,
                style: AeraTypography.bodySm.copyWith(color: AeraColors.danger),
              ),
            ],
            const SizedBox(height: 24),
            AeraButton(
              text: _saving ? 'Saving…' : 'Save & Continue to Territory',
              icon: const Icon(
                Icons.arrow_forward,
                size: 18,
                color: Colors.white,
              ),
              onPressed: !_businessFieldsValid || _saving
                  ? null
                  : _saveAndContinue,
            ),
            if (!_businessFieldsValid) ...[
              const SizedBox(height: 8),
              Text(
                'Business name and a valid dispatch phone are required to continue.',
                textAlign: TextAlign.center,
                style: AeraTypography.label.copyWith(color: AeraColors.inkSoft),
              ),
            ],
            const SizedBox(height: 12),
            if (_error != null)
              Center(
                child: Text(
                  _error!,
                  style: AeraTypography.bodySm.copyWith(color: AeraColors.danger),
                ),
              ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _field(
    String label,
    String hint,
    TextEditingController controller,
    IconData icon, {
    TextInputType? keyboardType,
  }) => TextField(
    controller: controller,
    keyboardType: keyboardType,
    onChanged: (_) => setState(() {}),
    decoration: InputDecoration(
      labelText: label,
      hintText: hint,
      prefixIcon: Icon(icon, size: 20),
      border: const OutlineInputBorder(),
    ),
  );

  Widget _currencyChip(String label, String value) => ChoiceChip(
    label: Text(label),
    selected: _currency == value,
    onSelected: _saving ? null : (_) => setState(() => _currency = value),
  );
}
