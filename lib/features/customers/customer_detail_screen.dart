import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';

class CustomerDetailScreen extends StatelessWidget {
  const CustomerDetailScreen({super.key, required this.customerId});

  final String customerId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AeraAppBar(
        title: 'Customer Profile',
        subtitle: '#$customerId',
        actions: [
          IconButton(
            icon: const Icon(Icons.edit_outlined, color: AeraColors.inkSoft),
            onPressed: () {},
          ),
          IconButton(
            icon: const Icon(Icons.phone_outlined, color: AeraColors.accent),
            onPressed: () {},
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          children: [
            // Customer Hero Profile Card
            AeraCard(
              padding: const EdgeInsets.all(18),
              child: Column(
                children: [
                  CircleAvatar(
                    radius: 28,
                    backgroundColor: AeraColors.accentSoft,
                    child: Text(
                      'SK',
                      style: AeraTypography.h2.copyWith(
                        color: AeraColors.accentDeep,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        'Sarah Khan',
                        style: AeraTypography.h2.copyWith(fontSize: 20),
                      ),
                      const SizedBox(width: 6),
                      const Icon(Icons.verified, size: 18, color: AeraColors.accent),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Residential Account · Lahore Metro',
                    style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: AeraColors.successSoft,
                          borderRadius: AeraRadii.borderFull,
                        ),
                        child: Text(
                          'Active Care Plan',
                          style: AeraTypography.label.copyWith(
                            color: AeraColors.success,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: AeraColors.surfaceSubtle,
                          borderRadius: AeraRadii.borderFull,
                        ),
                        child: Text(
                          'Client since 2022',
                          style: AeraTypography.label.copyWith(color: AeraColors.inkSoft),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),

            // Service Addresses Card
            AeraCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Service Addresses (2)', style: AeraTypography.h3.copyWith(fontSize: 15)),
                      TextButton.icon(
                        onPressed: () {},
                        icon: const Icon(Icons.add, size: 14, color: AeraColors.accent),
                        label: Text('Add', style: AeraTypography.label.copyWith(color: AeraColors.accent)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),

                  // Primary Address
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
                            const Icon(Icons.home, size: 18, color: AeraColors.accent),
                            const SizedBox(width: 10),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Text('House 42-B, Block K', style: AeraTypography.bodyMedium.copyWith(fontWeight: FontWeight.w600)),
                                    const SizedBox(width: 6),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                                      decoration: BoxDecoration(
                                        color: AeraColors.accentSoft,
                                        borderRadius: BorderRadius.circular(3),
                                      ),
                                      child: Text(
                                        'PRIMARY',
                                        style: AeraTypography.labelUpper.copyWith(fontSize: 8, color: AeraColors.accent),
                                      ),
                                    ),
                                  ],
                                ),
                                Text('Gulberg III, Lahore', style: AeraTypography.bodySm.copyWith(fontSize: 11)),
                              ],
                            ),
                          ],
                        ),
                        const Icon(Icons.chevron_right, size: 18, color: AeraColors.outline),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),

                  // Secondary Address
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AeraColors.surfaceSubtle.withOpacity(0.5),
                      borderRadius: AeraRadii.borderMd,
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.apartment, size: 18, color: AeraColors.inkSoft),
                            const SizedBox(width: 10),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Villa 18, Street 7', style: AeraTypography.bodyMedium.copyWith(fontWeight: FontWeight.w600)),
                                Text('DHA Phase 6, Lahore', style: AeraTypography.bodySm.copyWith(fontSize: 11)),
                              ],
                            ),
                          ],
                        ),
                        const Icon(Icons.chevron_right, size: 18, color: AeraColors.outline),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),

            // Registered Units & Equipment
            AeraCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('HVAC Units on Record', style: AeraTypography.h3.copyWith(fontSize: 15)),
                  const SizedBox(height: 10),
                  _unitItem('Carrier Infinity 24', '4-Ton Split Heat Pump', 'CR-9824-2023', 'Active Warranty'),
                  const SizedBox(height: 8),
                  _unitItem('Gree Fairy Inverter', '1.5-Ton Bedroom Unit', 'GR-1102-2021', 'Annual Filter Due'),
                ],
              ),
            ),
            const SizedBox(height: 20),

            // Action Buttons
            AeraButton(
              text: 'Create New Job for Sarah',
              icon: const Icon(Icons.add_task, size: 18, color: Colors.white),
              onPressed: () => context.push('/create-job'),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: AeraButton(
                    text: 'View All Jobs (4)',
                    variant: AeraButtonVariant.secondary,
                    onPressed: () => context.push('/jobs'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: AeraButton(
                    text: 'Invoices & Billing',
                    variant: AeraButtonVariant.outline,
                    onPressed: () => context.push('/invoices'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _unitItem(String model, String type, String serial, String status) {
    return Container(
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
              const Icon(Icons.hvac, size: 20, color: AeraColors.accent),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(model, style: AeraTypography.bodyMedium.copyWith(fontWeight: FontWeight.w700)),
                  Text('$type • $serial', style: AeraTypography.bodySm.copyWith(fontSize: 11)),
                ],
              ),
            ],
          ),
          Text(status, style: AeraTypography.label.copyWith(color: AeraColors.accent, fontSize: 10)),
        ],
      ),
    );
  }
}
