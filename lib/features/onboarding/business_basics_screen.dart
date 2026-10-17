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
import 'data/onboarding_repository.dart';

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
  bool _loading = true;
  bool _saving = false;
  bool _uploadingLogo = false;
  String? _logoUrl;
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
    _load();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _taxIdController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final profile = await ref.read(onboardingRepositoryProvider).getProfile();
      if (!mounted) return;
      _nameController.text = profile.name;
      _phoneController.text = profile.phone ?? '';
      _taxIdController.text = profile.taxId ?? '';
      if (profile.logoObjectKey != null) {
        try {
          _logoUrl = await ref.read(onboardingRepositoryProvider).getLogoUrl();
        } catch (_) {
          // Keep the rest of the saved company profile usable if preview refresh fails.
        }
      }
      _currency = profile.defaultCurrency;
      if (!['USD', 'EUR', 'PKR'].contains(_currency)) _currency = 'USD';
      setState(() => _loading = false);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error is ApiException
            ? error.message
            : 'Could not load company details.';
        _loading = false;
      });
    }
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
      await ref
          .read(onboardingRepositoryProvider)
          .saveBusiness(
            name: name,
            phone: phone,
            taxId: _taxIdController.text,
            currency: _currency,
          );
      ref.invalidate(onboardingProfileProvider);
      await ref.read(authNotifierProvider.notifier).refreshServerIdentity();
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
      await ref
          .read(onboardingRepositoryProvider)
          .uploadLogo(fileName: image.name, bytes: bytes);
      final url = await ref.read(onboardingRepositoryProvider).getLogoUrl();
      ref.invalidate(onboardingProfileProvider);
      if (mounted) setState(() => _logoUrl = url);
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
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 12,
                    ),
              children: [
                  _stepHeader(),
            const SizedBox(height: 20),
            Text(
              'Set up your HVAC business',
              style: AeraTypography.display.copyWith(fontSize: 26),
            ),
            const SizedBox(height: 4),
            Text(
                    'These saved details appear on estimates, invoices, and dispatches.',
                    style: AeraTypography.bodySm.copyWith(
                      color: AeraColors.inkSoft,
                    ),
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
                              if (_logoUrl == null)
                                const Icon(
                                  Icons.image_outlined,
                                  color: AeraColors.outline,
                                  size: 42,
                                )
                              else
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(8),
                                  child: Image.network(
                                    _logoUrl!,
                          width: 48,
                          height: 48,
                                    fit: BoxFit.cover,
                                    errorBuilder: (_, _, _) => const Icon(
                                      Icons.image_outlined,
                                      color: AeraColors.outline,
                                      size: 42,
                          ),
                        ),
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
                          '+1 555 123 4567',
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
                      style: AeraTypography.bodySm.copyWith(
                        color: AeraColors.danger,
                      ),
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
                      style: AeraTypography.label.copyWith(
                        color: AeraColors.inkSoft,
                      ),
                    ),
                  ],
                  const SizedBox(height: 12),
                  if (_error != null)
                    Center(
                      child: TextButton(
                        onPressed: _load,
                        child: const Text('Retry loading company details'),
                      ),
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _stepHeader() => Row(
    children: [
      const Icon(Icons.circle, size: 8, color: AeraColors.accent),
      const SizedBox(width: 8),
      Text(
        'STEP 01 / 04 • BUSINESS PROFILE',
        style: AeraTypography.labelUpper.copyWith(
          color: AeraColors.accent,
          fontSize: 10,
        ),
      ),
      const Spacer(),
      Text('1 of 4', style: AeraTypography.label.copyWith(fontSize: 11)),
    ],
    );

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
