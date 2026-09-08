import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_text_field.dart';

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _emailController = TextEditingController(text: 'marcus@apexheating.com');
  bool _codeDispatched = false;

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  void _sendCode() {
    setState(() => _codeDispatched = true);
    Future.delayed(const Duration(milliseconds: 900), () {
      if (mounted) {
        context.push('/reset-password');
      }
    });
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
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          children: [
            const SizedBox(height: 12),
            Center(
              child: Container(
                width: 64,
                height: 64,
                decoration: const BoxDecoration(
                  color: AeraColors.accentSoft,
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.mark_email_read_outlined,
                  size: 32,
                  color: AeraColors.accent,
                ),
              ),
            ),
            const SizedBox(height: 20),
            Text(
              'Reset your password',
              textAlign: TextAlign.center,
              style: AeraTypography.display.copyWith(fontSize: 24),
            ),
            const SizedBox(height: 8),
            Text(
              'Enter the work email associated with your Aera company account. We will send a secure verification code.',
              textAlign: TextAlign.center,
              style: AeraTypography.bodySm.copyWith(
                color: AeraColors.inkSoft,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 28),

            AeraCard(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAlignment.start,
                children: [
                  AeraTextField(
                    label: 'Work Email',
                    hintText: 'name@company.com',
                    controller: _emailController,
                    keyboardType: TextInputType.emailAddress,
                    prefixIcon: const Icon(Icons.alternate_email, size: 20, color: AeraColors.outline),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      const Icon(Icons.verified_user, size: 14, color: AeraColors.accent),
                      const SizedBox(width: 6),
                      Text(
                        'Single sign-on protected company domain',
                        style: AeraTypography.bodySm.copyWith(fontSize: 12),
                      ),
                    ],
                  ),
                  const SizedBox(height: 22),
                  AeraButton(
                    text: 'Send Verification Code',
                    icon: const Icon(Icons.arrow_forward, size: 18, color: Colors.white),
                    onPressed: _sendCode,
                  ),
                ],
              ),
            ),

            if (_codeDispatched) ...[
              const SizedBox(height: 16),
              AeraCard(
                backgroundColor: AeraColors.successSoft,
                borderColor: AeraColors.success.withOpacity(0.3),
                padding: const EdgeInsets.all(14),
                child: Row(
                  children: [
                    const Icon(Icons.check_circle, color: AeraColors.success, size: 20),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAlignment.start,
                        children: [
                          Text(
                            'Code dispatched',
                            style: AeraTypography.bodySm.copyWith(
                              fontWeight: FontWeight.w700,
                              color: AeraColors.ink,
                            ),
                          ),
                          Text(
                            'Check your inbox for a 6-digit confirmation PIN from Aera Systems.',
                            style: AeraTypography.bodySm.copyWith(
                              fontSize: 12,
                              color: AeraColors.inkSoft,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],

            const SizedBox(height: 24),
            AeraCard(
              padding: const EdgeInsets.all(16),
              backgroundColor: AeraColors.surfaceSubtle.withOpacity(0.6),
              child: Row(
                crossAxisAlignment: CrossAlignment.start,
                children: [
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: AeraColors.surface,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(Icons.support_agent, color: AeraColors.accent, size: 18),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAlignment.start,
                      children: [
                        Text(
                          'Having trouble?',
                          style: AeraTypography.h3.copyWith(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Technicians and staff can contact their company administrator directly to reset credentials.',
                          style: AeraTypography.bodySm.copyWith(
                            fontSize: 12,
                            color: AeraColors.inkSoft,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
