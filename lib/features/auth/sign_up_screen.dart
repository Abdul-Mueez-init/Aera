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
import 'providers/auth_provider.dart';

class SignUpScreen extends ConsumerStatefulWidget {
  const SignUpScreen({super.key});

  @override
  ConsumerState<SignUpScreen> createState() => _SignUpScreenState();
}

class _SignUpScreenState extends ConsumerState<SignUpScreen> {
  final _nameController = TextEditingController(text: 'Marcus Vance');
  final _emailController = TextEditingController(text: 'marcus@apexheating.com');
  final _companyController =
      TextEditingController(text: 'Apex Heating & Air Conditioning');
  final _passwordController = TextEditingController(text: 'secret123');
  String _selectedTeamSize = '4-10';
  bool _obscurePassword = true;
  bool _isLoading = false;

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _companyController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _handleSignUp() async {
    final fullName = _nameController.text.trim();
    final email = _emailController.text.trim();
    final companyName = _companyController.text.trim();
    final password = _passwordController.text;

    if (fullName.isEmpty || email.isEmpty || companyName.isEmpty || password.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please fill in all fields')),
      );
      return;
    }

    final parts = fullName.split(' ');
    final firstName = parts.first;
    final lastName = parts.length > 1 ? parts.sublist(1).join(' ') : 'Owner';

    setState(() => _isLoading = true);
    try {
      await ref.read(authNotifierProvider.notifier).register(
        email: email,
        password: password,
        firstName: firstName,
        lastName: lastName,
        companyName: companyName,
      );
      if (mounted) {
        setState(() => _isLoading = false);
        context.push('/onboarding/business-basics');
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        final msg = e is ApiException ? e.message : 'Registration failed. Check details.';
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            backgroundColor: AeraColors.danger,
            content: Text(msg),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: const AeraAppBar(
        title: 'Create Account',
        showBrand: true,
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          children: [
            // Stepper indicator
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AeraColors.accentSoft,
                    borderRadius: AeraRadii.borderFull,
                  ),
                  child: Row(
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
                        'STEP 1 OF 2',
                        style: AeraTypography.labelUpper.copyWith(
                          color: AeraColors.accent,
                          fontSize: 10,
                        ),
                      ),
                    ],
                  ),
                ),
                Text(
                  'Owner & Company Setup',
                  style: AeraTypography.bodySm.copyWith(
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),

            // Progress bar (50%)
            ClipRRect(
              borderRadius: AeraRadii.borderFull,
              child: LinearProgressIndicator(
                value: 0.5,
                backgroundColor: AeraColors.surfaceContainerHigh,
                valueColor: const AlwaysStoppedAnimation<Color>(AeraColors.accent),
                minHeight: 4,
              ),
            ),
            const SizedBox(height: 24),

            // Headline
            Text(
              'Create your HVAC workspace',
              style: AeraTypography.display.copyWith(fontSize: 26),
            ),
            const SizedBox(height: 6),
            Text(
              'Start your 14-day operational trial. No credit card required.',
              style: AeraTypography.bodySm.copyWith(
                color: AeraColors.secondary,
              ),
            ),
            const SizedBox(height: 24),

            // Registration Form
            AeraCard(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AeraTextField(
                    label: 'Owner / Manager Name',
                    hintText: 'e.g. Marcus Vance',
                    controller: _nameController,
                    prefixIcon: const Icon(Icons.person_outline, size: 20, color: AeraColors.outline),
                  ),
                  const SizedBox(height: 16),
                  AeraTextField(
                    label: 'Work Email Address',
                    hintText: 'name@company.com',
                    controller: _emailController,
                    keyboardType: TextInputType.emailAddress,
                    prefixIcon: const Icon(Icons.mail_outline, size: 20, color: AeraColors.outline),
                  ),
                  const SizedBox(height: 16),
                  AeraTextField(
                    label: 'Company / DBA Name',
                    hintText: 'e.g. Apex Mechanical',
                    controller: _companyController,
                    prefixIcon: const Icon(Icons.storefront_outlined, size: 20, color: AeraColors.outline),
                  ),
                  const SizedBox(height: 18),

                  // Team Size Selector
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Active Field Technicians',
                        style: AeraTypography.label.copyWith(
                          color: AeraColors.inkSoft,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Text(
                        'Scales automatically',
                        style: AeraTypography.bodySm.copyWith(
                          fontSize: 11,
                          color: AeraColors.outline,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      _teamSizePill('1–3', 'techs', '1-3'),
                      const SizedBox(width: 10),
                      _teamSizePill('4–10', 'techs', '4-10'),
                      const SizedBox(width: 10),
                      _teamSizePill('11–25+', 'techs', '11-25+'),
                    ],
                  ),
                  const SizedBox(height: 18),

                  // Password Field
                  Text(
                    'Create Password',
                    style: AeraTypography.label.copyWith(
                      color: AeraColors.inkSoft,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 6),
                  TextFormField(
                    controller: _passwordController,
                    obscureText: _obscurePassword,
                    style: AeraTypography.body.copyWith(fontSize: 15),
                    decoration: InputDecoration(
                      prefixIcon: const Icon(Icons.lock_outline, size: 20, color: AeraColors.outline),
                      suffixIcon: IconButton(
                        icon: Icon(
                          _obscurePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                          size: 20,
                          color: AeraColors.outline,
                        ),
                        onPressed: () {
                          setState(() => _obscurePassword = !_obscurePassword);
                        },
                      ),
                      filled: true,
                      fillColor: AeraColors.surface,
                    ),
                  ),
                  const SizedBox(height: 24),

                  // Continue button
                  AeraButton(
                    text: _isLoading ? 'Creating Workspace...' : 'Continue to Business Basics',
                    icon: _isLoading
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.arrow_forward, size: 18, color: Colors.white),
                    onPressed: _isLoading ? null : _handleSignUp,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // Already have account
            Center(
              child: GestureDetector(
                onTap: () => context.push('/login'),
                child: RichText(
                  text: TextSpan(
                    text: 'Already have a workspace? ',
                    style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
                    children: [
                      TextSpan(
                        text: 'Sign in',
                        style: AeraTypography.bodySm.copyWith(
                          color: AeraColors.accent,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _teamSizePill(String count, String label, String value) {
    final isSelected = _selectedTeamSize == value;

    return Expanded(
      child: InkWell(
        onTap: () => setState(() => _selectedTeamSize = value),
        borderRadius: AeraRadii.borderMd,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: isSelected ? AeraColors.accentSoft : AeraColors.surface,
            borderRadius: AeraRadii.borderMd,
            border: Border.all(
              color: isSelected ? AeraColors.accent : AeraColors.line,
              width: isSelected ? 1.5 : 1,
            ),
          ),
          child: Column(
            children: [
              Text(
                count,
                style: AeraTypography.bodyMedium.copyWith(
                  fontWeight: FontWeight.w700,
                  color: isSelected ? AeraColors.accent : AeraColors.ink,
                ),
              ),
              Text(
                label,
                style: AeraTypography.label.copyWith(
                  fontSize: 10,
                  color: isSelected ? AeraColors.accent : AeraColors.outline,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
