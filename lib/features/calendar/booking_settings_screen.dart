import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/network/api_response.dart';
import '../../core/theme/aera_colors.dart';
import 'data/booking_repository.dart';
import 'providers/booking_provider.dart';

class BookingSettingsScreen extends ConsumerStatefulWidget {
  const BookingSettingsScreen({super.key});

  @override
  ConsumerState<BookingSettingsScreen> createState() =>
      _BookingSettingsScreenState();
}

class _BookingSettingsScreenState extends ConsumerState<BookingSettingsScreen> {
  static const _weekdayLabels = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];

  String _mode = 'DISPATCHER_CONFIRMS';
  int _buffer = 0;
  bool _saving = false;
  bool _hoursLoaded = false;
  // weekday → configured hours; absent key = closed that day.
  final Map<int, BusinessHour> _hours = {};

  void _loadHours(BookingConfig config) {
    if (_hoursLoaded) return;
    _hoursLoaded = true;
    for (final hour in config.businessHours) {
      _hours[hour.weekday] = hour;
    }
  }

  List<BusinessHour> get _hoursPayload => _hours.values.toList();

  @override
  Widget build(BuildContext context) {
    final config = ref.watch(bookingConfigProvider);
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AppBar(title: const Text('Booking settings')),
      body: config.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: Text(
            error is ApiException
                ? error.message
                : 'Could not load booking settings',
          ),
        ),
        data: (value) {
          _loadHours(value);
          if (_buffer == 0 && value.travelBufferMinutes != 0) {
            _buffer = value.travelBufferMinutes;
          }
          if (_mode == 'DISPATCHER_CONFIRMS' &&
              value.bookingMode != 'DISPATCHER_CONFIRMS') {
            _mode = value.bookingMode;
          }
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(
                'Booking mode',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              DropdownButtonFormField<String>(
                initialValue: _mode,
                items: const [
                  DropdownMenuItem(
                    value: 'DISPATCHER_CONFIRMS',
                    child: Text('Dispatcher confirms'),
                  ),
                  DropdownMenuItem(
                    value: 'SELF_SERVE_WINDOWS',
                    child: Text('Customer chooses a window'),
                  ),
                ],
                onChanged: _saving
                    ? null
                    : (value) => setState(() => _mode = value!),
              ),
              const SizedBox(height: 16),
              TextFormField(
                initialValue: _buffer.toString(),
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Travel buffer (minutes)',
                ),
                onChanged: (value) => _buffer = int.tryParse(value) ?? 0,
              ),
              const SizedBox(height: 24),
              Text(
                'Business hours (${value.timezone})',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 4),
              const Text(
                'Days switched off are closed. Times are local wall-clock.',
                style: TextStyle(fontSize: 12, color: AeraColors.inkSoft),
              ),
              for (var day = 0; day < 7; day++)
                _BusinessHourRow(
                  label: _weekdayLabels[day],
                  hour: _hours[day],
                  enabled: _hours.containsKey(day),
                  onToggle: (on) => setState(() {
                    if (on) {
                      _hours[day] = BusinessHour(
                        weekday: day,
                        open: '09:00',
                        close: '17:00',
                      );
                    } else {
                      _hours.remove(day);
                    }
                  }),
                  onChanged: (open, close) => setState(() {
                    _hours[day] = BusinessHour(
                      weekday: day,
                      open: open,
                      close: close,
                    );
                  }),
                ),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: _saving
                    ? null
                    : () async {
                        setState(() => _saving = true);
                        try {
                          await ref
                              .read(bookingRepositoryProvider)
                              .updateConfig(
                                bookingMode: _mode,
                                travelBufferMinutes: _buffer,
                                businessHours: _hoursPayload,
                              );
                          ref.invalidate(bookingConfigProvider);
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('Booking settings saved'),
                              ),
                            );
                          }
                        } on ApiException catch (error) {
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text(error.message)),
                            );
                          }
                        } finally {
                          if (mounted) setState(() => _saving = false);
                        }
                      },
                child: Text(_saving ? 'Saving…' : 'Save settings'),
              ),
              const SizedBox(height: 16),
              Text('Company timezone: ${value.timezone}'),
              const SizedBox(height: 8),
              const Text(
                'Availability windows are calculated server-side using this timezone, working hours, time off, existing jobs and travel buffers.',
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: () => context.push('/team-availability'),
                icon: const Icon(Icons.badge_outlined, size: 18),
                label: const Text('Team working hours & time off'),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _BusinessHourRow extends StatelessWidget {
  const _BusinessHourRow({
    required this.label,
    required this.hour,
    required this.enabled,
    required this.onToggle,
    required this.onChanged,
  });

  final String label;
  final BusinessHour? hour;
  final bool enabled;
  final ValueChanged<bool> onToggle;
  final void Function(String open, String close) onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          SizedBox(
            width: 92,
            child: Text(label, style: const TextStyle(fontSize: 13)),
          ),
          Switch(
            value: enabled,
            onChanged: onToggle,
            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
          if (enabled) ...[
            SizedBox(
              width: 76,
              child: TextFormField(
                key: ValueKey('open-$label-${hour?.open}'),
                initialValue: hour?.open ?? '09:00',
                decoration: const InputDecoration(
                  isDense: true,
                  hintText: '09:00',
                ),
                onChanged: (value) =>
                    onChanged(value.trim(), hour?.close ?? '17:00'),
              ),
            ),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 6),
              child: Text('–'),
            ),
            SizedBox(
              width: 76,
              child: TextFormField(
                key: ValueKey('close-$label-${hour?.close}'),
                initialValue: hour?.close ?? '17:00',
                decoration: const InputDecoration(
                  isDense: true,
                  hintText: '17:00',
                ),
                onChanged: (value) =>
                    onChanged(hour?.open ?? '09:00', value.trim()),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
