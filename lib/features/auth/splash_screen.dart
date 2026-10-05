import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/router/route_guard.dart';

class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> {
  /// Keep the brand visible at least this long, even if the session check
  /// finishes instantly.
  static const _minimumBrandTime = Duration(milliseconds: 1200);

  Timer? _timer;

  @override
  void initState() {
    super.initState();
    // The splash does not navigate. The router (route_guard.dart) keeps the
    // user here while the saved session is being checked and sends them to
    // the right place once it knows. This timer only opens the "minimum
    // brand time" gate; the router does the rest.
    _timer = Timer(_minimumBrandTime, () {
      if (!mounted) return;
      ref.read(splashGateProvider.notifier).state = true;
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
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
