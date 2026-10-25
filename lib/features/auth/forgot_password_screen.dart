import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/network/api_response.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_text_field.dart';
import 'data/auth_repository.dart';

class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() =>
      _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _emailController = TextEditingController();
  bool _codeDispatched = false;
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _sendCode() async {
    final email = _emailController.text.trim();
    if (email.isEmpty || !email.contains('@')) {
      setState(() => _error = 'Enter the work email for your account.');
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await ref.read(authRepositoryProvider).requestPasswordReset(email);
      if (!mounted) return;
      setState(() => _codeDispatched = true);
      // Carry the entered email to the reset screen so the code can be
      // submitted against the same address.
      context.push('/reset-password?email=${Uri.encodeComponent(email)}');
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) {
        setState(
          () => _error = 'Could not send the code. Check your connection.',
        );
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: const AeraAppBar(title: 'Reset Password', showBrand: true),
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
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AeraTextField(
                    label: 'Work Email',
                    hintText: 'name@company.com',
                    controller: _emailController,
                    keyboardType: TextInputType.emailAddress,
                    prefixIcon: const Icon(
                      Icons.alternate_email,
                      size: 20,
                      color: AeraColors.outline,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      const Icon(
                        Icons.verified_user,
                        size: 14,
                        color: AeraColors.accent,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        'Single sign-on protected company domain',
                        style: AeraTypography.bodySm.copyWith(fontSize: 12),
                      ),
                    ],
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
                  const SizedBox(height: 22),
                  AeraButton(
                    text: 'Send Verification Code',
                    icon: const Icon(
                      Icons.arrow_forward,
                      size: 18,
                      color: Colors.white,
                    ),
                    isLoading: _sending,
                    onPressed: _sending ? null : _sendCode,
                  ),
                ],
              ),
            ),

            if (_codeDispatched) ...[
              const SizedBox(height: 16),
              AeraCard(
                backgroundColor: AeraColors.successSoft,
                borderColor: AeraColors.success.withValues(alpha: 0.3),
                padding: const EdgeInsets.all(14),
                child: Row(
                  children: [
                    const Icon(
                      Icons.check_circle,
                      color: AeraColors.success,
                      size: 20,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
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
              backgroundColor: AeraColors.surfaceSubtle.withValues(alpha: 0.6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: AeraColors.surface,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(
                      Icons.support_agent,
                      color: AeraColors.accent,
                      size: 18,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
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
