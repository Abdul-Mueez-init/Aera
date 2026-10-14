import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_card.dart';
import 'data/notifications_repository.dart' as model;
import 'providers/notifications_provider.dart';

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() =>
      _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  bool _unreadOnly = false;
  bool _isMarkingAll = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(notificationsListProvider.notifier).loadNotifications(
            unreadOnly: _unreadOnly,
          );
    });
  }

  void _toggleFilter(bool unreadOnly) {
    if (_unreadOnly == unreadOnly) return;
    setState(() => _unreadOnly = unreadOnly);
    ref
        .read(notificationsListProvider.notifier)
        .loadNotifications(unreadOnly: unreadOnly);
  }

  Future<void> _markAllAsRead() async {
    setState(() => _isMarkingAll = true);
    await ref.read(notificationsListProvider.notifier).markAllAsRead();
    if (mounted) {
      setState(() => _isMarkingAll = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('All notifications marked as read')),
      );
    }
  }

  IconData _iconForType(String type) {
    switch (type) {
      case 'JOB_ASSIGNED':
        return Icons.assignment_ind;
      case 'JOB_SCHEDULED':
        return Icons.calendar_today;
      case 'JOB_RESCHEDULED':
        return Icons.schedule;
      case 'QUOTE_SENT':
        return Icons.send;
      case 'QUOTE_APPROVED':
        return Icons.check_circle_outline;
      case 'QUOTE_DECLINED':
        return Icons.cancel_outlined;
      case 'INVOICE_ISSUED':
        return Icons.receipt_long;
      case 'INVOICE_PAYMENT_REMINDER':
        return Icons.notifications_active;
      default:
        return Icons.notifications;
    }
  }

  Color _colorForType(String type) {
    switch (type) {
      case 'JOB_ASSIGNED':
      case 'INVOICE_ISSUED':
        return AeraColors.accent;
      case 'JOB_SCHEDULED':
        return AeraColors.info;
      case 'JOB_RESCHEDULED':
      case 'INVOICE_PAYMENT_REMINDER':
        return AeraColors.warning;
      case 'QUOTE_APPROVED':
        return AeraColors.success;
      case 'QUOTE_DECLINED':
        return AeraColors.danger;
      default:
        return AeraColors.accent;
    }
  }

  String _titleForType(String type) {
    switch (type) {
      case 'JOB_ASSIGNED':
        return 'Job Assigned';
      case 'JOB_SCHEDULED':
        return 'Job Scheduled';
      case 'JOB_RESCHEDULED':
        return 'Job Rescheduled';
      case 'QUOTE_SENT':
        return 'Quote Sent';
      case 'QUOTE_APPROVED':
        return 'Quote Approved';
      case 'QUOTE_DECLINED':
        return 'Quote Declined';
      case 'INVOICE_ISSUED':
        return 'Invoice Issued';
      case 'INVOICE_PAYMENT_REMINDER':
        return 'Payment Reminder';
      default:
        return type.replaceAll('_', ' ');
    }
  }

  String _formatTime(DateTime date) {
    final now = DateTime.now();
    final diff = now.difference(date);
    if (diff.inMinutes < 1) {
      return 'Just now';
    } else if (diff.inMinutes < 60) {
      return '${diff.inMinutes}m ago';
    } else if (diff.inHours < 24) {
      return '${diff.inHours}h ago';
    } else if (diff.inDays < 7) {
      return '${diff.inDays}d ago';
    } else {
      return '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
    }
  }

  void _onNotificationTap(model.Notification item) {
    if (item.isUnread) {
      ref.read(notificationsListProvider.notifier).markAsRead(item.id);
    }
    final payload = item.payload;
    if (payload != null) {
      if (payload['jobId'] != null) {
        context.push('/jobs/${payload['jobId']}');
      } else if (payload['quoteId'] != null) {
        context.push('/quotes/${payload['quoteId']}');
      } else if (payload['invoiceId'] != null) {
        context.push('/invoices/${payload['invoiceId']}');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(notificationsListProvider);

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AppBar(
        title: const Text('Notification Center'),
        actions: [
          if (state.meta.unreadCount > 0)
            IconButton(
              icon: _isMarkingAll
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.done_all),
              tooltip: 'Mark all as read',
              onPressed: _isMarkingAll ? null : _markAllAsRead,
            ),
        ],
      ),
      body: Column(
        children: [
          // Header / Filter Ribbon
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            color: AeraColors.canvas,
            child: Row(
              children: [
                FilterChip(
                  label: const Text('All'),
                  selected: !_unreadOnly,
                  onSelected: (_) => _toggleFilter(false),
                  backgroundColor: AeraColors.surface,
                  selectedColor: AeraColors.accent,
                  labelStyle: AeraTypography.label.copyWith(
                    color: !_unreadOnly
                        ? AeraColors.surface
                        : AeraColors.inkSoft,
                    fontWeight:
                        !_unreadOnly ? FontWeight.w600 : FontWeight.w500,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(20),
                    side: BorderSide(
                      color:
                          !_unreadOnly ? AeraColors.accent : AeraColors.line,
                    ),
                  ),
                  showCheckmark: false,
                ),
                const SizedBox(width: 8),
                FilterChip(
                  label: Text('Unread (${state.meta.unreadCount})'),
                  selected: _unreadOnly,
                  onSelected: (_) => _toggleFilter(true),
                  backgroundColor: AeraColors.surface,
                  selectedColor: AeraColors.accent,
                  labelStyle: AeraTypography.label.copyWith(
                    color: _unreadOnly
                        ? AeraColors.surface
                        : AeraColors.inkSoft,
                    fontWeight: _unreadOnly ? FontWeight.w600 : FontWeight.w500,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(20),
                    side: BorderSide(
                      color: _unreadOnly ? AeraColors.accent : AeraColors.line,
                    ),
                  ),
                  showCheckmark: false,
                ),
                const Spacer(),
                if (state.meta.unreadCount > 0)
                  TextButton.icon(
                    onPressed: _isMarkingAll ? null : _markAllAsRead,
                    icon: const Icon(Icons.done_all, size: 16),
                    label: const Text('Mark all read'),
                  ),
              ],
            ),
          ),
          const Divider(height: 1, color: AeraColors.line),

          // Content Area
          Expanded(
            child: _buildContent(state),
          ),
        ],
      ),
    );
  }

  Widget _buildContent(NotificationListState state) {
    if (state.isLoading && state.items.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    if (state.error != null && state.items.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline,
                  color: AeraColors.danger, size: 36),
              const SizedBox(height: 12),
              Text(
                state.error!,
                textAlign: TextAlign.center,
                style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
              ),
              const SizedBox(height: 16),
              OutlinedButton.icon(
                onPressed: () => ref
                    .read(notificationsListProvider.notifier)
                    .loadNotifications(unreadOnly: _unreadOnly),
                icon: const Icon(Icons.refresh, size: 18),
                label: const Text('Try again'),
              ),
            ],
          ),
        ),
      );
    }

    if (state.items.isEmpty) {
      return RefreshIndicator(
        onRefresh: () => ref.read(notificationsListProvider.notifier).refresh(),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            SizedBox(
              height: 300,
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.notifications_none,
                      size: 48,
                      color: AeraColors.outline,
                    ),
                    const SizedBox(height: 12),
                    Text(
                      _unreadOnly
                          ? 'No unread notifications'
                          : 'No notifications yet',
                      style: AeraTypography.body.copyWith(
                        color: AeraColors.inkSoft,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'You are all caught up!',
                      style: AeraTypography.label.copyWith(
                        color: AeraColors.outline,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () => ref.read(notificationsListProvider.notifier).refresh(),
      child: ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        itemCount: state.items.length,
        separatorBuilder: (_, _) => const SizedBox(height: 10),
        itemBuilder: (context, index) {
          final item = state.items[index];
          final icon = _iconForType(item.type);
          final color = _colorForType(item.type);
          final title = _titleForType(item.type);
          final timeStr = _formatTime(item.createdAt);

          return InkWell(
            onTap: () => _onNotificationTap(item),
            borderRadius: BorderRadius.circular(12),
            child: AeraCard(
              padding: const EdgeInsets.all(14),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(icon, size: 20, color: color),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                title,
                                style: AeraTypography.bodySm.copyWith(
                                  fontWeight: item.isUnread
                                      ? FontWeight.w700
                                      : FontWeight.w500,
                                ),
                              ),
                            ),
                            Text(
                              timeStr,
                              style: AeraTypography.label.copyWith(
                                color: AeraColors.outline,
                                fontSize: 11,
                              ),
                            ),
                            if (item.isUnread) ...[
                              const SizedBox(width: 8),
                              Container(
                                width: 8,
                                height: 8,
                                decoration: const BoxDecoration(
                                  color: AeraColors.accent,
                                  shape: BoxShape.circle,
                                ),
                              ),
                            ],
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          _formatPayload(item.payload),
                          style: AeraTypography.label.copyWith(
                            color: AeraColors.inkSoft,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  String _formatPayload(Map<String, dynamic>? payload) {
    if (payload == null || payload.isEmpty) {
      return 'Tap to view details';
    }
    if (payload['jobId'] != null) {
      return 'Job: ${payload['jobId']}';
    }
    if (payload['quoteId'] != null) {
      return 'Quote: ${payload['quoteId']}';
    }
    if (payload['invoiceId'] != null) {
      return 'Invoice: ${payload['invoiceId']}';
    }
    return payload.values.map((v) => v.toString()).join(' • ');
  }
}
