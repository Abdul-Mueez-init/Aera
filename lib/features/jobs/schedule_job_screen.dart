import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/network/api_response.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';
import 'data/jobs_repository.dart';
import 'providers/jobs_provider.dart';

class _TimeSlot {
  const _TimeSlot(
    this.label,
    this.startHour,
    this.startMinute,
    this.endHour,
    this.endMinute,
  );
  final String label;
  final int startHour;
  final int startMinute;
  final int endHour;
  final int endMinute;
}

const _slots = <_TimeSlot>[
  _TimeSlot('09:00 - 11:00', 9, 0, 11, 0),
  _TimeSlot('14:00 - 16:00', 14, 0, 16, 0),
  _TimeSlot('16:30 - 18:30', 16, 30, 18, 30),
];

class ScheduleJobScreen extends ConsumerStatefulWidget {
  const ScheduleJobScreen({super.key, required this.jobId});

  final String jobId;

  @override
  ConsumerState<ScheduleJobScreen> createState() => _ScheduleJobScreenState();
}

class _ScheduleJobScreenState extends ConsumerState<ScheduleJobScreen> {
  int _selectedDay = 0;
  int _selectedSlot = 1;
  String? _selectedTechnicianId;
  bool _initializedFromJob = false;
  bool _submitting = false;

  late final List<DateTime> _days = List.generate(
    5,
    (i) => DateTime.now().add(Duration(days: i)),
  );

  Future<void> _confirm(Job job) async {
    final day = _days[_selectedDay];
    final slot = _slots[_selectedSlot];
    final scheduledStart = DateTime(
      day.year,
      day.month,
      day.day,
      slot.startHour,
      slot.startMinute,
    );
    final scheduledEnd = DateTime(
      day.year,
      day.month,
      day.day,
      slot.endHour,
      slot.endMinute,
    );

    setState(() => _submitting = true);
    try {
      final repo = ref.read(jobsRepositoryProvider);
      final result = await repo.scheduleJob(
        job.id,
        scheduledStart: scheduledStart,
        scheduledEnd: scheduledEnd,
        reschedule: job.status == 'SCHEDULED',
      );

      if (_selectedTechnicianId != job.assignedTechnician?.id) {
        await repo.assignTechnician(job.id, _selectedTechnicianId);
      }

      ref.invalidate(jobsListProvider);
      ref.invalidate(jobDetailProvider(job.id));

      if (mounted) {
        final warningText = result.warnings.isNotEmpty
            ? ' — heads up: technician has ${result.warnings.length} overlapping job(s)'
            : '';
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Job dispatched$warningText')));
        context.go('/dashboard');
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(e.message)));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Could not schedule job')));
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final jobAsync = ref.watch(jobDetailProvider(widget.jobId));
    final techniciansAsync = ref.watch(techniciansProvider);

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AeraAppBar(
        title: 'Schedule Dispatch',
        subtitle: jobAsync.maybeWhen(
          data: (job) => 'Order #${job.jobNumber}',
          orElse: () => null,
        ),
        showBrand: true,
      ),
      body: SafeArea(
        child: jobAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.error_outline,
                    size: 48,
                    color: AeraColors.warning,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    error is ApiException
                        ? error.message
                        : 'Could not load this job',
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 16),
                  FilledButton(
                    onPressed: () =>
                        ref.invalidate(jobDetailProvider(widget.jobId)),
                    child: const Text('Retry'),
                  ),
                ],
              ),
            ),
          ),
          data: (job) {
            if (!_initializedFromJob) {
              _selectedTechnicianId = job.assignedTechnician?.id;
              _initializedFromJob = true;
            }

            return ListView(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              children: [
                // Job Context Banner
                AeraCard(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Row(
                          children: [
                            Container(
                              width: 40,
                              height: 40,
                              decoration: BoxDecoration(
                                color: AeraColors.accentSoft,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: const Icon(
                                Icons.hvac,
                                color: AeraColors.accent,
                                size: 22,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    job.customer.fullName,
                                    style: AeraTypography.h3.copyWith(
                                      fontSize: 15,
                                    ),
                                  ),
                                  Text(
                                    '${job.serviceAddress.city} · ${job.serviceType}',
                                    style: AeraTypography.bodySm.copyWith(
                                      fontSize: 11,
                                    ),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: AeraColors.warningSoft,
                          borderRadius: AeraRadii.borderFull,
                        ),
                        child: Text(
                          job.priority,
                          style: AeraTypography.label.copyWith(
                            color: AeraColors.warning,
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // Step 1: Date
                Row(
                  children: [
                    _stepBadge('1'),
                    const SizedBox(width: 8),
                    Text(
                      'Select Service Date',
                      style: AeraTypography.h3.copyWith(fontSize: 15),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: List.generate(_days.length, (index) {
                    final day = _days[index];
                    return Expanded(
                      child: Padding(
                        padding: EdgeInsets.only(
                          right: index == _days.length - 1 ? 0 : 8,
                        ),
                        child: _dayChip(day, index),
                      ),
                    );
                  }),
                ),
                const SizedBox(height: 20),

                // Step 2: Time slot
                Row(
                  children: [
                    _stepBadge('2'),
                    const SizedBox(width: 8),
                    Text(
                      'Arrival Window',
                      style: AeraTypography.h3.copyWith(fontSize: 15),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                ...List.generate(_slots.length, (index) {
                  final slot = _slots[index];
                  final isSelected = _selectedSlot == index;
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: AeraCard(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 12,
                      ),
                      backgroundColor: isSelected
                          ? AeraColors.accentSoft
                          : AeraColors.surface,
                      borderColor: isSelected
                          ? AeraColors.accent
                          : AeraColors.line,
                      onTap: () => setState(() => _selectedSlot = index),
                      child: Row(
                        children: [
                          Icon(
                            Icons.schedule,
                            size: 18,
                            color: isSelected
                                ? AeraColors.accent
                                : AeraColors.inkSoft,
                          ),
                          const SizedBox(width: 10),
                          Text(
                            slot.label,
                            style: AeraTypography.bodyMedium.copyWith(
                              fontWeight: FontWeight.w700,
                              color: isSelected
                                  ? AeraColors.accent
                                  : AeraColors.ink,
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                }),
                const SizedBox(height: 20),

                // Step 3: Technician
                Row(
                  children: [
                    _stepBadge('3'),
                    const SizedBox(width: 8),
                    Text(
                      'Assign Lead Technician',
                      style: AeraTypography.h3.copyWith(fontSize: 15),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                techniciansAsync.when(
                  loading: () => const Padding(
                    padding: EdgeInsets.symmetric(vertical: 12),
                    child: Center(
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  ),
                  error: (error, _) => Text(
                    error is ApiException
                        ? error.message
                        : 'Could not load technicians',
                    style: AeraTypography.bodySm.copyWith(
                      color: AeraColors.danger,
                    ),
                  ),
                  data: (technicians) {
                    if (technicians.isEmpty) {
                      return Text(
                        'No active technicians on this company yet',
                        style: AeraTypography.bodySm,
                      );
                    }
                    return Column(
                      children: technicians
                          .map(
                            (tech) => Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: _techOption(tech),
                            ),
                          )
                          .toList(),
                    );
                  },
                ),
                const SizedBox(height: 24),

                AeraButton(
                  text: _submitting
                      ? 'Dispatching...'
                      : 'Confirm Dispatch & Alert Crew',
                  icon: _submitting
                      ? null
                      : const Icon(
                          Icons.send_rounded,
                          size: 18,
                          color: Colors.white,
                        ),
                  isLoading: _submitting,
                  onPressed: _submitting ? null : () => _confirm(job),
                ),
                const SizedBox(height: 20),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _stepBadge(String number) {
    return Container(
      width: 20,
      height: 20,
      decoration: const BoxDecoration(
        color: AeraColors.primary,
        shape: BoxShape.circle,
      ),
      child: Center(
        child: Text(
          number,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 11,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
    );
  }

  Widget _dayChip(DateTime day, int index) {
    final isSelected = _selectedDay == index;
    return InkWell(
      onTap: () => setState(() => _selectedDay = index),
      borderRadius: AeraRadii.borderMd,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? AeraColors.primary : AeraColors.surface,
          borderRadius: AeraRadii.borderMd,
          border: Border.all(
            color: isSelected ? Colors.transparent : AeraColors.line,
          ),
        ),
        child: Column(
          children: [
            Text(
              DateFormat('EEE').format(day).toUpperCase(),
              style: AeraTypography.label.copyWith(
                fontSize: 10,
                color: isSelected ? Colors.white70 : AeraColors.inkSoft,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              '${day.day}',
              style: AeraTypography.bodyMedium.copyWith(
                fontWeight: FontWeight.w700,
                color: isSelected ? Colors.white : AeraColors.ink,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _techOption(Technician tech) {
    final isSelected = _selectedTechnicianId == tech.id;
    return AeraCard(
      padding: const EdgeInsets.all(12),
      backgroundColor: isSelected ? AeraColors.accentSoft : AeraColors.surface,
      borderColor: isSelected ? AeraColors.accent : AeraColors.line,
      onTap: () => setState(() => _selectedTechnicianId = tech.id),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 18,
                backgroundColor: isSelected
                    ? AeraColors.accent
                    : AeraColors.surfaceSubtle,
                child: Text(
                  tech.initials,
                  style: TextStyle(
                    color: isSelected ? Colors.white : AeraColors.ink,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    tech.fullName,
                    style: AeraTypography.bodyMedium.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  if (tech.email != null)
                    Text(
                      tech.email!,
                      style: AeraTypography.label.copyWith(
                        color: AeraColors.inkSoft,
                        fontSize: 10,
                      ),
                    ),
                ],
              ),
            ],
          ),
          Radio<String>(
            value: tech.id,
            groupValue: _selectedTechnicianId,
            activeColor: AeraColors.accent,
            onChanged: (val) => setState(() => _selectedTechnicianId = val),
          ),
        ],
      ),
    );
  }
}
