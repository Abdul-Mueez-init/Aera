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

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _emailController =
      TextEditingController(text: 'marcus@apexheatingcooling.com');
  final _passwordController = TextEditingController(text: 'password123');
  bool _obscurePassword = true;
  bool _rememberDevice = true;
  bool _isLoading = false;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text;
    if (email.isEmpty || password.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter your email and password')),
      );
      return;
    }
    setState(() => _isLoading = true);
    try {
      await ref.read(authNotifierProvider.notifier).login(email, password);
      if (mounted) {
        setState(() => _isLoading = false);
        context.go('/dashboard');
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        final msg = e is ApiException
            ? e.message
            : 'Login failed: check your email/password or server connection.';
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
        title: 'Sign In',
        showBrand: true,
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          children: [
            // Status / Security Badge Banner
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: AeraColors.accentSoft,
                borderRadius: AeraRadii.borderFull,
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 7,
                        height: 7,
                        decoration: const BoxDecoration(
                          color: AeraColors.success,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'OPERATIONAL CLOUD • V2.4',
                        style: AeraTypography.labelUpper.copyWith(
                          color: AeraColors.accent,
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                  Row(
                    children: [
                      const Icon(Icons.verified_user, size: 14, color: AeraColors.accent),
                      const SizedBox(width: 4),
                      Text(
                        'Secured',
                        style: AeraTypography.label.copyWith(
                          color: AeraColors.inkSoft,
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Headline Section
            Row(
              children: [
                Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    color: AeraColors.accentSoft,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const Icon(Icons.lock_open, color: AeraColors.accent, size: 16),
                ),
                const SizedBox(width: 8),
                Text(
                  'FIELD & DISPATCH PORTAL',
                  style: AeraTypography.labelUpper.copyWith(
                    color: AeraColors.accent,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              'Welcome back',
              style: AeraTypography.display.copyWith(fontSize: 28),
            ),
            const SizedBox(height: 6),
            Text(
              'Sign in to access your dispatch operations, live crew tracking, and commercial workflows.',
              style: AeraTypography.bodySm.copyWith(
                color: AeraColors.inkSoft,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 24),

            // Auth Card
            AeraCard(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AeraTextField(
                    label: 'Work Email',
                    hintText: 'e.g. marcus@apexheatingcooling.com',
                    controller: _emailController,
                    keyboardType: TextInputType.emailAddress,
                    prefixIcon: const Icon(Icons.mail_outline, size: 20, color: AeraColors.outline),
                  ),
                  const SizedBox(height: 18),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'Password',
                            style: AeraTypography.label.copyWith(
                              color: AeraColors.inkSoft,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          GestureDetector(
                            onTap: () => context.push('/forgot-password'),
                            child: Text(
                              'Forgot password?',
                              style: AeraTypography.label.copyWith(
                                color: AeraColors.accent,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      TextFormField(
                        controller: _passwordController,
                        obscureText: _obscurePassword,
                        style: AeraTypography.body.copyWith(fontSize: 15),
                        decoration: InputDecoration(
                          prefixIcon: const Icon(Icons.key_outlined, size: 20, color: AeraColors.outline),
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
                    ],
                  ),
                  const SizedBox(height: 16),

                  // Remember device checkbox
                  InkWell(
                    onTap: () => setState(() => _rememberDevice = !_rememberDevice),
                    child: Row(
                      children: [
                        SizedBox(
                          width: 22,
                          height: 22,
                          child: Checkbox(
                            value: _rememberDevice,
                            activeColor: AeraColors.accent,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
                            onChanged: (val) => setState(() => _rememberDevice = val ?? true),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          'Remember this device for 30 days',
                          style: AeraTypography.bodySm.copyWith(
                            color: AeraColors.inkSoft,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 22),

                  // Submit CTA
                  AeraButton(
                    text: 'Sign In to Workspace',
                    isLoading: _isLoading,
                    icon: const Icon(Icons.arrow_forward, size: 18, color: Colors.white),
                    onPressed: _handleLogin,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // SSO Container
            AeraCard(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              backgroundColor: AeraColors.surfaceSubtle.withOpacity(0.7),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: AeraColors.surface,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(Icons.corporate_fare, color: AeraColors.inkSoft, size: 20),
                      ),
                      const SizedBox(width: 12),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Single Sign-On (SSO)',
                            style: AeraTypography.h3.copyWith(
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          Text(
                            'Okta, Azure AD, or Google',
                            style: AeraTypography.bodySm.copyWith(fontSize: 12),
                          ),
                        ],
                      ),
                    ],
                  ),
                  OutlinedButton(
                    style: OutlinedButton.styleFrom(
                      backgroundColor: AeraColors.surface,
                      side: const BorderSide(color: AeraColors.line),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    ),
                    onPressed: _handleLogin,
                    child: Text(
                      'Continue',
                      style: AeraTypography.label.copyWith(
                        color: AeraColors.ink,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Sign Up link
            Center(
              child: GestureDetector(
                onTap: () => context.push('/sign-up'),
                child: RichText(
                  text: TextSpan(
                    text: "Don't have a workspace? ",
                    style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
                    children: [
                      TextSpan(
                        text: 'Create account',
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
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }
}
