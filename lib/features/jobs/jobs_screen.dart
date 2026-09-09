import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_card.dart';

class JobsScreen extends StatefulWidget {
  const JobsScreen({super.key});

  @override
  State<JobsScreen> createState() => _JobsScreenState();
}

class _JobsScreenState extends State<JobsScreen> {
  String _activeTab = 'All';
  final _searchController = TextEditingController();

  final List<_JobItem> _jobs = const [
    _JobItem(
      id: 'JOB-8492',
      customer: 'Sarah Khan',
      time: '14:00 - 15:30',
      service: 'AC Not Cooling · 4-Ton Split System',
      location: 'Gulberg III, Sector B · 4.2 km',
      tech: 'Ahmed Raza',
      van: 'Van #4',
      status: 'At Risk',
      statusDetail: '+28m delay',
      color: AeraColors.warning,
      softColor: AeraColors.warningSoft,
    ),
    _JobItem(
      id: 'JOB-8495',
      customer: 'Malik Textiles Head Office',
      time: '15:45 - 17:00',
      service: 'Quarterly VRF Chillers Maintenance',
      location: 'Ferozepur Road Industrial · 11 km',
      tech: 'James Miller',
      van: 'Van #2',
      status: 'In Progress',
      statusDetail: 'On Site (45m)',
      color: AeraColors.accent,
      softColor: AeraColors.accentSoft,
    ),
    _JobItem(
      id: 'JOB-8488',
      customer: 'Dr. Tariq Parvez',
      time: '11:00 - 12:30',
      service: 'Inverter PCB Sensor Replacement',
      location: 'DHA Phase 6, Sector C · 8.5 km',
      tech: 'Omar Khan',
      van: 'Van #1',
      status: 'Completed',
      statusDetail: 'Signed & Paid',
      color: AeraColors.success,
      softColor: AeraColors.successSoft,
    ),
    _JobItem(
      id: 'JOB-8501',
      customer: 'Greenview Residence Chiller',
      time: '17:30 - 19:00',
      service: 'Compressor 3.5T Diagnostic Audit',
      location: 'Model Town, Block J · 6.1 km',
      tech: 'Bilal Hassan',
      van: 'Van #3',
      status: 'Scheduled',
      statusDetail: 'Awaiting Tech',
      color: AeraColors.info,
      softColor: AeraColors.infoSoft,
    ),
  ];

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

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
                  'Jobs Directory',
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
          'New Job',
          style: AeraTypography.bodyMedium.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
        ),
        onPressed: () => context.push('/create-job'),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          children: [
            // Header Stats
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Text('Jobs', style: AeraTypography.display.copyWith(fontSize: 22)),
                    const SizedBox(width: 8),
                    Container(width: 5, height: 5, decoration: const BoxDecoration(color: AeraColors.accent, shape: BoxShape.circle)),
                    const SizedBox(width: 8),
                    Text('12 Today · Sep 7', style: AeraTypography.bodySm),
                  ],
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AeraColors.warningSoft,
                    borderRadius: AeraRadii.borderFull,
                  ),
                  child: Row(
                    children: [
                      Container(width: 6, height: 6, decoration: const BoxDecoration(color: AeraColors.warning, shape: BoxShape.circle)),
                      const SizedBox(width: 6),
                      Text(
                        '2 Needs Review',
                        style: AeraTypography.label.copyWith(
                          color: AeraColors.warning,
                          fontWeight: FontWeight.w700,
                          fontSize: 10,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Search Bar
            Container(
              decoration: BoxDecoration(
                color: AeraColors.surface,
                borderRadius: AeraRadii.borderMd,
                border: Border.all(color: AeraColors.line),
              ),
              child: TextField(
                controller: _searchController,
                style: AeraTypography.bodySm.copyWith(color: AeraColors.ink),
                decoration: InputDecoration(
                  hintText: 'Search customer, technician, unit, address...',
                  hintStyle: AeraTypography.bodySm.copyWith(color: AeraColors.outline),
                  prefixIcon: const Icon(Icons.search, size: 20, color: AeraColors.inkSoft),
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                ),
              ),
            ),
            const SizedBox(height: 12),

            // Filter Tabs
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _tabChip('All', '12'),
                  const SizedBox(width: 8),
                  _tabChip('Today', '8'),
                  const SizedBox(width: 8),
                  _tabChip('At Risk', '2', isWarning: true),
                  const SizedBox(width: 8),
                  _tabChip('In Progress', '4'),
                  const SizedBox(width: 8),
                  _tabChip('Scheduled', '3'),
                  const SizedBox(width: 8),
                  _tabChip('Completed', '4'),
                ],
              ),
            ),
            const SizedBox(height: 14),

            // Sort & View Toolbar
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(Icons.swap_vert, size: 16, color: AeraColors.accent),
                    const SizedBox(width: 4),
                    Text(
                      'Sort: Earliest First',
                      style: AeraTypography.label.copyWith(fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
                Container(
                  padding: const EdgeInsets.all(2),
                  decoration: BoxDecoration(
                    color: AeraColors.surfaceSubtle,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: AeraColors.surface,
                          borderRadius: BorderRadius.circular(4),
                          boxShadow: const [BoxShadow(color: Colors.black12, blurRadius: 2)],
                        ),
                        child: Text(
                          'List',
                          style: AeraTypography.label.copyWith(fontWeight: FontWeight.w700),
                        ),
                      ),
                      const SizedBox(width: 2),
                      InkWell(
                        onTap: () => context.push('/calendar'),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          child: Text(
                            'Map',
                            style: AeraTypography.label.copyWith(color: AeraColors.inkSoft),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Job Cards List
            ..._jobs.map((job) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: AeraCard(
                    padding: const EdgeInsets.all(16),
                    onTap: () => context.push('/jobs/${job.id}'),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Row(
                              children: [
                                Text(
                                  job.time,
                                  style: AeraTypography.label.copyWith(
                                    fontWeight: FontWeight.w700,
                                    color: AeraColors.ink,
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Container(width: 4, height: 4, decoration: const BoxDecoration(color: AeraColors.line, shape: BoxShape.circle)),
                                const SizedBox(width: 6),
                                Text(
                                  '#${job.id}',
                                  style: AeraTypography.label.copyWith(color: AeraColors.inkSoft),
                                ),
                              ],
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: job.softColor,
                                borderRadius: AeraRadii.borderFull,
                              ),
                              child: Text(
                                '${job.status} · ${job.statusDetail}',
                                style: AeraTypography.label.copyWith(
                                  color: job.color,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(
                          job.customer,
                          style: AeraTypography.h3.copyWith(fontSize: 16),
                        ),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            const Icon(Icons.hvac, size: 15, color: AeraColors.accent),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(
                                job.service,
                                style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            const Icon(Icons.location_on_outlined, size: 15, color: AeraColors.outline),
                            const SizedBox(width: 6),
                            Expanded(
                              child: Text(
                                job.location,
                                style: AeraTypography.bodySm.copyWith(fontSize: 12),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        const Divider(color: AeraColors.line),
                        const SizedBox(height: 8),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Row(
                              children: [
                                CircleAvatar(
                                  radius: 10,
                                  backgroundColor: AeraColors.accentSoft,
                                  child: Text(
                                    job.tech[0],
                                    style: const TextStyle(fontSize: 9, color: AeraColors.accent, fontWeight: FontWeight.bold),
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Text(
                                  '${job.tech} • ${job.van}',
                                  style: AeraTypography.label.copyWith(color: AeraColors.ink),
                                ),
                              ],
                            ),
                            Row(
                              children: [
                                Text(
                                  'View details',
                                  style: AeraTypography.label.copyWith(color: AeraColors.accent),
                                ),
                                const Icon(Icons.chevron_right, size: 16, color: AeraColors.accent),
                              ],
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                )),
            const SizedBox(height: 60),
          ],
        ),
      ),
    );
  }

  Widget _tabChip(String title, String count, {bool isWarning = false}) {
    final isSelected = _activeTab == title;

    return InkWell(
      onTap: () => setState(() => _activeTab = title),
      borderRadius: AeraRadii.borderFull,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected
              ? (isWarning ? AeraColors.warning : AeraColors.accent)
              : (isWarning ? AeraColors.warningSoft : AeraColors.surface),
          borderRadius: AeraRadii.borderFull,
          border: Border.all(
            color: isSelected ? Colors.transparent : AeraColors.line,
          ),
        ),
        child: Row(
          children: [
            Text(
              title,
              style: AeraTypography.label.copyWith(
                color: isSelected
                    ? Colors.white
                    : (isWarning ? AeraColors.warning : AeraColors.ink),
                fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
            const SizedBox(width: 4),
            Text(
              count,
              style: AeraTypography.label.copyWith(
                color: isSelected
                    ? Colors.white.withOpacity(0.8)
                    : (isWarning ? AeraColors.warning : AeraColors.inkSoft),
                fontSize: 10,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _JobItem {
  const _JobItem({
    required this.id,
    required this.customer,
    required this.time,
    required this.service,
    required this.location,
    required this.tech,
    required this.van,
    required this.status,
    required this.statusDetail,
    required this.color,
    required this.softColor,
  });

  final String id;
  final String customer;
  final String time;
  final String service;
  final String location;
  final String tech;
  final String van;
  final String status;
  final String statusDetail;
  final Color color;
  final Color softColor;
}
