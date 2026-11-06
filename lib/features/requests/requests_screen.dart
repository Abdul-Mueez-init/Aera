import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/network/api_response.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_status_chip.dart';
import 'data/requests_repository.dart';
import 'providers/requests_provider.dart';

const _statuses = <String, String?>{
  'All': null,
  'Submitted': 'SUBMITTED',
  'Needs info': 'NEEDS_INFO',
  'Quoting': 'QUOTING',
  'Quoted': 'QUOTED',
  'Accepted': 'ACCEPTED',
};

const _agingFilters = <String, String?>{
  'Any age': null,
  'Over 24h': '24h',
  'Over 72h': '72h',
};

AeraStatusType _statusType(String status) {
  switch (status) {
    case 'ACCEPTED':
      return AeraStatusType.completed;
    case 'NEEDS_INFO':
      return AeraStatusType.warning;
    case 'QUOTED':
      return AeraStatusType.info;
    case 'CANCELLED':
    case 'CLOSED':
      return AeraStatusType.neutral;
    default:
      return AeraStatusType.inProgress;
  }
}

class RequestsScreen extends ConsumerStatefulWidget {
  const RequestsScreen({super.key});
  @override
  ConsumerState<RequestsScreen> createState() => _RequestsScreenState();
}

class _RequestsScreenState extends ConsumerState<RequestsScreen> {
  @override
  Widget build(BuildContext context) {
    final requests = ref.watch(requestsListProvider);
    final query = ref.watch(requestsQueryProvider);
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AppBar(title: const Text('Service Requests')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/create-service-request'),
        icon: const Icon(Icons.add),
        label: const Text('New Request'),
      ),
      body: requests.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => _ErrorState(
          message: error is ApiException ? error.message : 'Could not load requests',
          onRetry: () => ref.invalidate(requestsListProvider),
        ),
        data: (page) => RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(requestsListProvider);
            await ref.read(requestsListProvider.future);
          },
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text('${page.meta.total} requests', style: AeraTypography.bodySm),
              const SizedBox(height: 12),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: _statuses.entries.map((entry) {
                    final selected = query.status == entry.value;
                    return Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        label: Text(entry.key),
                        selected: selected,
                        onSelected: (_) {
                          ref.read(requestsQueryProvider.notifier).state =
                              query.copyWith(
                            page: 1,
                            status: entry.value,
                            clearStatus: entry.value == null,
                          );
                        },
                      ),
                    );
                  }).toList(),
                ),
              ),
              const SizedBox(height: 8),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    ..._agingFilters.entries.map((entry) {
                      final selected = query.aging == entry.value;
                      return Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ChoiceChip(
                          label: Text(entry.key),
                          selected: selected,
                          onSelected: (_) {
                            ref.read(requestsQueryProvider.notifier).state =
                                query.copyWith(
                              page: 1,
                              aging: entry.value,
                              clearAging: entry.value == null,
                            );
                          },
                        ),
                      );
                    }),
                    FilterChip(
                      label: const Text('Inspection'),
                      selected: query.requiresInspection == true,
                      onSelected: (selected) {
                        ref.read(requestsQueryProvider.notifier).state =
                            query.copyWith(
                          page: 1,
                          requiresInspection: selected ? true : null,
                          clearInspection: !selected,
                        );
                      },
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              if (page.items.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 56),
                  child: Center(child: Text('No service requests match these filters')),
                )
              else
                ...page.items.map((item) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: _RequestCard(request: item),
                    )),
              if (page.meta.pageCount > 1)
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    IconButton(
                      onPressed: page.meta.page > 1
                          ? () => ref.read(requestsQueryProvider.notifier).state =
                              query.copyWith(page: page.meta.page - 1)
                          : null,
                      icon: const Icon(Icons.chevron_left),
                    ),
                    Text('${page.meta.page} / ${page.meta.pageCount}'),
                    IconButton(
                      onPressed: page.meta.page < page.meta.pageCount
                          ? () => ref.read(requestsQueryProvider.notifier).state =
                              query.copyWith(page: page.meta.page + 1)
                          : null,
                      icon: const Icon(Icons.chevron_right),
                    ),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RequestCard extends StatelessWidget {
  const _RequestCard({required this.request});
  final ServiceRequest request;
  @override
  Widget build(BuildContext context) => InkWell(
        onTap: () => context.push('/service-requests/${request.id}'),
        borderRadius: BorderRadius.circular(12),
        child: AeraCard(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      'REQ-${request.requestNumber} · ${request.title}',
                      style: AeraTypography.bodyMedium.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  AeraStatusChip(
                    label: request.status.replaceAll('_', ' '),
                    type: _statusType(request.status),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(request.customerName, style: AeraTypography.bodySm),
              if (request.address.isNotEmpty)
                Text(request.address, style: AeraTypography.bodySm),
              const SizedBox(height: 8),
              Text(
                request.requiresInspection
                    ? '${request.serviceCategory} · Inspection'
                    : request.serviceCategory,
                style: AeraTypography.label,
              ),
            ],
          ),
        ),
      );
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [Text(message), const SizedBox(height: 12), TextButton(
            onPressed: onRetry, child: const Text('Retry'),
          )],
        ),
      );
}
