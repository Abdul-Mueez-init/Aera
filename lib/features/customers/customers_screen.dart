import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_card.dart';

class CustomersScreen extends StatefulWidget {
  const CustomersScreen({super.key});

  @override
  State<CustomersScreen> createState() => _CustomersScreenState();
}

class _CustomersScreenState extends State<CustomersScreen> {
  String _activeTag = 'All';
  final _searchController = TextEditingController();

  final List<_CustomerItem> _customers = const [
    _CustomerItem(
      id: 'CUST-1002',
      name: 'Sarah Khan',
      address: 'Gulberg III, Sector B, Lahore',
      phone: '+92 (300) 489-2019',
      activeJobs: 1,
      type: 'Residential',
      initials: 'SK',
      balance: 'Rs 14,500',
    ),
    _CustomerItem(
      id: 'CUST-1005',
      name: 'Malik Textiles Head Office',
      address: 'Ferozepur Road Industrial Zone',
      phone: '+92 (42) 3589-1100',
      activeJobs: 1,
      type: 'Commercial',
      initials: 'MT',
      balance: 'Rs 88,000',
    ),
    _CustomerItem(
      id: 'CUST-1011',
      name: 'Dr. Tariq Parvez',
      address: 'DHA Phase 6, Sector C, Lahore',
      phone: '+92 (321) 902-3344',
      activeJobs: 0,
      type: 'Residential',
      initials: 'TP',
      balance: 'Paid Up',
    ),
    _CustomerItem(
      id: 'CUST-1019',
      name: 'Bhatti Medical Plaza',
      address: 'Cantt Metro Road, Lahore',
      phone: '+92 (42) 3662-8899',
      activeJobs: 1,
      type: 'Commercial',
      initials: 'BM',
      balance: 'Rs 42,000',
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
                Text('AERA HVAC', style: AeraTypography.labelUpper.copyWith(fontSize: 9)),
                Text('Customers', style: AeraTypography.h3.copyWith(fontSize: 16, fontWeight: FontWeight.w700)),
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
        icon: const Icon(Icons.person_add, size: 20),
        label: Text(
          'Add Customer',
          style: AeraTypography.bodyMedium.copyWith(color: Colors.white, fontWeight: FontWeight.w700),
        ),
        onPressed: () => context.push('/create-customer'),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          children: [
            // Header Stats
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Customer Accounts', style: AeraTypography.display.copyWith(fontSize: 22)),
                    Row(
                      children: [
                        Container(width: 6, height: 6, decoration: const BoxDecoration(color: AeraColors.success, shape: BoxShape.circle)),
                        const SizedBox(width: 6),
                        Text('148 Active HVAC Accounts', style: AeraTypography.bodySm),
                      ],
                    ),
                  ],
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
                  hintText: 'Search name, phone, address, serial...',
                  hintStyle: AeraTypography.bodySm.copyWith(color: AeraColors.outline),
                  prefixIcon: const Icon(Icons.search, size: 20, color: AeraColors.inkSoft),
                  suffixIcon: const Icon(Icons.tune, size: 18, color: AeraColors.inkSoft),
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                ),
              ),
            ),
            const SizedBox(height: 12),

            // Filter Tags
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _tagChip('All', '148'),
                  const SizedBox(width: 8),
                  _tagChip('Residential', '116'),
                  const SizedBox(width: 8),
                  _tagChip('Commercial', '32'),
                  const SizedBox(width: 8),
                  _tagChip('Active Jobs', '4'),
                  const SizedBox(width: 8),
                  _tagChip('Overdue', '2', isWarning: true),
                ],
              ),
            ),
            const SizedBox(height: 14),

            // Customer Cards List
            ..._customers.map((cust) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: AeraCard(
                    padding: const EdgeInsets.all(16),
                    onTap: () => context.push('/customers/${cust.id}'),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Row(
                              children: [
                                CircleAvatar(
                                  radius: 20,
                                  backgroundColor: AeraColors.surfaceSubtle,
                                  child: Text(
                                    cust.initials,
                                    style: AeraTypography.h3.copyWith(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w700,
                                      color: AeraColors.accent,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 12),
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Text(cust.name, style: AeraTypography.h3.copyWith(fontSize: 15)),
                                        const SizedBox(width: 4),
                                        const Icon(Icons.verified, size: 14, color: AeraColors.accent),
                                      ],
                                    ),
                                    Text(cust.address, style: AeraTypography.bodySm.copyWith(fontSize: 11)),
                                  ],
                                ),
                              ],
                            ),
                            if (cust.activeJobs > 0)
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(
                                  color: AeraColors.accentSoft,
                                  borderRadius: AeraRadii.borderFull,
                                ),
                                child: Text(
                                  '${cust.activeJobs} Active',
                                  style: AeraTypography.label.copyWith(
                                    color: AeraColors.accent,
                                    fontSize: 10,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        const Divider(color: AeraColors.line),
                        const SizedBox(height: 8),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Row(
                              children: [
                                const Icon(Icons.phone_outlined, size: 14, color: AeraColors.inkSoft),
                                const SizedBox(width: 4),
                                Text(cust.phone, style: AeraTypography.bodySm.copyWith(fontSize: 11)),
                              ],
                            ),
                            Text(
                              cust.balance,
                              style: AeraTypography.label.copyWith(
                                color: cust.balance.contains('Paid') ? AeraColors.success : AeraColors.ink,
                                fontWeight: FontWeight.w700,
                              ),
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

  Widget _tagChip(String title, String count, {bool isWarning = false}) {
    final isSelected = _activeTag == title;

    return InkWell(
      onTap: () => setState(() => _activeTag = title),
      borderRadius: AeraRadii.borderFull,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected
              ? (isWarning ? AeraColors.warning : AeraColors.accent)
              : AeraColors.surface,
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
                color: isSelected ? Colors.white : AeraColors.ink,
                fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
            const SizedBox(width: 4),
            Text(
              count,
              style: AeraTypography.label.copyWith(
                color: isSelected ? Colors.white70 : AeraColors.inkSoft,
                fontSize: 10,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CustomerItem {
  const _CustomerItem({
    required this.id,
    required this.name,
    required this.address,
    required this.phone,
    required this.activeJobs,
    required this.type,
    required this.initials,
    required this.balance,
  });

  final String id;
  final String name;
  final String address;
  final String phone;
  final int activeJobs;
  final String type;
  final String initials;
  final String balance;
}
