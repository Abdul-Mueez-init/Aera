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
    return Notification(
      id: json['id'] as String,
      type: json['type'] as String,
      payload: json['payload'] as Map<String, dynamic>?,
      readAt: json['readAt'] != null ? DateTime.parse(json['readAt'] as String) : null,
      createdAt: DateTime.parse(json['createdAt'] as String),
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

  NotificationListResponse({
    required this.items,
    required this.meta,
  });

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

  NotificationsRepository({ApiClient? apiClient})
      : _apiClient = apiClient ?? ApiClient();

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
      '/notifications',
      queryParameters: queryParameters,
    );
    return NotificationListResponse.fromJson(data as Map<String, dynamic>);
  }

  Future<Notification> markAsRead(String notificationId) async {
    final data = await _apiClient.post(
      '/notifications/$notificationId/read',
    );
    return Notification.fromJson(data as Map<String, dynamic>);
  }
}
