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
import 'data/auth_repository.dart';

class ResetPasswordScreen extends ConsumerStatefulWidget {
  const ResetPasswordScreen({super.key, this.email});

  /// The email the reset code was requested for, carried from the
  /// forgot-password screen as a route query parameter. The backend
  /// requires `{email, code, password}` for `POST /reset-password`.
  final String? email;

  @override
  ConsumerState<ResetPasswordScreen> createState() =>
      _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends ConsumerState<ResetPasswordScreen> {
  final _codeController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmController = TextEditingController();
  bool _obscure1 = true;
  bool _obscure2 = true;
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _codeController.dispose();
    _passwordController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final email = widget.email?.trim() ?? '';
    final code = _codeController.text.trim();
    final password = _passwordController.text;
    if (email.isEmpty) {
      setState(
        () =>
            _error = 'Missing email — go back and request a reset code first.',
      );
      return;
    }
    if (code.isEmpty) {
      setState(() => _error = 'Enter the verification code from your email.');
      return;
    }
    if (password.isEmpty) {
      setState(() => _error = 'Enter a new password.');
      return;
    }
    if (password != _confirmController.text) {
      setState(() => _error = 'Passwords do not match.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref
          .read(authRepositoryProvider)
          .resetPassword(email: email, code: code, password: password);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Password updated — sign in with your new password.'),
        ),
      );
      context.go('/login');
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) {
        setState(
          () => _error = 'Could not reset the password. Please try again.',
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final email = widget.email ?? '';
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: const AeraAppBar(title: 'Reset Password', showBrand: true),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          children: [
            // Account recovery banner — the email the code was sent to,
            // taken from the route (never hardcoded).
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
                        child: const Icon(
                          Icons.verified_user,
                          color: AeraColors.accent,
                          size: 18,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'ACCOUNT RECOVERY',
                            style: AeraTypography.labelUpper.copyWith(
                              fontSize: 10,
                            ),
                          ),
                          Text(
                            email,
                            style: AeraTypography.bodySm.copyWith(
                              fontWeight: FontWeight.w600,
                              color: AeraColors.ink,
                            ),
                          ),
                        ],
                      ),
                    ],
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
              'Enter the verification code from your email, then create a resilient credential to secure your dispatch console and field tickets.',
              style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
            ),
            const SizedBox(height: 24),

            AeraCard(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AeraTextField(
                    label: 'Verification Code',
                    hintText: '6-digit code from your email',
                    controller: _codeController,
                    keyboardType: TextInputType.number,
                    prefixIcon: const Icon(
                      Icons.pin_outlined,
                      size: 20,
                      color: AeraColors.outline,
                    ),
                  ),
                  const SizedBox(height: 18),

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
                          _obscure1
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
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
                      color: AeraColors.surfaceSubtle.withValues(alpha: 0.7),
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
                  Text(
                    'Confirm New Password',
                    style: AeraTypography.label.copyWith(
                      color: AeraColors.inkSoft,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 6),
                  TextFormField(
                    controller: _confirmController,
                    obscureText: _obscure2,
                    style: AeraTypography.body.copyWith(fontSize: 15),
                    decoration: InputDecoration(
                      suffixIcon: IconButton(
                        icon: Icon(
                          _obscure2
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
                          size: 20,
                          color: AeraColors.outline,
                        ),
                        onPressed: () => setState(() => _obscure2 = !_obscure2),
                      ),
                      filled: true,
                      fillColor: AeraColors.surface,
                    ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 16),
                    Text(
                      _error!,
                      style: AeraTypography.bodySm.copyWith(
                        color: AeraColors.danger,
                      ),
                    ),
                  ],
                  const SizedBox(height: 24),

                  AeraButton(
                    text: 'Save Password & Sign In',
                    icon: const Icon(
                      Icons.arrow_forward,
                      size: 18,
                      color: Colors.white,
                    ),
                    isLoading: _saving,
                    onPressed: _saving ? null : _submit,
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
