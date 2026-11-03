import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/network/api_response.dart';
import '../../core/theme/aera_colors.dart';
import 'data/requests_repository.dart';
import 'providers/requests_provider.dart';

class ServiceRequestDetailScreen extends ConsumerWidget {
  const ServiceRequestDetailScreen({required this.requestId, super.key});
  final String requestId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final request = ref.watch(requestDetailProvider(requestId));
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AppBar(title: const Text('Request detail')),
      body: request.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text(
          error is ApiException ? error.message : 'Could not load request',
        )),
        data: (item) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('REQ-${item.requestNumber}',
                style: Theme.of(context).textTheme.labelLarge),
            const SizedBox(height: 6),
            Text(item.title, style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 8),
            Text('${item.customerName}\n${item.address}'),
            const SizedBox(height: 16),
            Card(child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(item.status.replaceAll('_', ' '),
                    style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                Text(item.description),
                const SizedBox(height: 8),
                Text('${item.serviceCategory} · ${item.priority}'),
              ]),
            )),
            const SizedBox(height: 16),
            if (item.status == 'SUBMITTED')
              _ActionButton(
                label: 'Request more information',
                action: 'request-information',
                requestId: requestId,
              ),
            if (item.status == 'QUOTING' || item.status == 'SUBMITTED')
              _ActionButton(
                label: 'Mark inspection required',
                action: 'mark-inspection',
                requestId: requestId,
              ),
            if (item.status == 'ACCEPTED')
              _ActionButton(label: 'Close request', action: 'close', requestId: requestId),
            const SizedBox(height: 16),
            Text('Activity', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            ...item.events.map((event) => ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(event.type.replaceAll('_', ' ')),
              subtitle: Text([
                if (event.fromStatus != null) '${event.fromStatus} → ',
                event.toStatus ?? '',
                if (event.actorName != null) ' · ${event.actorName}',
              ].join()),
              trailing: Text(
                '${event.createdAt.month}/${event.createdAt.day}',
                style: Theme.of(context).textTheme.labelSmall,
              ),
            )),
          ],
        ),
      ),
    );
  }
}

class _ActionButton extends ConsumerWidget {
  const _ActionButton({
    required this.label,
    required this.action,
    required this.requestId,
  });
  final String label;
  final String action;
  final String requestId;

  @override
  Widget build(BuildContext context, WidgetRef ref) => OutlinedButton(
    onPressed: () async {
      try {
        await ref.read(requestsRepositoryProvider).command(requestId, action);
        ref.invalidate(requestDetailProvider(requestId));
        ref.invalidate(requestsListProvider);
      } on ApiException catch (error) {
        if (context.mounted) {
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text(error.message)));
        }
      }
    },
    child: Text(label),
  );
}
