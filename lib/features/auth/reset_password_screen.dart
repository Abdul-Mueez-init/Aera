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

/// Step 2 of password recovery: the emailed code plus a new password.
///
/// A successful reset signs the user out everywhere (the server revokes every
/// session), so this screen sends them to Sign In rather than logging them in.
class ResetPasswordScreen extends ConsumerStatefulWidget {
  const ResetPasswordScreen({super.key, this.initialEmail});

  final String? initialEmail;

  @override
  ConsumerState<ResetPasswordScreen> createState() =>
      _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends ConsumerState<ResetPasswordScreen> {
  static const int _minPasswordLength = 12;

  late final TextEditingController _emailController;
  final _codeController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmController = TextEditingController();
  bool _obscure = true;
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _emailController = TextEditingController(text: widget.initialEmail ?? '');
  }

  @override
  void dispose() {
    _emailController.dispose();
    _codeController.dispose();
    _passwordController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(backgroundColor: AeraColors.danger, content: Text(message)),
    );
  }

  String _messageFor(Object error) {
    if (error is ApiException) {
      if (error.code == 'PASSWORD_RESET_INVALID_OR_EXPIRED') {
        return 'That code is wrong or has expired. Check the email, or go '
            'back and request a new code.';
      }
      if (error.statusCode == 429) {
        return 'Too many attempts. Please wait a few minutes and try again.';
      }
      return error.message;
    }
    return 'Could not reach the server. Check your internet connection and try again.';
  }

  Future<void> _handleReset() async {
    final email = _emailController.text.trim();
    final code = _codeController.text.trim();
    final password = _passwordController.text;
    final confirm = _confirmController.text;

    if (email.isEmpty || !email.contains('@')) {
      _showError('Please enter your email address');
      return;
    }
    if (code.isEmpty) {
      _showError('Please enter the code from your email');
      return;
    }
    if (password.length < _minPasswordLength) {
      _showError('Password must be at least $_minPasswordLength characters');
      return;
    }
    if (password != confirm) {
      _showError('The two passwords do not match');
      return;
    }

    setState(() => _isLoading = true);
    try {
      await ref
          .read(authRepositoryProvider)
          .resetPassword(email: email, code: code, password: password);
      if (!mounted) return;
      setState(() => _isLoading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Password changed. Sign in with your new password.'),
        ),
      );
      context.go('/login');
    } catch (error) {
      if (!mounted) return;
      setState(() => _isLoading = false);
      _showError(_messageFor(error));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: const AeraAppBar(title: 'Choose a new password', showBrand: true),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          children: [
            const SizedBox(height: 8),
            Text(
              'Enter your code',
              style: AeraTypography.display.copyWith(fontSize: 26),
            ),
            const SizedBox(height: 6),
            Text(
              'If an account exists for that email, a code is on its way. '
              'It works once and expires in 30 minutes.',
              style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
            ),
            const SizedBox(height: 24),
            AeraCard(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AeraTextField(
                    label: 'Email',
                    hintText: 'name@company.com',
                    controller: _emailController,
                    keyboardType: TextInputType.emailAddress,
                    prefixIcon: const Icon(Icons.mail_outline, size: 20),
                  ),
                  const SizedBox(height: 16),
                  AeraTextField(
                    label: 'Code from your email',
                    hintText: 'XXXXX-XXXXX',
                    controller: _codeController,
                    keyboardType: TextInputType.text,
                    prefixIcon: const Icon(Icons.pin_outlined, size: 20),
                  ),
                  const SizedBox(height: 16),
                  AeraTextField(
                    label: 'New password',
                    hintText: 'At least $_minPasswordLength characters',
                    controller: _passwordController,
                    obscureText: _obscure,
                    prefixIcon: const Icon(Icons.lock_outline, size: 20),
                    suffixIcon: IconButton(
                      icon: Icon(
                        _obscure
                            ? Icons.visibility_outlined
                            : Icons.visibility_off_outlined,
                        size: 20,
                      ),
                      onPressed: () => setState(() => _obscure = !_obscure),
                    ),
                  ),
                  const SizedBox(height: 16),
                  AeraTextField(
                    label: 'Confirm new password',
                    controller: _confirmController,
                    obscureText: _obscure,
                    prefixIcon: const Icon(Icons.lock_outline, size: 20),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    'Changing your password signs you out on every device.',
                    style: AeraTypography.label.copyWith(
                      color: AeraColors.outline,
                    ),
                  ),
                  const SizedBox(height: 20),
                  AeraButton(
                    text: 'Change password',
                    isLoading: _isLoading,
                    onPressed: _isLoading ? null : _handleReset,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Center(
              child: TextButton(
                onPressed: () => context.go(
                  Uri(
                    path: '/forgot-password',
                    queryParameters: {
                      if (_emailController.text.trim().isNotEmpty)
                        'email': _emailController.text.trim(),
                    },
                  ).toString(),
                ),
                child: Text(
                  'Request a new code',
                  style: AeraTypography.bodySm.copyWith(
                    color: AeraColors.accent,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
            Center(
              child: TextButton(
                onPressed: () => context.go('/login'),
                child: Text(
                  'Back to sign in',
                  style: AeraTypography.bodySm.copyWith(
                    color: AeraColors.inkSoft,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
