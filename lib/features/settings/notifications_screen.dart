import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_card.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  String _activeFilter = 'All';

  final List<Map<String, dynamic>> _notifications = [
    {
      'id': 'notif-1',
      'title': 'Quote Approved',
      'tag': 'QT-1048',
      'category': 'Commercial',
      'time': '12 min ago • Client Portal',
      'body': 'Sarah Khan approved AC Compressor Replacement estimate for Rs 18,500 via Client Portal.',
      'icon': Icons.task_alt,
      'iconColor': AeraColors.success,
      'actionText': 'View Quote & Schedule',
      'route': '/quotes/QT-1048',
      'isUnread': true,
    },
    {
      'id': 'notif-2',
      'title': 'Technician Delay Alert',
      'tag': 'Van #12',
      'category': 'Dispatch & Jobs',
      'time': '28 min ago • Live Telemetry',
      'body': 'Ahmed Raza is running +28 min behind in Model Town due to prolonged chemical flush. Route buffer deficit.',
      'icon': Icons.schedule,
      'iconColor': AeraColors.warning,
      'actionText': 'Track Van #12 Telemetry',
      'route': '/technician-tracking',
      'isUnread': true,
    },
    {
      'id': 'notif-3',
      'title': 'Payment Settled',
      'tag': 'INV-2380',
      'category': 'Commercial',
      'time': '1h ago • Raast IBFT',
      'body': 'Gourmet Foods settled Invoice #INV-2380 for Rs 92,000 via Raast IBFT. Automatically reconciled.',
      'icon': Icons.account_balance_wallet,
      'iconColor': AeraColors.accent,
      'actionText': 'View Invoices',
      'route': '/invoices',
      'isUnread': false,
    },
    {
      'id': 'notif-4',
      'title': 'Low Inventory Threshold',
      'tag': 'Stock Alert',
      'category': 'System',
      'time': '3h ago • Depot Sensor',
      'body': 'Carrier R-410A refrigerant cylinders down to 2 units at Lahore Central Depot. Minimum restock level reached.',
      'icon': Icons.inventory_2,
      'iconColor': AeraColors.danger,
      'actionText': null,
      'route': null,
      'isUnread': false,
    },
    {
      'id': 'notif-5',
      'title': 'Quarterly Maintenance Scheduled',
      'tag': 'JOB-4030',
      'category': 'Dispatch & Jobs',
      'time': 'Yesterday • Automation',
      'body': 'Cantt Plaza rooftop chillers preventive service booked for tomorrow 08:00 AM. 4 techs assigned.',
      'icon': Icons.calendar_today,
      'iconColor': AeraColors.info,
      'actionText': 'Open Schedule',
      'route': '/calendar',
      'isUnread': false,
    },
  ];

  final List<String> _categories = ['All', 'Dispatch & Jobs', 'Commercial', 'System'];

  @override
  Widget build(BuildContext context) {
    final filtered = _notifications.where((n) {
      if (_activeFilter == 'All') return true;
      return n['category'] == _activeFilter;
    }).toList();

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AppBar(
        title: const Text('Notification Center'),
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
          // Health Ribbon
          AeraCard(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: AeraColors.accentSoft,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.tune, color: AeraColors.accent, size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            'OPERATIONAL STREAM',
                            style: AeraTypography.labelUpper.copyWith(color: AeraColors.inkSoft),
                          ),
                          const SizedBox(width: 6),
                          Container(
                            width: 6,
                            height: 6,
                            decoration: const BoxDecoration(
                              color: AeraColors.accent,
                              shape: BoxShape.circle,
                            ),
                          ),
                        ],
                      ),
                      Text(
                        '${_notifications.length} updates across dispatch & accounts',
                        style: AeraTypography.bodySm.copyWith(fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ),
                TextButton(
                  onPressed: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('All notifications marked as read')),
                    );
                  },
                  child: const Text('Clear All'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),

          // Category Filter Tabs
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: _categories.map((cat) {
                final isSelected = _activeFilter == cat;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterChip(
                    label: Text(cat),
                    selected: isSelected,
                    onSelected: (_) => setState(() => _activeFilter = cat),
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
          const SizedBox(height: 12),

          // Notification Cards
          ...filtered.map((item) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: AeraCard(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAlignment.start,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAlignment.start,
                        children: [
                          Container(
                            width: 36,
                            height: 36,
                            decoration: BoxDecoration(
                              color: (item['iconColor'] as Color).withOpacity(0.12),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Icon(item['icon'] as IconData, size: 20, color: item['iconColor'] as Color),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Text(
                                      item['title'],
                                      style: AeraTypography.bodySm.copyWith(fontWeight: FontWeight.w700),
                                    ),
                                    const SizedBox(width: 6),
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                                      decoration: BoxDecoration(
                                        color: AeraColors.surfaceSubtle,
                                        borderRadius: BorderRadius.circular(4),
                                      ),
                                      child: Text(
                                        item['tag'],
                                        style: AeraTypography.label.copyWith(fontSize: 10),
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 1),
                                Text(
                                  item['time'],
                                  style: AeraTypography.label.copyWith(color: AeraColors.inkSoft),
                                ),
                              ],
                            ),
                          ),
                          if (item['isUnread'] as bool)
                            Container(
                              width: 8,
                              height: 8,
                              decoration: const BoxDecoration(
                                color: AeraColors.accent,
                                shape: BoxShape.circle,
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Padding(
                        padding: const EdgeInsets.only(left: 46),
                        child: Text(
                          item['body'],
                          style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
                        ),
                      ),
                      if (item['actionText'] != null) ...[
                        const SizedBox(height: 10),
                        Padding(
                          padding: const EdgeInsets.only(left: 46),
                          child: InkWell(
                            onTap: () {
                              if (item['route'] != null) {
                                context.push(item['route']);
                              }
                            },
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  item['actionText'],
                                  style: AeraTypography.label.copyWith(
                                    color: AeraColors.accent,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                const SizedBox(width: 4),
                                const Icon(Icons.arrow_forward, size: 14, color: AeraColors.accent),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              )),
          const SizedBox(height: 20),
        ],
      ),
    );
  }
}
