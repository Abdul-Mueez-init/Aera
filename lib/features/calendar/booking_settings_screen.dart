import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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
  String _mode = 'DISPATCHER_CONFIRMS';
  int _buffer = 0;
  bool _saving = false;

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
                                businessHours: value.businessHours,
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
            ],
          );
        },
      ),
    );
  }
}
