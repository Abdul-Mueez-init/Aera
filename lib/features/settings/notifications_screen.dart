import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_card.dart';
import 'data/notifications_repository.dart' as notif;
import 'providers/notifications_provider.dart';

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  String _activeFilter = 'All';

  @override
  void initState() {
    super.initState();
    // Load notifications on init
    Future.microtask(() {
      ref.read(notificationsListProvider.notifier).loadNotifications();
    });
  }

  IconData _getIconForType(String type) {
    switch (type) {
      case 'QUOTE_APPROVED':
        return Icons.task_alt;
      case 'QUOTE_DECLINED':
        return Icons.cancel;
      case 'JOB_SCHEDULED':
        return Icons.calendar_today;
      case 'JOB_ASSIGNED':
        return Icons.person_add;
      case 'JOB_STARTED':
        return Icons.play_arrow;
      case 'JOB_COMPLETED':
        return Icons.check_circle;
      case 'INVOICE_ISSUED':
        return Icons.receipt_long;
      case 'INVOICE_PAID':
        return Icons.account_balance_wallet;
      case 'NOTIFICATION':
      default:
        return Icons.notifications;
    }
  }

  Color _getColorForType(String type) {
    switch (type) {
      case 'QUOTE_APPROVED':
      case 'JOB_COMPLETED':
      case 'INVOICE_PAID':
        return AeraColors.success;
      case 'QUOTE_DECLINED':
        return AeraColors.danger;
      case 'JOB_SCHEDULED':
      case 'JOB_ASSIGNED':
        return AeraColors.info;
      case 'JOB_STARTED':
        return AeraColors.accent;
      case 'INVOICE_ISSUED':
        return AeraColors.warning;
      default:
        return AeraColors.outline;
    }
  }

  String _formatRelativeTime(DateTime dateTime) {
    final now = DateTime.now();
    final difference = now.difference(dateTime);

    if (difference.inMinutes < 1) {
      return 'Just now';
    } else if (difference.inMinutes < 60) {
      return '${difference.inMinutes} min ago';
    } else if (difference.inHours < 24) {
      return '${difference.inHours}h ago';
    } else if (difference.inDays < 7) {
      return '${difference.inDays}d ago';
    } else {
      return DateFormat('MMM d').format(dateTime);
    }
  }

  String _getNotificationTitle(notif.Notification notification) {
    switch (notification.type) {
      case 'QUOTE_APPROVED':
        return 'Quote Approved';
      case 'QUOTE_DECLINED':
        return 'Quote Declined';
      case 'JOB_SCHEDULED':
        return 'Job Scheduled';
      case 'JOB_ASSIGNED':
        return 'Job Assigned';
      case 'JOB_STARTED':
        return 'Job Started';
      case 'JOB_COMPLETED':
        return 'Job Completed';
      case 'INVOICE_ISSUED':
        return 'Invoice Issued';
      case 'INVOICE_PAID':
        return 'Payment Received';
      default:
        return 'Notification';
    }
  }

  String _getNotificationBody(notif.Notification notification) {
    if (notification.payload == null) {
      return 'No details available';
    }

    switch (notification.type) {
      case 'QUOTE_APPROVED':
        return 'Quote #${notification.payload!['quoteNumber'] ?? 'N/A'} has been approved';
      case 'QUOTE_DECLINED':
        return 'Quote #${notification.payload!['quoteNumber'] ?? 'N/A'} has been declined';
      case 'JOB_SCHEDULED':
        return 'Job #${notification.payload!['jobNumber'] ?? 'N/A'} has been scheduled';
      case 'JOB_ASSIGNED':
        return 'Job #${notification.payload!['jobNumber'] ?? 'N/A'} has been assigned';
      case 'JOB_STARTED':
        return 'Job #${notification.payload!['jobNumber'] ?? 'N/A'} has started';
      case 'JOB_COMPLETED':
        return 'Job #${notification.payload!['jobNumber'] ?? 'N/A'} has been completed';
      case 'INVOICE_ISSUED':
        return 'Invoice #${notification.payload!['invoiceNumber'] ?? 'N/A'} has been issued';
      case 'INVOICE_PAID':
        return 'Payment received for Invoice #${notification.payload!['invoiceNumber'] ?? 'N/A'}';
      default:
        return notification.payload!['message']?.toString() ?? 'Notification';
    }
  }

  String? _getNotificationRoute(notif.Notification notification) {
    if (notification.payload == null) return null;

    switch (notification.type) {
      case 'QUOTE_APPROVED':
      case 'QUOTE_DECLINED':
        final quoteId = notification.payload!['quoteId'];
        return quoteId != null ? '/quotes/$quoteId' : null;
      case 'JOB_SCHEDULED':
      case 'JOB_ASSIGNED':
      case 'JOB_STARTED':
      case 'JOB_COMPLETED':
        final jobId = notification.payload!['jobId'];
        return jobId != null ? '/jobs/$jobId' : null;
      case 'INVOICE_ISSUED':
      case 'INVOICE_PAID':
        final invoiceId = notification.payload!['invoiceId'];
        return invoiceId != null ? '/invoices/$invoiceId' : null;
      default:
        return null;
    }
  }

  String? _getActionText(notif.Notification notification) {
    if (notification.payload == null) return null;

    switch (notification.type) {
      case 'QUOTE_APPROVED':
      case 'QUOTE_DECLINED':
        return 'View Quote';
      case 'JOB_SCHEDULED':
      case 'JOB_ASSIGNED':
      case 'JOB_STARTED':
      case 'JOB_COMPLETED':
        return 'View Job';
      case 'INVOICE_ISSUED':
      case 'INVOICE_PAID':
        return 'View Invoice';
      default:
        return null;
    }
  }

  String? _getTag(notif.Notification notification) {
    if (notification.payload == null) return null;

    switch (notification.type) {
      case 'QUOTE_APPROVED':
      case 'QUOTE_DECLINED':
        return notification.payload!['quoteNumber']?.toString();
      case 'JOB_SCHEDULED':
      case 'JOB_ASSIGNED':
      case 'JOB_STARTED':
      case 'JOB_COMPLETED':
        return notification.payload!['jobNumber']?.toString();
      case 'INVOICE_ISSUED':
      case 'INVOICE_PAID':
        return notification.payload!['invoiceNumber']?.toString();
      default:
        return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final notificationsState = ref.watch(notificationsListProvider);
    final notifications = notificationsState.items;
    final meta = notificationsState.meta;

    // Filter based on selected tab
    final filtered = _activeFilter == 'All'
        ? notifications
        : notifications.where((n) {
            // For now, just show all since we don't have category in the payload
            // This can be enhanced when backend adds category to notification schema
            return true;
          }).toList().cast<notif.Notification>();

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
      body: RefreshIndicator(
        onRefresh: () async {
          await ref.read(notificationsListProvider.notifier).refresh();
        },
        child: ListView(
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
                      crossAxisAlignment: CrossAxisAlignment.start,
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
                          '${meta.total} updates${meta.unreadCount > 0 ? ' • ${meta.unreadCount} unread' : ''}',
                          style: AeraTypography.bodySm.copyWith(fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                  ),
                  if (meta.unreadCount > 0)
                    TextButton(
                      onPressed: () async {
                        await ref.read(notificationsListProvider.notifier).markAllAsRead();
                        if (!context.mounted) return;
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
                children: ['All', 'Unread'].map((cat) {
                  final isSelected = _activeFilter == cat;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: FilterChip(
                      label: Text(cat),
                      selected: isSelected,
                      onSelected: (_) {
                        setState(() {
                          _activeFilter = cat;
                          if (cat == 'Unread') {
                            ref.read(notificationsListProvider.notifier).loadNotifications(unreadOnly: true);
                          } else {
                            ref.read(notificationsListProvider.notifier).loadNotifications(unreadOnly: false);
                          }
                        });
                      },
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

            // Loading State
            if (notificationsState.isLoading)
              const Center(
                child: Padding(
                  padding: EdgeInsets.all(48),
                  child: CircularProgressIndicator(),
                ),
              ),

            // Error State
            if (notificationsState.error != null && !notificationsState.isLoading)
              Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        Icons.error_outline,
                        size: 48,
                        color: AeraColors.danger,
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'Could not load notifications',
                        style: AeraTypography.bodyMedium,
                      ),
                      const SizedBox(height: 8),
                      Text(
                        notificationsState.error!,
                        style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 16),
                      FilledButton(
                        onPressed: () {
                          ref.read(notificationsListProvider.notifier).refresh();
                        },
                        child: const Text('Retry'),
                      ),
                    ],
                  ),
                ),
              ),

            // Empty State
            if (!notificationsState.isLoading &&
                notificationsState.error == null &&
                filtered.isEmpty)
              Center(
                child: Padding(
                  padding: const EdgeInsets.all(48),
                  child: Column(
                    children: [
                      const Icon(
                        Icons.notifications_none,
                        size: 48,
                        color: AeraColors.outline,
                      ),
                      const SizedBox(height: 12),
                      Text(
                        _activeFilter == 'Unread' ? 'No unread notifications' : 'No notifications yet',
                        style: AeraTypography.bodyMedium,
                      ),
                    ],
                  ),
                ),
              ),

            // Notification Cards
            if (!notificationsState.isLoading &&
                notificationsState.error == null &&
                filtered.isNotEmpty)
              ...filtered.map((item) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: AeraCard(
                      padding: const EdgeInsets.all(14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          InkWell(
                            onTap: () async {
                              if (item.isUnread) {
                                await ref.read(notificationsListProvider.notifier).markAsRead(item.id);
                              }
                            },
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Container(
                                  width: 36,
                                  height: 36,
                                  decoration: BoxDecoration(
                                    color: _getColorForType(item.type).withValues(alpha: 0.12),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Icon(
                                    _getIconForType(item.type),
                                    size: 20,
                                    color: _getColorForType(item.type),
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        children: [
                                          Text(
                                            _getNotificationTitle(item),
                                            style: AeraTypography.bodySm.copyWith(fontWeight: FontWeight.w700),
                                          ),
                                          const SizedBox(width: 6),
                                          if (_getTag(item) != null)
                                            Container(
                                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                                              decoration: BoxDecoration(
                                                color: AeraColors.surfaceSubtle,
                                                borderRadius: BorderRadius.circular(4),
                                              ),
                                              child: Text(
                                                _getTag(item)!,
                                                style: AeraTypography.label.copyWith(fontSize: 10),
                                              ),
                                            ),
                                        ],
                                      ),
                                      const SizedBox(height: 1),
                                      Text(
                                        _formatRelativeTime(item.createdAt),
                                        style: AeraTypography.label.copyWith(color: AeraColors.inkSoft),
                                      ),
                                    ],
                                  ),
                                ),
                                if (item.isUnread)
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
                          ),
                          const SizedBox(height: 8),
                          Padding(
                            padding: const EdgeInsets.only(left: 46),
                            child: Text(
                              _getNotificationBody(item),
                              style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
                            ),
                          ),
                          if (_getActionText(item) != null && _getNotificationRoute(item) != null) ...[
                            const SizedBox(height: 10),
                            Padding(
                              padding: const EdgeInsets.only(left: 46),
                              child: InkWell(
                                onTap: () async {
                                  // Mark as read before navigating
                                  if (item.isUnread) {
                                    await ref.read(notificationsListProvider.notifier).markAsRead(item.id);
                                  }
                                  final route = _getNotificationRoute(item);
                                  if (route != null) {
                                    if (!context.mounted) return;
                                    context.push(route);
                                  }
                                },
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(
                                      _getActionText(item)!,
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
      ),
    );
  }
}
