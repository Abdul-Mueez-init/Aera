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
import '../auth/providers/auth_provider.dart';
import 'data/onboarding_repository.dart';

class ServicesScreen extends ConsumerStatefulWidget {
  const ServicesScreen({super.key});
  @override
  ConsumerState<ServicesScreen> createState() => _ServicesScreenState();
}

class _ServiceOption {
  const _ServiceOption(
    this.key,
    this.name,
    this.description,
    this.iconKey,
    this.icon,
  );
  final String key;
  final String name;
  final String description;
  final String iconKey;
  final IconData icon;
}

const _catalogue = <_ServiceOption>[
  _ServiceOption(
    'ac_repair',
    'AC Repair',
    'Diagnostics and repair',
    'air_conditioning',
    Icons.ac_unit,
  ),
  _ServiceOption(
    'ac_installation',
    'AC Installation',
    'New systems and replacements',
    'tools',
    Icons.build_outlined,
  ),
  _ServiceOption(
    'preventive_maintenance',
    'Preventive Maintenance',
    'Inspection and tune-ups',
    'maintenance',
    Icons.settings_outlined,
  ),
  _ServiceOption(
    'emergency_diagnostics',
    'Emergency Diagnostics',
    'Urgent fault finding',
    'thermometer',
    Icons.warning_amber,
  ),
  _ServiceOption(
    'duct_cleaning_sealing',
    'Duct Cleaning & Sealing',
    'Indoor air and ductwork',
    'airflow',
    Icons.air,
  ),
  _ServiceOption(
    'thermostat_controls',
    'Thermostat & Controls',
    'Smart controls and thermostats',
    'thermostat',
    Icons.thermostat,
  ),
  _ServiceOption(
    'commercial_chillers',
    'Commercial Chillers',
    'Commercial cooling systems',
    'cooling',
    Icons.ac_unit,
  ),
  _ServiceOption(
    'refrigerant_leak_repair',
    'Refrigerant Leak Repair',
    'Leak detection and repair',
    'tools',
    Icons.plumbing,
  ),
];

class _ServicesScreenState extends ConsumerState<ServicesScreen> {
  final Map<String, OnboardingService> _selected = {};
  bool _loading = true;
  bool _saving = false;
  String? _error;

  IconData _iconForKey(String key) => switch (key) {
    'air_conditioning' => Icons.ac_unit,
    'cooling' => Icons.ac_unit,
    'heating' => Icons.local_fire_department,
    'thermometer' => Icons.thermostat,
    'airflow' => Icons.air,
    'thermostat' => Icons.thermostat,
    'maintenance' => Icons.settings_outlined,
    _ => Icons.build_outlined,
  };

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final profile = await ref.read(onboardingRepositoryProvider).getProfile();
      if (!mounted) return;
      for (final service in profile.services) {
        final key =
            service.serviceKey ?? 'custom:${service.name.toLowerCase()}';
        _selected[key] = service;
      }
      setState(() => _loading = false);
    } catch (error) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = error is ApiException
              ? error.message
              : 'Could not load saved services.';
        });
      }
    }
  }

  Future<OnboardingService?> _customServiceDialog({
    OnboardingService? existing,
  }) async {
    final controller = TextEditingController(text: existing?.name ?? '');
    String iconKey = existing?.iconKey ?? 'tools';
    final service = await showDialog<OnboardingService>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: Text(
            existing == null ? 'Add a custom service' : 'Edit service',
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: controller,
                autofocus: true,
                maxLength: 80,
                onChanged: (_) => setDialogState(() {}),
                decoration: const InputDecoration(
                  labelText: 'Service name',
                  hintText: 'e.g. Boiler commissioning',
                ),
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                initialValue: iconKey,
                decoration: const InputDecoration(labelText: 'Icon'),
                items: const [
                  DropdownMenuItem(
                    value: 'air_conditioning',
                    child: Text('Air conditioning'),
                  ),
                  DropdownMenuItem(value: 'cooling', child: Text('Cooling')),
                  DropdownMenuItem(value: 'heating', child: Text('Heating')),
                  DropdownMenuItem(
                    value: 'thermometer',
                    child: Text('Thermometer'),
                  ),
                  DropdownMenuItem(value: 'airflow', child: Text('Airflow')),
                  DropdownMenuItem(
                    value: 'thermostat',
                    child: Text('Thermostat'),
                  ),
                  DropdownMenuItem(value: 'tools', child: Text('Tools')),
                  DropdownMenuItem(
                    value: 'maintenance',
                    child: Text('Maintenance'),
                  ),
                ],
                onChanged: (value) =>
                    setDialogState(() => iconKey = value ?? 'tools'),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: controller.text.trim().isEmpty
                  ? null
                  : () {
                      final name = controller.text.trim();
                      Navigator.pop(
                        dialogContext,
                        OnboardingService(
                          name: name,
                          iconKey: iconKey,
                          isCustom: true,
                        ),
                      );
                    },
              child: Text(existing == null ? 'Add' : 'Save'),
            ),
          ],
        ),
      ),
    );
    controller.dispose();
    return service;
  }

  bool _duplicatesOtherService(String name, {String? excludeKey}) {
    final normalized = name.trim().toLowerCase();
    if (_catalogue.any((option) => option.name.toLowerCase() == normalized)) {
      return true;
    }
    return _selected.entries.any(
      (entry) =>
          entry.key != excludeKey &&
          entry.value.name.toLowerCase() == normalized,
    );
  }

  Future<void> _addCustomService() async {
    final service = await _customServiceDialog();
    if (service == null || !mounted) return;
    if (_duplicatesOtherService(service.name)) {
      setState(
        () => _error =
            'A service with that name already exists in the catalog or your selection.',
      );
      return;
    }
    setState(() {
      _error = null;
      _selected['custom:${service.name.toLowerCase()}'] = service;
    });
  }

  Future<void> _editCustomService(String key, OnboardingService current) async {
    final service = await _customServiceDialog(existing: current);
    if (service == null || !mounted) return;
    if (_duplicatesOtherService(service.name, excludeKey: key)) {
      setState(
        () => _error =
            'A service with that name already exists in the catalog or your selection.',
      );
      return;
    }
    setState(() {
      _error = null;
      _selected.remove(key);
      _selected['custom:${service.name.toLowerCase()}'] = service;
    });
  }

  Future<void> _saveAndContinue() async {
    if (_selected.isEmpty) {
      setState(
        () => _error =
            'Select at least one service your company actually performs.',
      );
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref
          .read(onboardingRepositoryProvider)
          .saveServices(_selected.values.toList());
      ref.invalidate(onboardingProfileProvider);
      await ref.read(authNotifierProvider.notifier).refreshServerIdentity();
      if (mounted) context.push('/onboarding/team-setup');
    } catch (error) {
      if (mounted) {
        setState(
          () => _error = error is ApiException
              ? error.message
              : 'Could not save selected services.',
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
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
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 12,
                ),
              children: [
                Row(
                  children: [
                      const Icon(
                        Icons.circle,
                        size: 8,
                        color: AeraColors.accent,
                      ),
                      const SizedBox(width: 8),
                    Text(
                      'STEP 03 / 04 • SERVICE OFFERINGS',
                      style: AeraTypography.labelUpper.copyWith(
                        color: AeraColors.accent,
                        fontSize: 10,
                      ),
                    ),
                      const Spacer(),
                      Text('${_selected.length} selected'),
                  ],
                ),
                  const SizedBox(height: 16),
            Text(
              'Select your active services',
              style: AeraTypography.display.copyWith(fontSize: 26),
            ),
            const SizedBox(height: 4),
            Text(
                    'Choose only services your crew performs. Add your own offerings when the catalog does not fit.',
                    style: AeraTypography.bodySm.copyWith(
                      color: AeraColors.inkSoft,
                        ),
                      ),
                  const SizedBox(height: 16),
                  ..._catalogue.map((option) {
                    final selected = _selected.containsKey(option.key);
              return Padding(
                      padding: const EdgeInsets.only(bottom: 9),
                child: AeraCard(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 12,
                        ),
                        backgroundColor: selected
                            ? AeraColors.accentSoft.withValues(alpha: 0.6)
                            : AeraColors.surface,
                        borderColor: selected
                            ? AeraColors.accent
                            : AeraColors.line,
                  borderRadius: AeraRadii.borderMd,
                        onTap: () => setState(() {
                          if (selected) {
                            _selected.remove(option.key);
                      } else {
                            _selected[option.key] = OnboardingService(
                              serviceKey: option.key,
                              name: option.name,
                              iconKey: option.iconKey,
                              isCustom: false,
                            );
                      }
                        }),
                  child: Row(
                        children: [
                            Icon(option.icon, color: AeraColors.accent),
                          const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                    option.name,
                                style: AeraTypography.h3.copyWith(
                                  fontSize: 15,
                                ),
                              ),
                              Text(
                                    option.description,
                                style: AeraTypography.label.copyWith(
                                      color: AeraColors.inkSoft,
                                ),
                              ),
                            ],
                          ),
                            ),
                            Checkbox(
                              value: selected,
                              onChanged: (value) => setState(() {
                                if (value == true) {
                                  _selected[option.key] = OnboardingService(
                                    serviceKey: option.key,
                                    name: option.name,
                                    iconKey: option.iconKey,
                                    isCustom: false,
                                  );
                                } else {
                                  _selected.remove(option.key);
                                }
                              }),
                            ),
                        ],
                      ),
                          ),
                    );
                  }),
                  OutlinedButton.icon(
                    onPressed: _addCustomService,
                    icon: const Icon(Icons.add),
                    label: const Text('Add a custom service'),
                  ),
                  ..._selected.entries
                      .where((entry) => entry.value.isCustom)
                      .map(
                        (entry) => ListTile(
                          leading: Icon(
                            _iconForKey(entry.value.iconKey),
                            color: AeraColors.accent,
                        ),
                          title: Text(entry.value.name),
                          subtitle: const Text('Custom service'),
                          trailing: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              IconButton(
                                tooltip: 'Edit custom service',
                                onPressed: () =>
                                    _editCustomService(entry.key, entry.value),
                                icon: const Icon(Icons.edit_outlined),
                              ),
                              IconButton(
                                tooltip: 'Remove custom service',
                                onPressed: () =>
                                    setState(() => _selected.remove(entry.key)),
                                icon: const Icon(Icons.delete_outline),
                      ),
                    ],
                  ),
                ),
            ),
                  if (_error != null) ...[
                    const SizedBox(height: 10),
                    Text(
                      _error!,
                      style: AeraTypography.bodySm.copyWith(
                        color: AeraColors.danger,
                      ),
                    ),
          ],
                  if (_selected.isEmpty) ...[
                    const SizedBox(height: 8),
                    Text(
                      'Select at least one service your company performs.',
                      textAlign: TextAlign.center,
                      style: AeraTypography.label.copyWith(
                        color: AeraColors.inkSoft,
        ),
      ),
                  ],
                  const SizedBox(height: 18),
                  AeraButton(
                    text: _saving
                        ? 'Saving…'
                        : 'Continue to Team Setup (${_selected.length} selected)',
                    icon: const Icon(
                      Icons.arrow_forward,
                      size: 18,
                      color: Colors.white,
                    ),
                    onPressed: _saving || _selected.isEmpty
                        ? null
                        : _saveAndContinue,
                  ),
                  const SizedBox(height: 20),
                ],
        ),
      ),
    );
  }
}
