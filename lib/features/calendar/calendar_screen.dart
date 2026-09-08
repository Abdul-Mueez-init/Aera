import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_card.dart';

class CalendarScreen extends StatefulWidget {
  const CalendarScreen({super.key});

  @override
  State<CalendarScreen> createState() => _CalendarScreenState();
}

class _CalendarScreenState extends State<CalendarScreen> {
  int _selectedDayIndex = 0;
  String _selectedView = 'Timeline';

  final List<String> _days = ['Mon 7', 'Tue 8', 'Wed 9', 'Thu 10', 'Fri 11', 'Sat 12'];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AppBar(
        backgroundColor: AeraColors.surface.withOpacity(0.85),
        elevation: 0,
        scrolledUnderElevation: 1,
        title: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: AeraColors.accent,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.ac_unit, color: Colors.white, size: 18),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('AERA HVAC', style: AeraTypography.labelUpper.copyWith(fontSize: 9)),
                Text('Schedule', style: AeraTypography.h3.copyWith(fontSize: 16, fontWeight: FontWeight.w700)),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_outlined, color: AeraColors.ink, size: 22),
            onPressed: () => context.push('/notifications'),
          ),
          IconButton(
            icon: CircleAvatar(
              radius: 14,
              backgroundColor: AeraColors.primary,
              child: const Icon(Icons.person, color: Colors.white, size: 16),
            ),
            onPressed: () => context.push('/profile-settings'),
          ),
          const SizedBox(width: 8),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AeraColors.accent,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add, size: 20),
        label: Text(
          'Schedule Job',
          style: AeraTypography.bodyMedium.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
        ),
        onPressed: () => context.push('/schedule-job'),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          children: [
            // Date Navigator & View Switcher
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(Icons.chevron_left, color: AeraColors.inkSoft),
                    const SizedBox(width: 4),
                    Text(
                      'Sep 2025 · Week 37',
                      style: AeraTypography.h3.copyWith(fontSize: 16, fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(width: 4),
                    const Icon(Icons.chevron_right, color: AeraColors.inkSoft),
                  ],
                ),
                Container(
                  padding: const EdgeInsets.all(2),
                  decoration: BoxDecoration(
                    color: AeraColors.surfaceSubtle,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    children: [
                      _viewToggleOption('Lanes'),
                      _viewToggleOption('Timeline'),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),

            // Day Scroller Bar
            Row(
              children: List.generate(_days.length, (index) {
                final isSelected = _selectedDayIndex == index;
                final parts = _days[index].split(' ');
                return Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 2),
                    child: InkWell(
                      onTap: () => setState(() => _selectedDayIndex = index),
                      borderRadius: AeraRadii.borderMd,
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        decoration: BoxDecoration(
                          color: isSelected ? AeraColors.accent : AeraColors.surface,
                          borderRadius: AeraRadii.borderMd,
                          border: Border.all(
                            color: isSelected ? Colors.transparent : AeraColors.line,
                          ),
                        ),
                        child: Column(
                          children: [
                            Text(
                              parts[0].toUpperCase(),
                              style: AeraTypography.label.copyWith(
                                fontSize: 10,
                                color: isSelected ? Colors.white70 : AeraColors.inkSoft,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              parts[1],
                              style: AeraTypography.bodyMedium.copyWith(
                                fontWeight: FontWeight.w700,
                                color: isSelected ? Colors.white : AeraColors.ink,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Container(
                              width: 4,
                              height: 4,
                              decoration: BoxDecoration(
                                color: isSelected ? AeraColors.successSoft : (index == 0 ? AeraColors.accent : Colors.transparent),
                                shape: BoxShape.circle,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              }),
            ),
            const SizedBox(height: 14),

            // Smart Dispatch Helper Callout
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AeraColors.surfaceSubtle,
                borderRadius: AeraRadii.borderMd,
              ),
              child: Row(
                children: [
                  const Icon(Icons.auto_awesome, color: AeraColors.accent, size: 18),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAlignment.start,
                      children: [
                        Text(
                          'Intelligent Travel Buffers Active',
                          style: AeraTypography.label.copyWith(fontWeight: FontWeight.w700, color: AeraColors.ink),
                        ),
                        Text(
                          'Drag or tap appointments to reassign. Travel buffers update in real-time.',
                          style: AeraTypography.bodySm.copyWith(fontSize: 11, color: AeraColors.inkSoft),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Hourly Timeline Entries
            _timelineSlot('09:00', [
              _appointmentCard(
                title: 'Morning Briefing & Van Stock Audit',
                time: '08:30 - 09:30',
                tech: 'Central Hub Dispatch',
                status: 'Completed',
                color: AeraColors.success,
                softColor: AeraColors.successSoft,
              ),
            ]),
            _travelBuffer('18 min transit · Gulberg ➔ Cantt'),
            _timelineSlot('10:00', [
              _appointmentCard(
                title: 'Bhatti Medical Plaza (Chiller Maintenance)',
                time: '10:00 - 12:30',
                tech: 'James Miller • Van #2',
                status: 'In Progress',
                color: AeraColors.accent,
                softColor: AeraColors.accentSoft,
              ),
            ]),
            _travelBuffer('22 min transit · Cantt ➔ DHA Phase 5'),
            _timelineSlot('14:00', [
              _appointmentCard(
                title: 'Sarah Khan (AC Not Cooling)',
                time: '14:00 - 15:30',
                tech: 'Ahmed Raza • Van #4',
                status: 'At Risk · +28m',
                color: AeraColors.warning,
                softColor: AeraColors.warningSoft,
                onTap: () => context.push('/jobs/JOB-8492'),
              ),
            ]),
            _travelBuffer('15 min transit · DHA Phase 5 ➔ Phase 6'),
            _timelineSlot('16:00', [
              _appointmentCard(
                title: 'Dr. Tariq Parvez (Inverter PCB)',
                time: '16:00 - 17:30',
                tech: 'Omar Khan • Van #1',
                status: 'Scheduled',
                color: AeraColors.info,
                softColor: AeraColors.infoSoft,
              ),
            ]),
            const SizedBox(height: 60),
          ],
        ),
      ),
    );
  }

  Widget _viewToggleOption(String label) {
    final isSelected = _selectedView == label;
    return InkWell(
      onTap: () => setState(() => _selectedView = label),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: isSelected ? AeraColors.surface : Colors.transparent,
          borderRadius: BorderRadius.circular(6),
          boxShadow: isSelected ? const [BoxShadow(color: Colors.black12, blurRadius: 2)] : null,
        ),
        child: Text(
          label,
          style: AeraTypography.label.copyWith(
            fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
            color: isSelected ? AeraColors.ink : AeraColors.inkSoft,
          ),
        ),
      ),
    );
  }

  Widget _timelineSlot(String hour, List<Widget> items) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAlignment.start,
        children: [
          SizedBox(
            width: 44,
            child: Text(
              hour,
              style: AeraTypography.label.copyWith(
                fontWeight: FontWeight.w700,
                color: AeraColors.inkSoft,
              ),
            ),
          ),
          Expanded(
            child: Column(children: items),
          ),
        ],
      ),
    );
  }

  Widget _travelBuffer(String text) {
    return Padding(
      padding: const EdgeInsets.only(left: 44, top: 4, bottom: 8),
      child: Row(
        children: [
          Container(
            width: 8,
            height: 1,
            color: AeraColors.outline,
          ),
          const SizedBox(width: 6),
          const Icon(Icons.directions_car_outlined, size: 13, color: AeraColors.accent),
          const SizedBox(width: 4),
          Text(
            text,
            style: AeraTypography.bodySm.copyWith(
              fontSize: 10.5,
              color: AeraColors.accent,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  Widget _appointmentCard({
    required String title,
    required String time,
    required String tech,
    required String status,
    required Color color,
    required Color softColor,
    VoidCallback? onTap,
  }) {
    return AeraCard(
      padding: const EdgeInsets.all(12),
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                time,
                style: AeraTypography.label.copyWith(fontWeight: FontWeight.w700),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: softColor,
                  borderRadius: AeraRadii.borderFull,
                ),
                child: Text(
                  status,
                  style: AeraTypography.label.copyWith(
                    color: color,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            title,
            style: AeraTypography.bodyMedium.copyWith(fontWeight: FontWeight.w700, color: AeraColors.ink),
          ),
          const SizedBox(height: 4),
          Row(
            children: [
              const Icon(Icons.person_pin, size: 14, color: AeraColors.inkSoft),
              const SizedBox(width: 4),
              Text(
                tech,
                style: AeraTypography.bodySm.copyWith(fontSize: 11, color: AeraColors.inkSoft),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
