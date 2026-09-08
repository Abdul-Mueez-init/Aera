import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';

class ScheduleJobScreen extends StatefulWidget {
  const ScheduleJobScreen({super.key});

  @override
  State<ScheduleJobScreen> createState() => _ScheduleJobScreenState();
}

class _ScheduleJobScreenState extends State<ScheduleJobScreen> {
  int _selectedDay = 0;
  String _selectedSlot = '14:00 - 16:00';
  String _selectedTech = 'Ahmed Raza';

  final List<String> _slots = [
    '09:00 - 11:00',
    '14:00 - 16:00',
    '16:30 - 18:30',
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: const AeraAppBar(
        title: 'Schedule Dispatch',
        subtitle: 'Order #JOB-8492',
        showBrand: true,
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          children: [
            // Job Context Ribbon Banner
            AeraCard(
              padding: const EdgeInsets.all(16),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: AeraColors.accentSoft,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(Icons.hvac, color: AeraColors.accent, size: 22),
                      ),
                      const SizedBox(width: 12),
                      Column(
                        crossAxisAlignment: CrossAlignment.start,
                        children: [
                          Text('Sarah Khan', style: AeraTypography.h3.copyWith(fontSize: 15)),
                          Text('Gulberg III · AC Not Cooling', style: AeraTypography.bodySm.copyWith(fontSize: 11)),
                        ],
                      ),
                    ],
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: AeraColors.warningSoft,
                      borderRadius: AeraRadii.borderFull,
                    ),
                    child: Text(
                      'High Priority',
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

            // Step 1: Date Selection
            Row(
              children: [
                Container(
                  width: 20,
                  height: 20,
                  decoration: const BoxDecoration(
                    color: AeraColors.primary,
                    shape: BoxShape.circle,
                  ),
                  child: const Center(
                    child: Text(
                      '1',
                      style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Text('Select Service Date', style: AeraTypography.h3.copyWith(fontSize: 15)),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                _dayChip('MON', '7', 0),
                const SizedBox(width: 8),
                _dayChip('TUE', '8', 1),
                const SizedBox(width: 8),
                _dayChip('WED', '9', 2),
                const SizedBox(width: 8),
                _dayChip('THU', '10', 3),
                const SizedBox(width: 8),
                _dayChip('FRI', '11', 4),
              ],
            ),
            const SizedBox(height: 20),

            // Step 2: Time Slot Window
            Row(
              children: [
                Container(
                  width: 20,
                  height: 20,
                  decoration: const BoxDecoration(
                    color: AeraColors.primary,
                    shape: BoxShape.circle,
                  ),
                  child: const Center(
                    child: Text(
                      '2',
                      style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Text('Arrival Window', style: AeraTypography.h3.copyWith(fontSize: 15)),
              ],
            ),
            const SizedBox(height: 10),
            ..._slots.map((slot) {
              final isSelected = _selectedSlot == slot;
              final isRecommended = slot == '14:00 - 16:00';

              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: AeraCard(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  backgroundColor: isSelected ? AeraColors.accentSoft : AeraColors.surface,
                  borderColor: isSelected ? AeraColors.accent : AeraColors.line,
                  onTap: () => setState(() => _selectedSlot = slot),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          Icon(
                            Icons.schedule,
                            size: 18,
                            color: isSelected ? AeraColors.accent : AeraColors.inkSoft,
                          ),
                          const SizedBox(width: 10),
                          Column(
                            crossAxisAlignment: CrossAlignment.start,
                            children: [
                              Text(
                                slot,
                                style: AeraTypography.bodyMedium.copyWith(
                                  fontWeight: FontWeight.w700,
                                  color: isSelected ? AeraColors.accent : AeraColors.ink,
                                ),
                              ),
                              if (isRecommended)
                                Text(
                                  'Optimal: Shortest transit from Model Town',
                                  style: AeraTypography.bodySm.copyWith(
                                    fontSize: 11,
                                    color: AeraColors.accent,
                                  ),
                                ),
                            ],
                          ),
                        ],
                      ),
                      if (isRecommended)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: AeraColors.accent,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            'RECOMMENDED',
                            style: AeraTypography.labelUpper.copyWith(fontSize: 8, color: Colors.white),
                          ),
                        ),
                    ],
                  ),
                ),
              );
            }),
            const SizedBox(height: 20),

            // Step 3: Assign Technician
            Row(
              children: [
                Container(
                  width: 20,
                  height: 20,
                  decoration: const BoxDecoration(
                    color: AeraColors.primary,
                    shape: BoxShape.circle,
                  ),
                  child: const Center(
                    child: Text(
                      '3',
                      style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Text('Assign Lead Technician', style: AeraTypography.h3.copyWith(fontSize: 15)),
              ],
            ),
            const SizedBox(height: 10),

            _techOption('Ahmed Raza', 'Lead Tech · Van #4', '3.4 km from site (12 min transit)', 'AR', true),
            const SizedBox(height: 8),
            _techOption('James Miller', 'Commercial Specialist · Van #2', '9.2 km away · Finish job at 13:30', 'JM', false),
            const SizedBox(height: 8),
            _techOption('Omar Khan', 'Field Tech · Standby Base', '4.5 km away · Ready now', 'OK', false),
            const SizedBox(height: 24),

            AeraButton(
              text: 'Confirm Dispatch & Alert Crew',
              icon: const Icon(Icons.send_rounded, size: 18, color: Colors.white),
              onPressed: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Job dispatched to Ahmed Raza')),
                );
                context.go('/dashboard');
              },
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _dayChip(String day, String num, int index) {
    final isSelected = _selectedDay == index;
    return Expanded(
      child: InkWell(
        onTap: () => setState(() => _selectedDay = index),
        borderRadius: AeraRadii.borderMd,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color: isSelected ? AeraColors.primary : AeraColors.surface,
            borderRadius: AeraRadii.borderMd,
            border: Border.all(color: isSelected ? Colors.transparent : AeraColors.line),
          ),
          child: Column(
            children: [
              Text(
                day,
                style: AeraTypography.label.copyWith(
                  fontSize: 10,
                  color: isSelected ? Colors.white70 : AeraColors.inkSoft,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                num,
                style: AeraTypography.bodyMedium.copyWith(
                  fontWeight: FontWeight.w700,
                  color: isSelected ? Colors.white : AeraColors.ink,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _techOption(String name, String role, String eta, String initials, bool bestMatch) {
    final isSelected = _selectedTech == name;
    return AeraCard(
      padding: const EdgeInsets.all(12),
      backgroundColor: isSelected ? AeraColors.accentSoft : AeraColors.surface,
      borderColor: isSelected ? AeraColors.accent : AeraColors.line,
      onTap: () => setState(() => _selectedTech = name),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 18,
                backgroundColor: isSelected ? AeraColors.accent : AeraColors.surfaceSubtle,
                child: Text(
                  initials,
                  style: TextStyle(
                    color: isSelected ? Colors.white : AeraColors.ink,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(name, style: AeraTypography.bodyMedium.copyWith(fontWeight: FontWeight.w700)),
                      if (bestMatch) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                          decoration: BoxDecoration(
                            color: AeraColors.successSoft,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            'BEST ROUTE',
                            style: AeraTypography.labelUpper.copyWith(fontSize: 8, color: AeraColors.success),
                          ),
                        ),
                      ],
                    ],
                  ),
                  Text(role, style: AeraTypography.label.copyWith(color: AeraColors.inkSoft, fontSize: 10)),
                  Text(eta, style: AeraTypography.bodySm.copyWith(fontSize: 11, color: AeraColors.accent)),
                ],
              ),
            ],
          ),
          Radio<String>(
            value: name,
            groupValue: _selectedTech,
            activeColor: AeraColors.accent,
            onChanged: (val) => setState(() => _selectedTech = val!),
          ),
        ],
      ),
    );
  }
}
