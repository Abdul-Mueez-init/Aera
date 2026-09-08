import 'dart:async';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _progressController;

  @override
  void initState() {
    super.initState();
    _progressController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2200),
    )..repeat();

    // Auto-advance to welcome screen after 2.5s
    Timer(const Duration(milliseconds: 2500), () {
      if (mounted) {
        context.go('/welcome');
      }
    });
  }

  @override
  void dispose() {
    _progressController.dispose();
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
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              // Top telemetry row
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 7,
                        height: 7,
                        decoration: const BoxDecoration(
                          color: AeraColors.accent,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        'TELEMETRY ACTIVE',
                        style: AeraTypography.labelUpper.copyWith(
                          color: AeraColors.inkSoft,
                          fontSize: 10,
                        ),
                      ),
                    ],
                  ),
                  Row(
                    children: [
                      const Icon(Icons.lock_outline, size: 14, color: AeraColors.inkSoft),
                      const SizedBox(width: 4),
                      Text(
                        'ENCRYPTED',
                        style: AeraTypography.labelUpper.copyWith(
                          color: AeraColors.inkSoft,
                          fontSize: 10,
                        ),
                      ),
                    ],
                  ),
                ],
              ),

              // Center Brand & System Identity
              Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: AeraColors.surfaceSubtle.withOpacity(0.8),
                      borderRadius: AeraRadii.borderXl,
                      border: Border.all(color: AeraColors.line, width: 0.5),
                    ),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 20),
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
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(width: 16, height: 1, color: AeraColors.line),
                      const SizedBox(width: 10),
                      Text(
                        'FIELD SERVICE OPERATING SYSTEM',
                        style: AeraTypography.labelUpper.copyWith(
                          fontSize: 10.5,
                          color: AeraColors.inkSoft,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Container(width: 16, height: 1, color: AeraColors.line),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Industrial HVAC & Thermal Systems',
                    style: AeraTypography.bodySm.copyWith(
                      color: AeraColors.secondary,
                    ),
                  ),
                  const SizedBox(height: 24),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                    decoration: BoxDecoration(
                      color: AeraColors.accentSoft.withOpacity(0.7),
                      borderRadius: AeraRadii.borderFull,
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.ac_unit, size: 14, color: AeraColors.accent),
                        const SizedBox(width: 6),
                        Text(
                          'Precision Climate Dispatch',
                          style: AeraTypography.label.copyWith(
                            color: AeraColors.accent,
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),

              // Bottom Progress Loader & State
              Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(
                    width: 150,
                    height: 2.5,
                    child: ClipRRect(
                      borderRadius: AeraRadii.borderFull,
                      child: LinearProgressIndicator(
                        backgroundColor: AeraColors.surfaceContainerHighest,
                        valueColor: const AlwaysStoppedAnimation<Color>(AeraColors.accent),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: 150,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Calibrating routes',
                          style: AeraTypography.bodySm.copyWith(
                            fontSize: 11,
                            color: AeraColors.inkSoft.withOpacity(0.7),
                          ),
                        ),
                        Text(
                          '94%',
                          style: AeraTypography.label.copyWith(
                            fontSize: 11,
                            color: AeraColors.accent,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
