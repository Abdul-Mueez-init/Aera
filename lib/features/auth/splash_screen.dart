import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import 'providers/auth_provider.dart';

class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> {
  @override
  void initState() {
    super.initState();
    // Reading the provider starts restoring any saved login from the device.
    ref.read(authNotifierProvider);
    _routeAfterSplash();
  }

  Future<void> _routeAfterSplash() async {
    // Keep the brand visible briefly.
    await Future<void>.delayed(const Duration(milliseconds: 1500));

    // Wait (up to 5 seconds) for the saved session to finish loading.
    var waitedMs = 0;
    while (mounted &&
        ref.read(authNotifierProvider).isLoading &&
        waitedMs < 5000) {
      await Future<void>.delayed(const Duration(milliseconds: 100));
      waitedMs += 100;
    }

    if (!mounted) return;
    final session = ref.read(authNotifierProvider).value;
    context.go(session != null ? '/dashboard' : '/welcome');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: AeraColors.surfaceSubtle.withValues(alpha: 0.8),
                  borderRadius: AeraRadii.borderXl,
                  border: Border.all(color: AeraColors.line, width: 0.5),
                ),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 28,
                    vertical: 20,
                  ),
                  decoration: BoxDecoration(
                    color: AeraColors.surface,
                    borderRadius: AeraRadii.borderLg,
                    boxShadow: const [
                      BoxShadow(
                        color: Color.fromRGBO(0, 0, 0, 0.04),
                        blurRadius: 8,
                        offset: Offset(0, 2),
                      ),
                    ],
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: AeraColors.accent,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Icon(
                          Icons.ac_unit,
                          color: Colors.white,
                          size: 22,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Text(
                        'AERA',
                        style: AeraTypography.display.copyWith(
                          fontSize: 26,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 2.0,
                          color: AeraColors.ink,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),
              Text(
                'FIELD SERVICE OPERATIONS',
                style: AeraTypography.labelUpper.copyWith(
                  fontSize: 10.5,
                  color: AeraColors.inkSoft,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 32),
              SizedBox(
                width: 150,
                height: 2.5,
                child: ClipRRect(
                  borderRadius: AeraRadii.borderFull,
                  child: const LinearProgressIndicator(
                    backgroundColor: AeraColors.surfaceContainerHighest,
                    valueColor: AlwaysStoppedAnimation<Color>(
                      AeraColors.accent,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
