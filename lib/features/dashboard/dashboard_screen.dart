import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_metric_card.dart';

class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key});

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
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'AERA HVAC',
                  style: AeraTypography.labelUpper.copyWith(fontSize: 9),
                ),
                Text(
                  'Dashboard',
                  style: AeraTypography.h3.copyWith(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: Stack(
              children: [
                const Icon(Icons.notifications_outlined, color: AeraColors.ink, size: 22),
                Positioned(
                  right: 0,
                  top: 0,
                  child: Container(
                    width: 7,
                    height: 7,
                    decoration: const BoxDecoration(
                      color: AeraColors.accent,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
              ],
            ),
            onPressed: () => context.push('/notifications'),
          ),
          Builder(
            builder: (ctx) => IconButton(
              icon: const Icon(Icons.menu, color: AeraColors.ink),
              tooltip: 'Screen Catalog',
              onPressed: () => Scaffold.of(ctx).openEndDrawer(),
            ),
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
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          children: [
            // Dispatch Hero Bar
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'MONDAY, SEP 7 · LAHORE HUB',
                      style: AeraTypography.labelUpper.copyWith(fontSize: 10),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Good morning, Marcus',
                      style: AeraTypography.display.copyWith(fontSize: 22),
                    ),
                  ],
                ),
                AeraCard(
                  padding: const EdgeInsets.all(8),
                  borderRadius: AeraRadii.borderMd,
                  onTap: () => context.push('/calendar'),
                  child: const Icon(Icons.map_outlined, color: AeraColors.accent, size: 20),
                ),
              ],
            ),
            const SizedBox(height: 10),

            // Live Telemetry Micro-Badge
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: AeraColors.surface,
                    borderRadius: AeraRadii.borderFull,
                    border: Border.all(color: AeraColors.line),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
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
                        style: AeraTypography.label.copyWith(fontSize: 11),
                      ),
                      const SizedBox(width: 6),
                      Container(width: 3, height: 3, decoration: const BoxDecoration(color: AeraColors.line, shape: BoxShape.circle)),
                      const SizedBox(width: 6),
                      Text(
                        '4 Techs Field-Ready',
                        style: AeraTypography.label.copyWith(
                          color: AeraColors.accent,
                          fontWeight: FontWeight.w700,
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // 2x2 Operational Summary Grid
            Row(
              children: [
                Expanded(
                  child: AeraMetricCard(
                    label: "Today's Jobs",
                    value: '12',
                    sublabel: '4 done · 6 active',
                    icon: Icons.assignment_outlined,
                    onTap: () => context.push('/jobs'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: AeraMetricCard(
                    label: 'In Progress',
                    value: '4',
                    sublabel: '2 en route · 2 on site',
                    valueColor: AeraColors.accent,
                    icon: Icons.precision_manufacturing_outlined,
                    iconColor: AeraColors.accent,
                    iconBgColor: AeraColors.accentSoft,
                    onTap: () => context.push('/jobs'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: AeraMetricCard(
                    label: 'At Risk',
                    value: '2',
                    sublabel: 'Action required',
                    valueColor: AeraColors.warning,
                    badge: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: AeraColors.warningSoft,
                        borderRadius: AeraRadii.borderFull,
                      ),
                      child: Text(
                        'ALERT',
                        style: AeraTypography.labelUpper.copyWith(
                          fontSize: 9,
                          color: AeraColors.warning,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    onTap: () => context.push('/ai-insight/ins-1'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: AeraMetricCard(
                    label: 'Awaiting Pay',
                    value: 'Rs 184.5k',
                    sublabel: '3 invoices pending',
                    icon: Icons.payments_outlined,
                    onTap: () => context.push('/invoices'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),

            // Operational Alerts / Bottleneck Card
            Container(
              decoration: BoxDecoration(
                color: AeraColors.surface,
                borderRadius: AeraRadii.borderLg,
                border: Border.all(color: AeraColors.line),
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    AeraColors.warningSoft.withOpacity(0.3),
                    AeraColors.surface,
                  ],
                ),
              ),
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 28,
                            height: 28,
                            decoration: BoxDecoration(
                              color: AeraColors.warningSoft,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: const Icon(Icons.warning_amber, size: 16, color: AeraColors.warning),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            'Operational Alerts',
                            style: AeraTypography.h3.copyWith(fontSize: 15),
                          ),
                        ],
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: AeraColors.warning,
                          borderRadius: AeraRadii.borderFull,
                        ),
                        child: Text(
                          '2 Bottlenecks',
                          style: AeraTypography.label.copyWith(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),

                  // Bottleneck item 1
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AeraColors.surfaceContainerLow,
                      borderRadius: AeraRadii.borderMd,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Icon(Icons.schedule, size: 16, color: AeraColors.warning),
                            const SizedBox(width: 8),
                            Expanded(
                              child: RichText(
                                text: TextSpan(
                                  text: 'Ahmed Raza ',
                                  style: AeraTypography.bodySm.copyWith(
                                    fontWeight: FontWeight.w700,
                                    color: AeraColors.ink,
                                  ),
                                  children: [
                                    TextSpan(
                                      text: 'is +28m behind at Model Town. Next job in ',
                                      style: AeraTypography.bodySm.copyWith(
                                        fontWeight: FontWeight.normal,
                                        color: AeraColors.inkSoft,
                                      ),
                                    ),
                                    TextSpan(
                                      text: 'DHA Phase 5 ',
                                      style: AeraTypography.bodySm.copyWith(
                                        fontWeight: FontWeight.w600,
                                        color: AeraColors.ink,
                                      ),
                                    ),
                                    TextSpan(
                                      text: 'starts at 14:00.',
                                      style: AeraTypography.bodySm.copyWith(
                                        fontWeight: FontWeight.normal,
                                        color: AeraColors.inkSoft,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        Row(
                          children: [
                            Expanded(
                              child: ElevatedButton.icon(
                                onPressed: () {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(content: Text('Reassigned to Omar Khan')),
                                  );
                                },
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: AeraColors.accent,
                                  foregroundColor: Colors.white,
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                                  padding: const EdgeInsets.symmetric(vertical: 8),
                                ),
                                icon: const Icon(Icons.swap_horiz, size: 16),
                                label: const Text('Reassign to Omar', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed: () {
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(content: Text('Client notified via automated SMS')),
                                  );
                                },
                                style: OutlinedButton.styleFrom(
                                  backgroundColor: AeraColors.surface,
                                  side: const BorderSide(color: AeraColors.line),
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                                  padding: const EdgeInsets.symmetric(vertical: 8),
                                ),
                                icon: const Icon(Icons.chat_bubble_outline, size: 15, color: AeraColors.inkSoft),
                                label: Text('Notify Client', style: AeraTypography.label.copyWith(fontSize: 12, color: AeraColors.ink)),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // Technician Fleet Mini-Bar
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Technician Fleet',
                  style: AeraTypography.h3.copyWith(fontSize: 16),
                ),
                Text(
                  'LIVE GPS TELEMETRY',
                  style: AeraTypography.labelUpper.copyWith(
                    color: AeraColors.accent,
                    fontSize: 10,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            SizedBox(
              height: 90,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: [
                  _techCard('Ahmed Raza', 'Lead Tech', 'En Route · Gulberg', 'AR', AeraColors.accent, true),
                  const SizedBox(width: 10),
                  _techCard('James Miller', 'Commercial', 'On Site · Chiller 4', 'JM', AeraColors.success, false),
                  const SizedBox(width: 10),
                  _techCard('Omar Khan', 'Field Tech', 'Standby · Central', 'OK', AeraColors.inkSoft, false),
                  const SizedBox(width: 10),
                  _techCard('Bilal Hassan', 'Apprentice', 'Supply Pickup · Cantt', 'BH', AeraColors.warning, false),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // Today's Dispatch Queue
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      "Today's Dispatch Queue",
                      style: AeraTypography.h3.copyWith(fontSize: 16),
                    ),
                    Text(
                      'Chronological order across active zones',
                      style: AeraTypography.bodySm.copyWith(fontSize: 11),
                    ),
                  ],
                ),
                AeraCard(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  borderRadius: AeraRadii.borderMd,
                  backgroundColor: AeraColors.accentSoft,
                  onTap: () => context.push('/create-job'),
                  child: Row(
                    children: [
                      const Icon(Icons.add, size: 16, color: AeraColors.accent),
                      const SizedBox(width: 4),
                      Text(
                        'New Job',
                        style: AeraTypography.label.copyWith(
                          color: AeraColors.accent,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Queue Items
            _dispatchItem(
              context,
              time: '14:00 - 15:30',
              jobNo: '#JOB-8492',
              customer: 'Sarah Khan',
              service: 'AC Not Cooling · 4-Ton Split',
              address: 'Gulberg III, Sector B',
              tech: 'Ahmed Raza',
              status: 'En Route',
              isAtRisk: true,
            ),
            const SizedBox(height: 10),
            _dispatchItem(
              context,
              time: '15:45 - 17:00',
              jobNo: '#JOB-8495',
              customer: 'Malik Textiles Head Office',
              service: 'Quarterly VRF Chillers Audit',
              address: 'Ferozepur Road Industrial Zone',
              tech: 'James Miller',
              status: 'Scheduled',
              isAtRisk: false,
            ),
            const SizedBox(height: 10),
            _dispatchItem(
              context,
              time: '17:15 - 18:30',
              jobNo: '#JOB-8499',
              customer: 'Dr. Tariq Parvez',
              service: 'Inverter PCB Sensor Replacement',
              address: 'DHA Phase 6, Sector C',
              tech: 'Omar Khan',
              status: 'Pending Tech',
              isAtRisk: false,
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _techCard(String name, String role, String status, String initials, Color color, bool pulse) {
    return Container(
      width: 170,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AeraColors.surface,
        borderRadius: AeraRadii.borderMd,
        border: Border.all(color: AeraColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 14,
                backgroundColor: color.withOpacity(0.15),
                child: Text(
                  initials,
                  style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w700),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name, style: AeraTypography.bodySm.copyWith(fontWeight: FontWeight.w700, color: AeraColors.ink), maxLines: 1),
                    Text(role, style: AeraTypography.label.copyWith(fontSize: 10, color: AeraColors.inkSoft), maxLines: 1),
                  ],
                ),
              ),
            ],
          ),
          Row(
            children: [
              Container(width: 6, height: 6, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  status,
                  style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w600),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _dispatchItem(
    BuildContext context, {
    required String time,
    required String jobNo,
    required String customer,
    required String service,
    required String address,
    required String tech,
    required String status,
    required bool isAtRisk,
  }) {
    return AeraCard(
      padding: const EdgeInsets.all(14),
      onTap: () => context.push('/jobs/JOB-8492'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Text(time, style: AeraTypography.label.copyWith(fontWeight: FontWeight.w700, color: AeraColors.ink)),
                  const SizedBox(width: 6),
                  Text('· $jobNo', style: AeraTypography.label.copyWith(color: AeraColors.inkSoft)),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: isAtRisk ? AeraColors.warningSoft : AeraColors.accentSoft,
                  borderRadius: AeraRadii.borderFull,
                ),
                child: Text(
                  isAtRisk ? 'At Risk · +28m' : status,
                  style: AeraTypography.label.copyWith(
                    color: isAtRisk ? AeraColors.warning : AeraColors.accent,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(customer, style: AeraTypography.h3.copyWith(fontSize: 15)),
          const SizedBox(height: 2),
          Text(service, style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft)),
          const SizedBox(height: 8),
          const Divider(color: AeraColors.line),
          const SizedBox(height: 6),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  const Icon(Icons.location_on_outlined, size: 14, color: AeraColors.inkSoft),
                  const SizedBox(width: 4),
                  Text(address, style: AeraTypography.bodySm.copyWith(fontSize: 11)),
                ],
              ),
              Row(
                children: [
                  const Icon(Icons.person_pin_outlined, size: 14, color: AeraColors.accent),
                  const SizedBox(width: 4),
                  Text(tech, style: AeraTypography.label.copyWith(color: AeraColors.accent)),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}
