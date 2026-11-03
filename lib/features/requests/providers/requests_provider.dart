import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/requests_repository.dart';

class RequestsQuery {
  const RequestsQuery({
    this.page = 1,
    this.pageSize = 20,
    this.status,
    this.priority,
    this.requiresInspection,
    this.search = '',
  });
  final int page;
  final int pageSize;
  final String? status;
  final String? priority;
  final bool? requiresInspection;
  final String search;

  RequestsQuery copyWith({
    int? page,
    String? status,
    String? priority,
    bool? requiresInspection,
    String? search,
    bool clearStatus = false,
    bool clearPriority = false,
    bool clearInspection = false,
  }) =>
      RequestsQuery(
        page: page ?? this.page,
        pageSize: pageSize,
        status: clearStatus ? null : status ?? this.status,
        priority: clearPriority ? null : priority ?? this.priority,
        requiresInspection:
            clearInspection ? null : requiresInspection ?? this.requiresInspection,
        search: search ?? this.search,
      );

  @override
  bool operator ==(Object other) =>
      other is RequestsQuery &&
      page == other.page &&
      status == other.status &&
      priority == other.priority &&
      requiresInspection == other.requiresInspection &&
      search == other.search;

  @override
  int get hashCode =>
      Object.hash(page, status, priority, requiresInspection, search);
}

final requestsQueryProvider =
    StateProvider<RequestsQuery>((ref) => const RequestsQuery());

final requestsListProvider = FutureProvider<PaginatedServiceRequests>((ref) {
  final query = ref.watch(requestsQueryProvider);
  return ref.watch(requestsRepositoryProvider).listRequests(
        page: query.page,
        pageSize: query.pageSize,
        status: query.status,
        priority: query.priority,
        requiresInspection: query.requiresInspection,
        search: query.search,
      );
});

final requestDetailProvider =
    FutureProvider.family<ServiceRequest, String>((ref, id) {
  return ref.watch(requestsRepositoryProvider).getRequest(id);
});
