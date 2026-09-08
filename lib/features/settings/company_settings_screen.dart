import 'package:flutter/material.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_card.dart';

class CompanySettingsScreen extends StatefulWidget {
  const CompanySettingsScreen({super.key});

  @override
  State<CompanySettingsScreen> createState() => _CompanySettingsScreenState();
}

class _CompanySettingsScreenState extends State<CompanySettingsScreen> {
  String _activeTab = 'All Modules';

  final List<String> _tabs = [
    'All Modules',
    'Profile & Legal',
    'Dispatch & Range',
    'Technicians (5)',
    'Billing',
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AppBar(
        title: const Text('Company Settings'),
        actions: [
          IconButton(
            icon: const Icon(Icons.apps),
            tooltip: 'Screen Catalog',
            onPressed: () => Scaffold.of(context).openEndDrawer(),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        children: [
          // Header Operations Admin Card
          AeraCard(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.between,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAlignment.start,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: AeraColors.successSoft,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(
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
                                'Sync Engine Active',
                                style: AeraTypography.label.copyWith(color: AeraColors.success),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Northstar Climate Solutions',
                          style: AeraTypography.h3.copyWith(fontWeight: FontWeight.w700),
                        ),
                        Text(
                          'HVAC Field Operations Administration',
                          style: AeraTypography.label.copyWith(color: AeraColors.inkSoft),
                        ),
                      ],
                    ),
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: AeraColors.accent,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(Icons.domain, color: AeraColors.surface, size: 22),
                    ),
                  ],
                ),
                const SizedBox(height: 14),

                // Quick Vital Metrics Ribbon (3 columns)
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AeraColors.surfaceSubtle,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAlignment.start,
                          children: [
                            Text('Fleet Status', style: AeraTypography.label.copyWith(color: AeraColors.inkSoft)),
                            Text('4 Vans', style: AeraTypography.body.copyWith(fontWeight: FontWeight.w700)),
                            Text('All in service', style: AeraTypography.label.copyWith(color: AeraColors.success, fontSize: 10)),
                          ],
                        ),
                      ),
                      Container(width: 1, height: 28, color: AeraColors.line),
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.only(left: 10),
                          child: Column(
                            crossAxisAlignment: CrossAlignment.start,
                            children: [
                              Text('Coverage', style: AeraTypography.label.copyWith(color: AeraColors.inkSoft)),
                              Text('35 km', style: AeraTypography.body.copyWith(fontWeight: FontWeight.w700)),
                              Text('Lahore Hub', style: AeraTypography.label.copyWith(color: AeraColors.inkSoft, fontSize: 10)),
                            ],
                          ),
                        ),
                      ),
                      Container(width: 1, height: 28, color: AeraColors.line),
                      Expanded(
                        child: Padding(
                          padding: const EdgeInsets.only(left: 10),
                          child: Column(
                            crossAxisAlignment: CrossAlignment.start,
                            children: [
                              Text('Base Rate', style: AeraTypography.label.copyWith(color: AeraColors.inkSoft)),
                              Text('Rs 2,500', style: AeraTypography.body.copyWith(fontWeight: FontWeight.w700)),
                              Text('PKR / hr', style: AeraTypography.label.copyWith(color: AeraColors.inkSoft, fontSize: 10)),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Tabs
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: _tabs.map((tab) {
                final isSelected = _activeTab == tab;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterChip(
                    label: Text(tab),
                    selected: isSelected,
                    onSelected: (_) => setState(() => _activeTab = tab),
                    backgroundColor: AeraColors.surface,
                    selectedColor: AeraColors.accent,
                    labelStyle: AeraTypography.label.copyWith(
                      color: isSelected ? AeraColors.surface : AeraColors.inkSoft,
                      fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(20),
                      side: BorderSide(color: isSelected ? AeraColors.accent : AeraColors.line),
                    ),
                    showCheckmark: false,
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 14),

          // Section 1: Business Identity & Legal
          _sectionCard(
            title: 'Business Identity & Legal',
            subtitle: 'Legal enterprise standing & depot base',
            icon: Icons.badge,
            children: [
              _detailRow('Legal Entity', 'Northstar Climate Solutions (Pvt) Ltd'),
              _detailRow('National Tax # (NTN)', '4928100-1'),
              _detailRow('Headquarters Depot', 'Gulberg Central Depot, Block K, Lahore'),
              _detailRow('Lead Dispatch Desk', '+92 (42) 3571-0091'),
            ],
          ),
          const SizedBox(height: 12),

          // Section 2: Coverage & Territories
          _sectionCard(
            title: 'Service Coverage & Zones',
            subtitle: '35 km radius around Lahore metropolitan',
            icon: Icons.map,
            children: [
              _detailRow('Primary Hub', 'Gulberg III Operations Center'),
              _detailRow('Active Zones', 'Gulberg, DHA Phases 1–8, Cantt, Model Town, Bahria'),
              _detailRow('Average Transit Time', '22 minutes across active fleet'),
            ],
          ),
          const SizedBox(height: 12),

          // Section 3: Technicians Roster
          _sectionCard(
            title: 'Field Technicians & Fleet',
            subtitle: '4 active vans & certified technicians',
            icon: Icons.engineering,
            children: [
              _techRow('Ahmed Raza', 'Master HVAC Tech', 'Van #12 (Gulberg)', true),
              _techRow('Omar Khan', 'Senior Field Specialist', 'Van #04 (DHA Phase 5)', true),
              _techRow('Tariq Mehmood', 'Commercial Chillers Lead', 'Van #07 (Cantt)', true),
              _techRow('Bilal Aslam', 'Apprentice Technician', 'Van #09 (Model Town)', false),
            ],
          ),
          const SizedBox(height: 12),

          // Section 4: Billing & Labor Rates
          _sectionCard(
            title: 'Pricing & Invoicing Setup',
            subtitle: 'Standardized rate matrix for quotes & invoices',
            icon: Icons.receipt_long,
            children: [
              _detailRow('Standard Diagnostics', 'Rs 2,500 flat fee'),
              _detailRow('Hourly Labor Rate', 'Rs 2,500 / hr'),
              _detailRow('Refrigerant Refill (R410A)', 'Rs 3,500 per charge'),
              _detailRow('Default Payment Terms', 'Due on Receipt via Raast IBFT'),
            ],
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _sectionCard({
    required String title,
    required String subtitle,
    required IconData icon,
    required List<Widget> children,
  }) {
    return AeraCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: AeraColors.accentSoft,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, color: AeraColors.accent, size: 20),
              ),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAlignment.start,
                children: [
                  Text(title, style: AeraTypography.bodySm.copyWith(fontWeight: FontWeight.w700)),
                  Text(subtitle, style: AeraTypography.label.copyWith(color: AeraColors.outline)),
                ],
              ),
            ],
          ),
          const SizedBox(height: 14),
          const Divider(color: AeraColors.line, height: 1),
          const SizedBox(height: 10),
          ...children,
        ],
      ),
    );
  }

  Widget _detailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.between,
        children: [
          Text(label, style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft)),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: AeraTypography.bodySm.copyWith(fontWeight: FontWeight.w600),
            ),
          ),
        ],
      ),
    );
  }

  Widget _techRow(String name, String role, String van, bool active) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.between,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 14,
                backgroundColor: active ? AeraColors.accentSoft : AeraColors.surfaceSubtle,
                child: Text(
                  name.substring(0, 1),
                  style: AeraTypography.label.copyWith(
                    fontWeight: FontWeight.w700,
                    color: active ? AeraColors.accent : AeraColors.outline,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAlignment.start,
                children: [
                  Text(name, style: AeraTypography.bodySm.copyWith(fontWeight: FontWeight.w600)),
                  Text(role, style: AeraTypography.label.copyWith(color: AeraColors.outline)),
                ],
              ),
            ],
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              color: AeraColors.surfaceSubtle,
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(van, style: AeraTypography.label.copyWith(fontSize: 10)),
          ),
        ],
      ),
    );
  }
}
