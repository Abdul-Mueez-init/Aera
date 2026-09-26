import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';

class ServicesScreen extends StatefulWidget {
  const ServicesScreen({super.key});

  @override
  State<ServicesScreen> createState() => _ServicesScreenState();
}

class _ServicesScreenState extends State<ServicesScreen> {
  final Set<String> _selectedServices = {};
  static const String _servicesKey = 'onboarding_services';

  final List<_ServiceItem> _services = const [
    _ServiceItem('AC Repair', 'High Demand', Icons.toys_outlined),
    _ServiceItem('AC Installation', 'System Replacements', Icons.hvac),
    _ServiceItem('Preventive Maintenance', 'Annual Tune-ups', Icons.published_with_changes),
    _ServiceItem('Emergency Diagnostics', '24/7 Rapid Response', Icons.warning_amber),
    _ServiceItem('Duct Cleaning & Sealing', 'Indoor Air Quality', Icons.air),
    _ServiceItem('Thermostat & Controls', 'Smart Systems', Icons.thermostat),
    _ServiceItem('Commercial Chillers', 'VRF & Industrial', Icons.severe_cold),
    _ServiceItem('Refrigerant Leak Repair', 'Pressure & Gas Testing', Icons.plumbing),
  ];

  @override
  void initState() {
    super.initState();
    _loadSavedServices();
  }

  Future<void> _loadSavedServices() async {
    final prefs = await SharedPreferences.getInstance();
    final savedServices = prefs.getStringList(_servicesKey);
    if (savedServices != null) {
      setState(() {
        _selectedServices.addAll(savedServices);
      });
    }
  }

  Future<void> _saveServices() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_servicesKey, _selectedServices.toList());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: const AeraAppBar(
        title: 'Service Offerings',
        subtitle: 'Step 03 / 04',
        showBrand: true,
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          children: [
            // Progress Header
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
                      'STEP 03 / 04 • SERVICE OFFERINGS',
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
                    'Setup 75%',
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
                _progressSegment(true),
                const SizedBox(width: 6),
                _progressSegment(false),
              ],
            ),
            const SizedBox(height: 20),

            Text(
              'Select your active services',
              style: AeraTypography.display.copyWith(fontSize: 26),
            ),
            const SizedBox(height: 4),
            Text(
              'Choose the heating and cooling services your crew performs. You can customize pricing and parts later.',
              style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
            ),
            const SizedBox(height: 20),

            // Quick toolbar
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Text(
                      'POPULAR PRESETS',
                      style: AeraTypography.labelUpper.copyWith(fontSize: 10),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: AeraColors.accentSoft,
                        borderRadius: AeraRadii.borderFull,
                      ),
                      child: Text(
                        'Residential',
                        style: AeraTypography.label.copyWith(
                          color: AeraColors.accent,
                          fontSize: 11,
                        ),
                      ),
                    ),
                  ],
                ),
                TextButton.icon(
                  onPressed: () {
                    setState(() {
                      if (_selectedServices.length == _services.length) {
                        _selectedServices.clear();
                      } else {
                        _selectedServices.addAll(_services.map((s) => s.title));
                      }
                    });
                    _saveServices();
                  },
                  icon: const Icon(Icons.done_all, size: 16, color: AeraColors.accent),
                  label: Text(
                    _selectedServices.length == _services.length ? 'Clear all' : 'Select all (8)',
                    style: AeraTypography.label.copyWith(
                      color: AeraColors.accent,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Services Grid
            ..._services.map((service) {
              final isSelected = _selectedServices.contains(service.title);

              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: AeraCard(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  backgroundColor: isSelected ? AeraColors.accentSoft.withOpacity(0.6) : AeraColors.surface,
                  borderColor: isSelected ? AeraColors.accent : AeraColors.line,
                  borderRadius: AeraRadii.borderMd,
                  onTap: () {
                    setState(() {
                      if (isSelected) {
                        _selectedServices.remove(service.title);
                      } else {
                        _selectedServices.add(service.title);
                      }
                    });
                    _saveServices();
                  },
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 40,
                            height: 40,
                            decoration: BoxDecoration(
                              color: AeraColors.surface,
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(color: AeraColors.line),
                            ),
                            child: Icon(service.icon, color: AeraColors.accent, size: 20),
                          ),
                          const SizedBox(width: 12),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                service.title,
                                style: AeraTypography.h3.copyWith(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                service.subtitle,
                                style: AeraTypography.label.copyWith(
                                  color: AeraColors.accent,
                                  fontSize: 11,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                      Container(
                        width: 24,
                        height: 24,
                        decoration: BoxDecoration(
                          color: isSelected ? AeraColors.accent : Colors.transparent,
                          border: Border.all(
                            color: isSelected ? AeraColors.accent : AeraColors.outline,
                            width: 1.5,
                          ),
                          shape: BoxShape.circle,
                        ),
                        child: isSelected
                            ? const Icon(Icons.check, size: 14, color: Colors.white)
                            : null,
                      ),
                    ],
                  ),
                ),
              );
            }),
            const SizedBox(height: 20),

            AeraButton(
              text: 'Continue to Team Setup (${_selectedServices.length} Selected)',
              icon: const Icon(Icons.arrow_forward, size: 18, color: Colors.white),
              onPressed: () => context.push('/onboarding/team-setup'),
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
}

class _ServiceItem {
  const _ServiceItem(this.title, this.subtitle, this.icon);
  final String title;
  final String subtitle;
  final IconData icon;
}
