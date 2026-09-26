import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/notifications_repository.dart';

final notificationsRepositoryProvider = Provider<NotificationsRepository>((ref) {
  return NotificationsRepository();
});

class NotificationListState {
  final List<Notification> items;
  final NotificationMeta meta;
  final bool isLoading;
  final String? error;
  final bool unreadOnly;

  NotificationListState({
    this.items = const [],
    required this.meta,
    this.isLoading = false,
    this.error,
    this.unreadOnly = false,
  });

  NotificationListState copyWith({
    List<Notification>? items,
    NotificationMeta? meta,
    bool? isLoading,
    String? error,
    bool? unreadOnly,
  }) {
    return NotificationListState(
      items: items ?? this.items,
      meta: meta ?? this.meta,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      unreadOnly: unreadOnly ?? this.unreadOnly,
    );
  }
}

class NotificationListNotifier extends StateNotifier<NotificationListState> {
  final NotificationsRepository _repository;

  NotificationListNotifier(this._repository)
      : super(NotificationListState(
          meta: NotificationMeta(
            page: 1,
            pageSize: 20,
            total: 0,
            pageCount: 0,
            unreadCount: 0,
          ),
        ));

  Future<void> loadNotifications({bool unreadOnly = false}) async {
    state = state.copyWith(isLoading: true, error: null, unreadOnly: unreadOnly);
    try {
      final response = await _repository.listNotifications(
        page: 1,
        pageSize: 20,
        unreadOnly: unreadOnly,
      );
      state = state.copyWith(
        items: response.items,
        meta: response.meta,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: e.toString(),
      );
    }
  }

  Future<void> refresh() async {
    await loadNotifications(unreadOnly: state.unreadOnly);
  }

  Future<void> markAsRead(String notificationId) async {
    try {
      await _repository.markAsRead(notificationId);
      // Update local state
      final updatedItems = state.items.map((notif) {
        if (notif.id == notificationId) {
          return Notification(
            id: notif.id,
            type: notif.type,
            payload: notif.payload,
            readAt: DateTime.now(),
            createdAt: notif.createdAt,
          );
        }
        return notif;
      }).toList();

      final updatedMeta = NotificationMeta(
        page: state.meta.page,
        pageSize: state.meta.pageSize,
        total: state.meta.total,
        pageCount: state.meta.pageCount,
        unreadCount: state.meta.unreadCount > 0 ? state.meta.unreadCount - 1 : 0,
      );

      state = state.copyWith(items: updatedItems, meta: updatedMeta);
    } catch (e) {
      // Don't update state on error, but could show error to user
    }
  }

  Future<void> markAllAsRead() async {
    final unreadItems = state.items.where((n) => n.isUnread).toList();
    for (final item in unreadItems) {
      await markAsRead(item.id);
    }
  }
}

final notificationsListProvider =
    StateNotifierProvider<NotificationListNotifier, NotificationListState>((ref) {
  final repository = ref.watch(notificationsRepositoryProvider);
  return NotificationListNotifier(repository);
});
