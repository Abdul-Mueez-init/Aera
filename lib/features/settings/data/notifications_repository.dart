import 'package:aera/core/network/api_client.dart';

class Notification {
  final String id;
  final String type;
  final Map<String, dynamic>? payload;
  final DateTime? readAt;
  final DateTime createdAt;

  Notification({
    required this.id,
    required this.type,
    this.payload,
    this.readAt,
    required this.createdAt,
  });

  factory Notification.fromJson(Map<String, dynamic> json) {
    DateTime? parseDateTime(String? value) {
      if (value == null) return null;
      try {
        return DateTime.parse(value);
      } catch (_) {
        // Return a fallback timestamp if parsing fails
        return DateTime.now();
      }
    }

    return Notification(
      id: json['id'] as String,
      type: json['type'] as String,
      payload: json['payload'] as Map<String, dynamic>?,
      readAt: parseDateTime(json['readAt'] as String?),
      createdAt: parseDateTime(json['createdAt'] as String?) ?? DateTime.now(),
    );
  }

  bool get isUnread => readAt == null;
}

class NotificationMeta {
  final int page;
  final int pageSize;
  final int total;
  final int pageCount;
  final int unreadCount;

  NotificationMeta({
    required this.page,
    required this.pageSize,
    required this.total,
    required this.pageCount,
    required this.unreadCount,
  });

  factory NotificationMeta.fromJson(Map<String, dynamic> json) {
    return NotificationMeta(
      page: json['page'] as int,
      pageSize: json['pageSize'] as int,
      total: json['total'] as int,
      pageCount: json['pageCount'] as int,
      unreadCount: json['unreadCount'] as int,
    );
  }
}

class NotificationListResponse {
  final List<Notification> items;
  final NotificationMeta meta;

  NotificationListResponse({required this.items, required this.meta});

  factory NotificationListResponse.fromJson(Map<String, dynamic> json) {
    return NotificationListResponse(
      items: (json['items'] as List)
          .map((item) => Notification.fromJson(item as Map<String, dynamic>))
          .toList(),
      meta: NotificationMeta.fromJson(json['meta'] as Map<String, dynamic>),
    );
  }
}

class NotificationsRepository {
  final ApiClient _apiClient;

  /// Always built with the app-wide [ApiClient] (see
  /// `notificationsRepositoryProvider`). A private `ApiClient()` would have no
  /// access token, no token refresh and no session-expiry handling.
  NotificationsRepository({required ApiClient apiClient})
    : _apiClient = apiClient;

  Future<NotificationListResponse> listNotifications({
    int page = 1,
    int pageSize = 20,
    bool unreadOnly = false,
  }) async {
    final queryParameters = {
      'page': page.toString(),
      'pageSize': pageSize.toString(),
      'unreadOnly': unreadOnly.toString(),
    };

    final data = await _apiClient.get(
      '/api/v1/notifications',
      queryParameters: queryParameters,
    );
    return NotificationListResponse.fromJson(data as Map<String, dynamic>);
  }

  Future<Notification> markAsRead(String notificationId) async {
    final data = await _apiClient.post(
      '/api/v1/notifications/$notificationId/read',
    );
    return Notification.fromJson(data as Map<String, dynamic>);
  }
}
