import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../customers/data/customers_repository.dart' show PageMeta;

final requestsRepositoryProvider = Provider<RequestsRepository>((ref) {
  return RequestsRepository(ref.watch(apiClientProvider));
});

class ServiceRequest {
  const ServiceRequest({
    required this.id,
    required this.requestNumber,
    required this.title,
    required this.description,
    required this.serviceCategory,
    required this.priority,
    required this.status,
    required this.requiresInspection,
    required this.source,
    required this.customerName,
    required this.address,
    required this.createdAt,
    this.closedAt,
    this.events = const [],
  });

  final String id;
  final int requestNumber;
  final String title;
  final String description;
  final String serviceCategory;
  final String priority;
  final String status;
  final bool requiresInspection;
  final String source;
  final String customerName;
  final String address;
  final DateTime createdAt;
  final DateTime? closedAt;
  final List<ServiceRequestEvent> events;

  factory ServiceRequest.fromJson(Map<String, dynamic> json) {
    final customer = json['customer'] as Map<String, dynamic>?;
    final address = json['serviceAddress'] as Map<String, dynamic>?;
    return ServiceRequest(
      id: json['id'] as String? ?? '',
      requestNumber: json['requestNumber'] as int? ?? 0,
      title: json['title'] as String? ?? '',
      description: json['description'] as String? ?? '',
      serviceCategory: json['serviceCategory'] as String? ?? '',
      priority: json['priority'] as String? ?? 'NORMAL',
      status: json['status'] as String? ?? 'SUBMITTED',
      requiresInspection: json['requiresInspection'] as bool? ?? false,
      source: json['source'] as String? ?? 'PHONE',
      customerName:
          '${customer?['firstName'] ?? ''} ${customer?['lastName'] ?? ''}'.trim(),
      address: [
        address?['line1'],
        address?['city'],
      ].whereType<String>().where((value) => value.isNotEmpty).join(', '),
      createdAt: (DateTime.tryParse(json['createdAt'] as String? ?? '') ??
              DateTime.now())
          .toLocal(),
      closedAt: json['closedAt'] == null
          ? null
          : DateTime.tryParse(json['closedAt'] as String),
      events: (json['events'] as List<dynamic>?)
              ?.map((event) => ServiceRequestEvent.fromJson(
                  event as Map<String, dynamic>))
              .toList() ??
          const [],
    );
  }
}

class ServiceRequestEvent {
  const ServiceRequestEvent({
    required this.type,
    required this.toStatus,
    required this.createdAt,
    this.fromStatus,
    this.actorName,
  });

  final String type;
  final String? fromStatus;
  final String? toStatus;
  final DateTime createdAt;
  final String? actorName;

  factory ServiceRequestEvent.fromJson(Map<String, dynamic> json) {
    final actor = json['actor'] as Map<String, dynamic>?;
    return ServiceRequestEvent(
      type: json['type'] as String? ?? 'STATUS_CHANGED',
      fromStatus: json['fromStatus'] as String?,
      toStatus: json['toStatus'] as String?,
      createdAt: (DateTime.tryParse(json['createdAt'] as String? ?? '') ??
              DateTime.now())
          .toLocal(),
      actorName: actor == null
          ? null
          : '${actor['firstName'] ?? ''} ${actor['lastName'] ?? ''}'.trim(),
    );
  }
}

class PaginatedServiceRequests {
  const PaginatedServiceRequests({required this.items, required this.meta});
  final List<ServiceRequest> items;
  final PageMeta meta;
}

class CreateServiceRequestInput {
  const CreateServiceRequestInput({
    required this.customerId,
    required this.serviceAddressId,
    required this.title,
    required this.description,
    required this.serviceCategory,
    required this.priority,
    required this.requiresInspection,
  });
  final String customerId;
  final String serviceAddressId;
  final String title;
  final String description;
  final String serviceCategory;
  final String priority;
  final bool requiresInspection;
}

class RequestsRepository {
  RequestsRepository(this._client);
  final ApiClient _client;

  Future<PaginatedServiceRequests> listRequests({
    int page = 1,
    int pageSize = 20,
    String? status,
    String? priority,
    bool? requiresInspection,
    String? search,
  }) async {
    final data = await _client.get('/api/v1/service-requests', queryParameters: {
      'page': '$page',
      'pageSize': '$pageSize',
      'status': ?status,
      'priority': ?priority,
      if (requiresInspection != null)
        'requiresInspection': '$requiresInspection',
      if (search != null && search.isNotEmpty) 'search': search,
    }) as Map<String, dynamic>;
    return PaginatedServiceRequests(
      items: (data['items'] as List<dynamic>)
          .map((item) => ServiceRequest.fromJson(item as Map<String, dynamic>))
          .toList(),
      meta: PageMeta.fromJson(data['meta'] as Map<String, dynamic>),
    );
  }

  Future<ServiceRequest> getRequest(String id) async {
    final data =
        await _client.get('/api/v1/service-requests/$id') as Map<String, dynamic>;
    return ServiceRequest.fromJson(data);
  }

  Future<ServiceRequest> createRequest(CreateServiceRequestInput input) async {
    final data = await _client.post('/api/v1/service-requests', body: {
      'customerId': input.customerId,
      'serviceAddressId': input.serviceAddressId,
      'title': input.title.trim(),
      'description': input.description.trim(),
      'serviceCategory': input.serviceCategory.trim(),
      'priority': input.priority,
      'requiresInspection': input.requiresInspection,
      'source': 'PHONE',
    }) as Map<String, dynamic>;
    return ServiceRequest.fromJson(data);
  }

  Future<ServiceRequest> command(String id, String action) async {
    final data = await _client.post(
      '/api/v1/service-requests/$id/$action',
    ) as Map<String, dynamic>;
    return ServiceRequest.fromJson(data);
  }
}
