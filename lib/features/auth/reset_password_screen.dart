import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';

class ResetPasswordScreen extends StatefulWidget {
  const ResetPasswordScreen({super.key});

  @override
  State<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends State<ResetPasswordScreen> {
  final _passwordController =
      TextEditingController(text: 'ApexCraftsman2025!');
  final _confirmController =
      TextEditingController(text: 'ApexCraftsman2025!');
  bool _obscure1 = true;
  bool _obscure2 = true;

  @override
  void dispose() {
    _passwordController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: const AeraAppBar(
        title: 'Reset Password',
        showBrand: true,
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          children: [
            // Verified Badge Banner
            AeraCard(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 32,
                        height: 32,
                        decoration: const BoxDecoration(
                          color: AeraColors.accentSoft,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.verified_user, color: AeraColors.accent, size: 18),
                      ),
                      const SizedBox(width: 10),
                      Column(
                        crossAxisAlignment: CrossAlignment.start,
                        children: [
                          Text(
                            'ACCOUNT RECOVERY',
                            style: AeraTypography.labelUpper.copyWith(fontSize: 10),
                          ),
                          Text(
                            'marcus@apexheating.com',
                            style: AeraTypography.bodySm.copyWith(
                              fontWeight: FontWeight.w600,
                              color: AeraColors.ink,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: AeraColors.successSoft,
                      borderRadius: AeraRadii.borderFull,
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.check_circle, color: AeraColors.success, size: 14),
                        const SizedBox(width: 4),
                        Text(
                          'Verified',
                          style: AeraTypography.label.copyWith(
                            color: AeraColors.success,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            Text(
              'Set new password',
              style: AeraTypography.display.copyWith(fontSize: 26),
            ),
            const SizedBox(height: 6),
            Text(
              'Create a resilient credential to secure your dispatch console and field tickets.',
              style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
            ),
            const SizedBox(height: 24),

            AeraCard(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAlignment.start,
                children: [
                  // New password
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'New Password',
                        style: AeraTypography.label.copyWith(
                          color: AeraColors.inkSoft,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Row(
                        children: [
                          Container(
                            width: 6,
                            height: 6,
                            decoration: const BoxDecoration(
                              color: AeraColors.success,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            'Strong',
                            style: AeraTypography.label.copyWith(
                              color: AeraColors.success,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  TextFormField(
                    controller: _passwordController,
                    obscureText: _obscure1,
                    style: AeraTypography.body.copyWith(fontSize: 15),
                    decoration: InputDecoration(
                      suffixIcon: IconButton(
                        icon: Icon(
                          _obscure1 ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                          size: 20,
                          color: AeraColors.outline,
                        ),
                        onPressed: () => setState(() => _obscure1 = !_obscure1),
                      ),
                      filled: true,
                      fillColor: AeraColors.surface,
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Password Checklist
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AeraColors.surfaceSubtle.withOpacity(0.7),
                      borderRadius: AeraRadii.borderMd,
                    ),
                    child: Column(
                      children: [
                        _checklistRow('8 or more characters'),
                        const SizedBox(height: 6),
                        _checklistRow('At least one number or special symbol'),
                        const SizedBox(height: 6),
                        _checklistRow('Distinct from previous passwords'),
                      ],
                    ),
                  ),
                  const SizedBox(height: 18),

                  // Confirm Password
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Confirm New Password',
                        style: AeraTypography.label.copyWith(
                          color: AeraColors.inkSoft,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Row(
                        children: [
                          const Icon(Icons.check, size: 14, color: AeraColors.success),
                          const SizedBox(width: 4),
                          Text(
                            'Passwords match',
                            style: AeraTypography.label.copyWith(
                              color: AeraColors.success,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  TextFormField(
                    controller: _confirmController,
                    obscureText: _obscure2,
                    style: AeraTypography.body.copyWith(fontSize: 15),
                    decoration: InputDecoration(
                      suffixIcon: IconButton(
                        icon: Icon(
                          _obscure2 ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                          size: 20,
                          color: AeraColors.outline,
                        ),
                        onPressed: () => setState(() => _obscure2 = !_obscure2),
                      ),
                      filled: true,
                      fillColor: AeraColors.surface,
                    ),
                  ),
                  const SizedBox(height: 24),

                  AeraButton(
                    text: 'Save Password & Sign In',
                    icon: const Icon(Icons.arrow_forward, size: 18, color: Colors.white),
                    onPressed: () => context.go('/login'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _checklistRow(String rule) {
    return Row(
      children: [
        Container(
          width: 16,
          height: 16,
          decoration: const BoxDecoration(
            color: AeraColors.successSoft,
            shape: BoxShape.circle,
          ),
          child: const Icon(Icons.check, size: 11, color: AeraColors.success),
        ),
        const SizedBox(width: 8),
        Text(
          rule,
          style: AeraTypography.bodySm.copyWith(
            fontSize: 12,
            color: AeraColors.ink,
          ),
        ),
      ],
    );
  }
}
