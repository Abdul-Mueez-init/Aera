import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';

class ServiceAreaScreen extends StatefulWidget {
  const ServiceAreaScreen({super.key});

  @override
  State<ServiceAreaScreen> createState() => _ServiceAreaScreenState();
}

class _ServiceAreaScreenState extends State<ServiceAreaScreen> {
  double _radiusKm = 35.0;
  final Set<String> _selectedZones = {
    'Gulberg & Cantt',
    'DHA Phases 1-8',
    'Johar Town & Model Town',
  };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: const AeraAppBar(
        title: 'Service Territory',
        subtitle: 'Step 02 / 04',
        showBrand: true,
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          children: [
            // Stepper Header
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Container(
                      width: 6,
                      height: 6,
                      decoration: const BoxDecoration(
                        color: AeraColors.accent,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      'STEP 02 / 04 • SERVICE TERRITORY',
                      style: AeraTypography.labelUpper.copyWith(
                        color: AeraColors.accent,
                        fontSize: 10,
                      ),
                    ),
                  ],
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: AeraColors.surface,
                    borderRadius: AeraRadii.borderFull,
                    border: Border.all(color: AeraColors.line),
                  ),
                  child: Text(
                    '50% Complete',
                    style: AeraTypography.label.copyWith(fontSize: 11),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),

            // 4 Progress Segments
            Row(
              children: [
                _progressSegment(true),
                const SizedBox(width: 6),
                _progressSegment(true),
                const SizedBox(width: 6),
                _progressSegment(false),
                const SizedBox(width: 6),
                _progressSegment(false),
              ],
            ),
            const SizedBox(height: 20),

            // Headline
            Text(
              'Define your service territory',
              style: AeraTypography.display.copyWith(fontSize: 26),
            ),
            const SizedBox(height: 4),
            Text(
              'Set your dispatch radius to automatically qualify job requests and optimize technician travel times.',
              style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
            ),
            const SizedBox(height: 20),

            // Territory Map Simulation Card
            Container(
              height: 200,
              decoration: BoxDecoration(
                color: const Color(0xFF2D3748),
                borderRadius: AeraRadii.borderLg,
                border: Border.all(color: AeraColors.line),
                boxShadow: const [
                  BoxShadow(
                    color: Color.fromRGBO(0, 0, 0, 0.05),
                    offset: Offset(0, 2),
                    blurRadius: 8,
                  ),
                ],
              ),
              child: Stack(
                alignment: Alignment.center,
                children: [
                  // Center Radar Rings
                  Container(
                    width: 170,
                    height: 170,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: AeraColors.accent.withOpacity(0.18),
                      border: Border.all(color: AeraColors.accent.withOpacity(0.4), width: 1.5),
                    ),
                  ),
                  Container(
                    width: 90,
                    height: 90,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: AeraColors.accent.withOpacity(0.35),
                    ),
                  ),
                  // Center Pin
                  Container(
                    width: 32,
                    height: 32,
                    decoration: const BoxDecoration(
                      color: AeraColors.accent,
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black26,
                          blurRadius: 4,
                          offset: Offset(0, 2),
                        ),
                      ],
                    ),
                    child: const Icon(Icons.store, color: Colors.white, size: 16),
                  ),

                  // Top Status Pill
                  Positioned(
                    top: 12,
                    left: 12,
                    right: 12,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.92),
                            borderRadius: AeraRadii.borderFull,
                          ),
                          child: Row(
                            children: [
                              Container(
                                width: 6,
                                height: 6,
                                decoration: const BoxDecoration(
                                  color: AeraColors.success,
                                  shape: BoxShape.circle,
                                ),
                              ),
                              const SizedBox(width: 6),
                              Text(
                                'Dispatch Engine Active',
                                style: AeraTypography.label.copyWith(fontSize: 10),
                              ),
                            ],
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: Colors.white.withOpacity(0.92),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            'GPS Grid #042',
                            style: AeraTypography.label.copyWith(fontSize: 10),
                          ),
                        ),
                      ],
                    ),
                  ),

                  // Bottom Radius Status
                  Positioned(
                    bottom: 12,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.95),
                        borderRadius: AeraRadii.borderFull,
                        boxShadow: const [
                          BoxShadow(color: Colors.black12, blurRadius: 4),
                        ],
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.radar, size: 14, color: AeraColors.accent),
                          const SizedBox(width: 6),
                          Text(
                            'Serving within ${_radiusKm.toInt()} km radius • ~${(_radiusKm * 1.3).round()} min dispatch',
                            style: AeraTypography.label.copyWith(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: AeraColors.ink,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // Operating Hub Card
            AeraCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 36,
                        height: 36,
                        decoration: BoxDecoration(
                          color: AeraColors.surfaceSubtle,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(Icons.location_on, color: AeraColors.accent, size: 20),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Dispatch Headquarters',
                              style: AeraTypography.labelUpper.copyWith(
                                fontSize: 10,
                                color: AeraColors.inkSoft,
                              ),
                            ),
                            Text(
                              'Gulberg III, Main Boulevard, Lahore',
                              style: AeraTypography.h3.copyWith(
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  const Divider(color: AeraColors.line),
                  const SizedBox(height: 16),

                  // Radius Slider
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Maximum Response Radius',
                        style: AeraTypography.label.copyWith(fontWeight: FontWeight.w600),
                      ),
                      Text(
                        '${_radiusKm.toInt()} km',
                        style: AeraTypography.bodyMedium.copyWith(
                          fontWeight: FontWeight.w800,
                          color: AeraColors.accent,
                        ),
                      ),
                    ],
                  ),
                  Slider(
                    value: _radiusKm,
                    min: 10,
                    max: 80,
                    divisions: 14,
                    activeColor: AeraColors.accent,
                    inactiveColor: AeraColors.surfaceContainerHigh,
                    onChanged: (val) => setState(() => _radiusKm = val),
                  ),
                  const SizedBox(height: 8),

                  // Coverage Zones
                  Text(
                    'Active Neighborhood Zones',
                    style: AeraTypography.label.copyWith(fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _zoneChip('Gulberg & Cantt'),
                      _zoneChip('DHA Phases 1-8'),
                      _zoneChip('Johar Town & Model Town'),
                      _zoneChip('Raiwind Industrial Zone'),
                      _zoneChip('Bahria Town'),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            AeraButton(
              text: 'Save & Continue to Services',
              icon: const Icon(Icons.arrow_forward, size: 18, color: Colors.white),
              onPressed: () => context.push('/onboarding/services'),
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _progressSegment(bool isCompleted) {
    return Expanded(
      child: Container(
        height: 5,
        decoration: BoxDecoration(
          color: isCompleted ? AeraColors.accent : AeraColors.surfaceContainerHighest,
          borderRadius: AeraRadii.borderFull,
        ),
      ),
    );
  }

  Widget _zoneChip(String zone) {
    final isSelected = _selectedZones.contains(zone);

    return FilterChip(
      label: Text(zone),
      selected: isSelected,
      onSelected: (val) {
        setState(() {
          if (val) {
            _selectedZones.add(zone);
          } else {
            _selectedZones.remove(zone);
          }
        });
      },
      selectedColor: AeraColors.accentSoft,
      backgroundColor: AeraColors.surface,
      labelStyle: AeraTypography.label.copyWith(
        color: isSelected ? AeraColors.accent : AeraColors.ink,
        fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
      ),
      side: BorderSide(
        color: isSelected ? AeraColors.accent : AeraColors.line,
      ),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
    );
  }
}
