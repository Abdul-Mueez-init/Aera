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

/// Step 1 of password recovery: ask for a reset code by email.
///
/// The server answers the same way for every address (so it cannot be used to
/// find out who has an account), so this screen never says "we sent an email
/// to you", only that one will arrive if the account exists.
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key, this.initialEmail});

  /// Pre-filled when the user comes from the sign-in screen.
  final String? initialEmail;

  @override
  ConsumerState<ForgotPasswordScreen> createState() =>
      _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  late final TextEditingController _emailController;
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _emailController = TextEditingController(text: widget.initialEmail ?? '');
  }

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(backgroundColor: AeraColors.danger, content: Text(message)),
    );
  }

  String _messageFor(Object error) {
    if (error is ApiException) {
      if (error.statusCode == 429) {
        return 'Too many requests. Please wait a few minutes and try again.';
      }
      return error.message;
    }
    return 'Could not reach the server. Check your internet connection and try again.';
  }

  Future<void> _handleSend() async {
    final email = _emailController.text.trim();
    if (email.isEmpty || !email.contains('@') || !email.contains('.')) {
      _showError('Please enter a valid email address');
      return;
    }

    setState(() => _isLoading = true);
    try {
      await ref.read(authRepositoryProvider).requestPasswordReset(email);
      if (!mounted) return;
      setState(() => _isLoading = false);
      context.go(
        Uri(
          path: '/reset-password',
          queryParameters: {'email': email},
        ).toString(),
      );
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
      appBar: const AeraAppBar(title: 'Reset password', showBrand: true),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          children: [
            const SizedBox(height: 8),
            Text(
              'Forgot your password?',
              style: AeraTypography.display.copyWith(fontSize: 26),
            ),
            const SizedBox(height: 6),
            Text(
              "Enter the email you sign in with. If it belongs to an account, "
              "we'll email you a code to choose a new password.",
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
                    prefixIcon: const Icon(
                      Icons.mail_outline,
                      size: 20,
                      color: AeraColors.outline,
                    ),
                  ),
                  const SizedBox(height: 20),
                  AeraButton(
                    text: 'Email me a code',
                    isLoading: _isLoading,
                    onPressed: _isLoading ? null : _handleSend,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Center(
              child: TextButton(
                onPressed: () => context.go('/login'),
                child: Text(
                  'Back to sign in',
                  style: AeraTypography.bodySm.copyWith(
                    color: AeraColors.accent,
                    fontWeight: FontWeight.w600,
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
