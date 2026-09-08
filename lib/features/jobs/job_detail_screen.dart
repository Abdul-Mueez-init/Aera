import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';

class JobDetailScreen extends StatefulWidget {
  const JobDetailScreen({super.key, required this.jobId});

  final String jobId;

  @override
  State<JobDetailScreen> createState() => _JobDetailScreenState();
}

class _JobDetailScreenState extends State<JobDetailScreen> {
  String _jobStatus = 'En Route';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AeraAppBar(
        title: 'Job Details',
        subtitle: '#${widget.jobId}',
        actions: [
          IconButton(
            icon: const Icon(Icons.phone_outlined, color: AeraColors.accent),
            onPressed: () {},
          ),
          IconButton(
            icon: const Icon(Icons.share_outlined, color: AeraColors.inkSoft),
            onPressed: () {},
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          children: [
            // Header & Telemetry Card
            AeraCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          Text('#${widget.jobId}', style: AeraTypography.h3.copyWith(fontSize: 18)),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: AeraColors.surfaceSubtle,
                              borderRadius: AeraRadii.borderFull,
                            ),
                            child: Text('HVAC Emergency', style: AeraTypography.label.copyWith(fontSize: 10)),
                          ),
                        ],
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: AeraColors.warningSoft,
                          borderRadius: AeraRadii.borderFull,
                        ),
                        child: Text(
                          'Priority High',
                          style: AeraTypography.label.copyWith(
                            color: AeraColors.warning,
                            fontWeight: FontWeight.w700,
                            fontSize: 10,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),

                  // Live Route Status Alert
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AeraColors.accentSoft,
                      borderRadius: AeraRadii.borderMd,
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            Container(
                              width: 8,
                              height: 8,
                              decoration: const BoxDecoration(
                                color: AeraColors.accent,
                                shape: BoxShape.circle,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Column(
                              crossAxisAlignment: CrossAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Text(
                                      _jobStatus,
                                      style: AeraTypography.h3.copyWith(
                                        fontSize: 14,
                                        color: AeraColors.accentDeep,
                                      ),
                                    ),
                                    const SizedBox(width: 6),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                                      decoration: BoxDecoration(
                                        color: Colors.white,
                                        borderRadius: BorderRadius.circular(4),
                                      ),
                                      child: Text(
                                        'ETA 14m',
                                        style: AeraTypography.label.copyWith(
                                          color: AeraColors.accent,
                                          fontSize: 10,
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                                Text(
                                  'Ahmed is 3.4 km away · On schedule',
                                  style: AeraTypography.bodySm.copyWith(
                                    fontSize: 11,
                                    color: AeraColors.inkSoft,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                        IconButton(
                          icon: const Icon(Icons.navigation, color: AeraColors.accent),
                          onPressed: () => context.push('/technician-tracking'),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),

            // Customer & Site Block
            AeraCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Row(
                        children: [
                          CircleAvatar(
                            radius: 20,
                            backgroundColor: AeraColors.secondaryFixed,
                            child: const Text(
                              'SK',
                              style: TextStyle(
                                fontWeight: FontWeight.w700,
                                color: AeraColors.accentDeep,
                              ),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Column(
                            crossAxisAlignment: CrossAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Text('Sarah Khan', style: AeraTypography.h3.copyWith(fontSize: 15)),
                                  const SizedBox(width: 4),
                                  const Icon(Icons.verified, size: 14, color: AeraColors.accent),
                                ],
                              ),
                              Text('Residential Customer · Account #C-1092', style: AeraTypography.bodySm.copyWith(fontSize: 11)),
                            ],
                          ),
                        ],
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: AeraColors.successSoft,
                          borderRadius: AeraRadii.borderFull,
                        ),
                        child: Text(
                          'Active Member',
                          style: AeraTypography.label.copyWith(
                            color: AeraColors.success,
                            fontSize: 10,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),

                  // Address
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AeraColors.surfaceContainerLow,
                      borderRadius: AeraRadii.borderMd,
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.location_on, size: 18, color: AeraColors.accent),
                            const SizedBox(width: 8),
                            Column(
                              crossAxisAlignment: CrossAlignment.start,
                              children: [
                                Text('House 42-B, Block K', style: AeraTypography.bodyMedium.copyWith(fontWeight: FontWeight.w600)),
                                Text('Gulberg III, Lahore, Punjab', style: AeraTypography.bodySm.copyWith(fontSize: 11)),
                              ],
                            ),
                          ],
                        ),
                        OutlinedButton(
                          onPressed: () {},
                          style: OutlinedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                            side: const BorderSide(color: AeraColors.line),
                            backgroundColor: AeraColors.surface,
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
                          ),
                          child: Text('Directions', style: AeraTypography.label.copyWith(fontSize: 11)),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 10),

                  // Actions
                  Row(
                    children: [
                      Expanded(
                        child: _actionButton(Icons.call, 'Call Customer'),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _actionButton(Icons.chat, 'Send SMS'),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _actionButton(Icons.navigation, 'Track Route', onTap: () => context.push('/technician-tracking')),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),

                  // Site Warning Notice
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AeraColors.warningSoft.withOpacity(0.5),
                      borderRadius: AeraRadii.borderMd,
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.pets, size: 16, color: AeraColors.warning),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Notice: Two dogs in backyard kennel. Enter through East driveway gate.',
                            style: AeraTypography.bodySm.copyWith(
                              fontSize: 11,
                              color: AeraColors.ink,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),

            // Equipment Specs Block
            AeraCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAlignment.start,
                children: [
                  Text('HVAC System & Unit Specs', style: AeraTypography.h3.copyWith(fontSize: 15)),
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AeraColors.surfaceSubtle.withOpacity(0.6),
                      borderRadius: AeraRadii.borderMd,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAlignment.start,
                      children: [
                        Text('Carrier Infinity 24 (4-Ton Split Heat Pump)', style: AeraTypography.bodyMedium.copyWith(fontWeight: FontWeight.w700)),
                        const SizedBox(height: 8),
                        _specRow('Serial Number', 'CR-9824-2023'),
                        _specRow('Filter Size', '20x25x4 MERV 11'),
                        _specRow('Refrigerant', 'R-410A (8.2 lbs)'),
                        _specRow('Installation Date', 'March 2023 (Warranty Active)'),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),

            // Diagnostic Notes
            AeraCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAlignment.start,
                children: [
                  Text('Reported Issue & Brief', style: AeraTypography.h3.copyWith(fontSize: 15)),
                  const SizedBox(height: 6),
                  Text(
                    'Unit blowing warm ambient air since Sunday morning. Outdoor compressor fan spinning but loud intermittent buzzing sound from electrical cabinet.',
                    style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft, height: 1.4),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: AeraColors.accentSoft,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          'Suspected: Run Capacitor / Contactor',
                          style: AeraTypography.label.copyWith(color: AeraColors.accent, fontSize: 11),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // Primary Dispatch Actions
            AeraButton(
              text: _jobStatus == 'En Route' ? 'Arrived On Site' : 'Complete Job',
              icon: const Icon(Icons.check, size: 18, color: Colors.white),
              onPressed: () {
                setState(() {
                  _jobStatus = _jobStatus == 'En Route' ? 'In Progress' : 'Completed';
                });
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('Job status updated to $_jobStatus')),
                );
              },
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: AeraButton(
                    text: 'Create Quote',
                    variant: AeraButtonVariant.secondary,
                    onPressed: () => context.push('/create-quote'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: AeraButton(
                    text: 'Create Invoice',
                    variant: AeraButtonVariant.outline,
                    onPressed: () => context.push('/create-invoice'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _specRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: AeraTypography.bodySm.copyWith(fontSize: 12, color: AeraColors.inkSoft)),
          Text(value, style: AeraTypography.bodySm.copyWith(fontSize: 12, fontWeight: FontWeight.w600, color: AeraColors.ink)),
        ],
      ),
    );
  }

  Widget _actionButton(IconData icon, String label, {VoidCallback? onTap}) {
    return InkWell(
      onTap: onTap,
      borderRadius: AeraRadii.borderMd,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 8),
        decoration: BoxDecoration(
          color: AeraColors.surfaceSubtle,
          borderRadius: AeraRadii.borderMd,
        ),
        child: Column(
          children: [
            Icon(icon, size: 16, color: AeraColors.accent),
            const SizedBox(height: 2),
            Text(label, style: AeraTypography.label.copyWith(fontSize: 10)),
          ],
        ),
      ),
    );
  }
}
