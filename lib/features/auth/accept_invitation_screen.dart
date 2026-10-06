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
import 'providers/auth_provider.dart';

/// Lets an invited team member join a company: invitation code + password.
///
/// Public route (no session needed). On success the router sends the user to
/// their role's home screen, so this screen never navigates by itself.
class AcceptInvitationScreen extends ConsumerStatefulWidget {
  const AcceptInvitationScreen({super.key, this.initialToken});

  /// Pre-fills the code field (used if the code arrives as `?token=`).
  final String? initialToken;

  @override
  ConsumerState<AcceptInvitationScreen> createState() =>
      _AcceptInvitationScreenState();
}

class _AcceptInvitationScreenState
    extends ConsumerState<AcceptInvitationScreen> {
  static const int _minPasswordLength = 12;

  late final TextEditingController _tokenController;
  final _passwordController = TextEditingController();
  final _confirmController = TextEditingController();
  bool _obscure = true;
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _tokenController = TextEditingController(text: widget.initialToken ?? '');
  }

  @override
  void dispose() {
    _tokenController.dispose();
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
      if (error.code == 'INVITATION_INVALID_OR_EXPIRED') {
        return 'This invitation code is invalid, already used, or has expired. '
            'Ask your manager for a new one.';
      }
      if (error.statusCode == 429) {
        return 'Too many attempts. Please wait a few minutes and try again.';
      }
      return error.message;
    }
    return 'Could not reach the server. Check your internet connection and try again.';
  }

  Future<void> _handleAccept() async {
    final token = _tokenController.text.trim();
    final password = _passwordController.text;
    final confirm = _confirmController.text;

    if (token.isEmpty) {
      _showError('Please enter your invitation code');
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
          .read(authNotifierProvider.notifier)
          .acceptInvitation(token: token, password: password);
      // No navigation here: once the session exists the router redirects to
      // the Dashboard (owner/dispatcher) or Technician Home (technician).
      if (mounted) setState(() => _isLoading = false);
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        _showError(_messageFor(e));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: const AeraAppBar(title: 'Join your team', showBrand: true),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          children: [
            const SizedBox(height: 8),
            Text(
              'Accept your invitation',
              style: AeraTypography.display.copyWith(fontSize: 26),
            ),
            const SizedBox(height: 6),
            Text(
              'Enter the code your manager sent you and choose a password.',
              style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
            ),
            const SizedBox(height: 24),
            AeraCard(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AeraTextField(
                    label: 'Invitation code',
                    hintText: 'Paste the code here',
                    controller: _tokenController,
                    keyboardType: TextInputType.text,
                    prefixIcon: const Icon(Icons.vpn_key_outlined, size: 20),
                  ),
                  const SizedBox(height: 16),
                  AeraTextField(
                    label: 'Password',
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
                    label: 'Confirm password',
                    controller: _confirmController,
                    obscureText: _obscure,
                    prefixIcon: const Icon(Icons.lock_outline, size: 20),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    'Already have an Aera account with this email? Enter your '
                    'existing password to join this company.',
                    style: AeraTypography.label.copyWith(
                      color: AeraColors.outline,
                    ),
                  ),
                  const SizedBox(height: 20),
                  AeraButton(
                    text: 'Join team',
                    isLoading: _isLoading,
                    onPressed: _isLoading ? null : _handleAccept,
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
