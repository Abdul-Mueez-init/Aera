import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import 'data/booking_repository.dart';

final teamAvailabilityProvider = FutureProvider.autoDispose<TeamAvailability>(
  (ref) => ref.watch(bookingRepositoryProvider).getTeamAvailability(),
);

/// Phase 5.6 — technician working hours and time off. Per-technician
/// hours override company business hours in the availability engine.
class TeamAvailabilityScreen extends ConsumerWidget {
  const TeamAvailabilityScreen({super.key});

  static const _days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final availability = ref.watch(teamAvailabilityProvider);
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: const AeraAppBar(
        title: 'Team availability',
        subtitle: 'Working hours and time off',
        showBrand: true,
      ),
      body: availability.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: Text(
            'Could not load team availability',
            style: AeraTypography.bodySm.copyWith(color: AeraColors.danger),
          ),
        ),
        data: (value) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('Technicians', style: AeraTypography.h3),
            const SizedBox(height: 8),
            if (value.technicians.isEmpty)
              Text('No active technicians', style: AeraTypography.bodySm)
            else
              for (final tech in value.technicians)
                Card(
                  child: ListTile(
                    title: Text(tech.name, style: AeraTypography.bodyMedium),
                    subtitle: Text(
                      tech.workingHours.isEmpty
                          ? 'Uses company business hours'
                          : tech.workingHours
                                .map(
                                  (h) =>
                                      '${_days[h.weekday]} ${h.open}–${h.close}',
                                )
                                .join(' · '),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => _editHours(context, ref, tech),
                  ),
                ),
            const SizedBox(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Upcoming time off', style: AeraTypography.h3),
                TextButton.icon(
                  onPressed: () => _addTimeOff(context, ref, value),
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('Add'),
                ),
              ],
            ),
            if (value.timeOff.isEmpty)
              Text('No upcoming time off', style: AeraTypography.bodySm)
            else
              for (final entry in value.timeOff)
                Card(
                  child: ListTile(
                    dense: true,
                    title: Text(_fmtRange(entry)),
                    subtitle: entry.reason == null ? null : Text(entry.reason!),
                    trailing: IconButton(
                      icon: const Icon(Icons.delete_outline, size: 20),
                      onPressed: () async {
                        await ref
                            .read(bookingRepositoryProvider)
                            .deleteTimeOff(entry.id);
                        ref.invalidate(teamAvailabilityProvider);
                      },
                    ),
                  ),
                ),
          ],
        ),
      ),
    );
  }

  String _fmtRange(TimeOff entry) {
    String d(DateTime v) =>
        '${v.month}/${v.day} ${v.hour.toString().padLeft(2, '0')}:${v.minute.toString().padLeft(2, '0')}';
    return '${d(entry.startsAt.toLocal())} – ${d(entry.endsAt.toLocal())}';
  }

  Future<void> _editHours(
    BuildContext context,
    WidgetRef ref,
    TeamTechnician tech,
  ) async {
    final hours = <int, BusinessHour>{
      for (final h in tech.workingHours) h.weekday: h,
    };
    final saved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: Text(tech.name),
          content: SizedBox(
            width: double.maxFinite,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  for (var day = 0; day < 7; day++)
                    Row(
                      children: [
                        SizedBox(
                          width: 40,
                          child: Text(
                            _days[day],
                            style: const TextStyle(fontSize: 13),
                          ),
                        ),
                        Switch(
                          value: hours.containsKey(day),
                          onChanged: (on) => setState(() {
                            if (on) {
                              hours[day] = BusinessHour(
                                weekday: day,
                                open: '09:00',
                                close: '17:00',
                              );
                            } else {
                              hours.remove(day);
                            }
                          }),
                        ),
                        if (hours.containsKey(day)) ...[
                          SizedBox(
                            width: 70,
                            child: TextFormField(
                              key: ValueKey('topen-$day-${hours[day]!.open}'),
                              initialValue: hours[day]!.open,
                              decoration: const InputDecoration(
                                isDense: true,
                                hintText: '09:00',
                              ),
                              onChanged: (v) => setState(() {
                                hours[day] = BusinessHour(
                                  weekday: day,
                                  open: v.trim(),
                                  close: hours[day]!.close,
                                );
                              }),
                            ),
                          ),
                          const Padding(
                            padding: EdgeInsets.symmetric(horizontal: 4),
                            child: Text('–'),
                          ),
                          SizedBox(
                            width: 70,
                            child: TextFormField(
                              key: ValueKey('tclose-$day-${hours[day]!.close}'),
                              initialValue: hours[day]!.close,
                              decoration: const InputDecoration(
                                isDense: true,
                                hintText: '17:00',
                              ),
                              onChanged: (v) => setState(() {
                                hours[day] = BusinessHour(
                                  weekday: day,
                                  open: hours[day]!.open,
                                  close: v.trim(),
                                );
                              }),
                            ),
                          ),
                        ],
                      ],
                    ),
                  const SizedBox(height: 8),
                  const Text(
                    'Leave all days off to use company business hours.',
                    style: TextStyle(fontSize: 12, color: AeraColors.inkSoft),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(dialogContext, true),
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
    if (saved != true || !context.mounted) return;
    try {
      await ref
          .read(bookingRepositoryProvider)
          .setTechnicianWorkingHours(tech.userId, hours.values.toList());
      ref.invalidate(teamAvailabilityProvider);
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not save working hours')),
        );
      }
    }
  }

  Future<void> _addTimeOff(
    BuildContext context,
    WidgetRef ref,
    TeamAvailability value,
  ) async {
    if (value.technicians.isEmpty) return;
    var technicianId = value.technicians.first.userId;
    final reason = TextEditingController();
    final now = DateTime.now();
    DateTime? start;
    DateTime? end;
    final saved = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: const Text('Add time off'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                initialValue: technicianId,
                items: value.technicians
                    .map(
                      (t) => DropdownMenuItem(
                        value: t.userId,
                        child: Text(t.name),
                      ),
                    )
                    .toList(),
                onChanged: (v) =>
                    setState(() => technicianId = v ?? technicianId),
              ),
              const SizedBox(height: 8),
              OutlinedButton(
                onPressed: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: now.add(const Duration(days: 1)),
                    firstDate: now,
                    lastDate: now.add(const Duration(days: 365)),
                  );
                  if (picked != null) {
                    setState(
                      () => start = DateTime(
                        picked.year,
                        picked.month,
                        picked.day,
                        0,
                      ),
                    );
                  }
                },
                child: Text(
                  start == null
                      ? 'Start date'
                      : 'Start: ${start!.month}/${start!.day}',
                ),
              ),
              const SizedBox(height: 8),
              OutlinedButton(
                onPressed: () async {
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: now.add(const Duration(days: 2)),
                    firstDate: now,
                    lastDate: now.add(const Duration(days: 365)),
                  );
                  if (picked != null) {
                    setState(
                      () => end = DateTime(
                        picked.year,
                        picked.month,
                        picked.day,
                        23,
                        59,
                      ),
                    );
                  }
                },
                child: Text(
                  end == null ? 'End date' : 'End: ${end!.month}/${end!.day}',
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: reason,
                decoration: const InputDecoration(
                  labelText: 'Reason (optional)',
                  isDense: true,
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogContext, false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: (start == null || end == null)
                  ? null
                  : () => Navigator.pop(dialogContext, true),
              child: const Text('Save'),
            ),
          ],
        ),
      ),
    );
    if (saved != true || start == null || end == null || !context.mounted) {
      return;
    }
    try {
      await ref
          .read(bookingRepositoryProvider)
          .createTimeOff(
            technicianId: technicianId,
            startsAt: start!,
            endsAt: end!,
            reason: reason.text.trim().isEmpty ? null : reason.text.trim(),
          );
      ref.invalidate(teamAvailabilityProvider);
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Could not add time off')));
      }
    }
  }
}
