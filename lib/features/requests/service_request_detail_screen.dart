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
            if (item.status == 'SUBMITTED' || item.status == 'NEEDS_INFO')
              _RequestInfoButton(requestId: requestId),
            if (item.status == 'QUOTING' || item.status == 'SUBMITTED')
              _ActionButton(
                label: 'Mark inspection required',
                action: 'mark-inspection',
                requestId: requestId,
              ),
            if (item.status == 'ACCEPTED')
              _ActionButton(label: 'Close request', action: 'close', requestId: requestId),
            const SizedBox(height: 16),
            _MediaSection(requestId: requestId),
            const SizedBox(height: 16),
            _MessageThread(requestId: requestId),
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

class _MediaSection extends ConsumerWidget {
  const _MediaSection({required this.requestId});
  final String requestId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final media = ref.watch(requestMediaProvider(requestId));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Photos & files', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        media.when(
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (_, _) => const Text('Could not load attachments'),
          data: (items) {
            if (items.isEmpty) {
              return const Text('No attachments yet');
            }
            return SizedBox(
              height: 96,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: items.length,
                separatorBuilder: (_, _) => const SizedBox(width: 8),
                itemBuilder: (context, index) {
                  final item = items[index];
                  return _MediaThumb(item: item);
                },
              ),
            );
          },
        ),
      ],
    );
  }
}

class _MediaThumb extends StatelessWidget {
  const _MediaThumb({required this.item});
  final ServiceRequestAttachment item;

  @override
  Widget build(BuildContext context) {
    final url = item.signedReadUrl;
    final tile = item.isImage && url != null
        ? Image.network(
            url,
            width: 96,
            height: 96,
            fit: BoxFit.cover,
            // Decode at thumbnail size, not full resolution.
            cacheWidth: 192,
            loadingBuilder: (context, child, progress) => progress == null
                ? child
                : const SizedBox(
                    width: 96,
                    height: 96,
                    child: Center(child: CircularProgressIndicator()),
                  ),
            errorBuilder: (_, _, _) => _placeholder(Icons.broken_image),
          )
        : _placeholder(
            item.kind == 'VIDEO'
                ? Icons.videocam
                : item.kind == 'PHOTO'
                    ? Icons.image
                    : Icons.description,
          );
    return Tooltip(
      message: item.caption ?? item.mimeType,
      child: ClipRRect(borderRadius: BorderRadius.circular(8), child: tile),
    );
  }

  Widget _placeholder(IconData icon) => Container(
        width: 96,
        height: 96,
        color: AeraColors.canvas,
        child: Icon(icon, color: AeraColors.inkSoft),
      );
}

class _MessageThread extends ConsumerStatefulWidget {
  const _MessageThread({required this.requestId});
  final String requestId;

  @override
  ConsumerState<_MessageThread> createState() => _MessageThreadState();
}

class _MessageThreadState extends ConsumerState<_MessageThread> {
  final _controller = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final body = _controller.text.trim();
    if (body.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      await ref
          .read(requestsRepositoryProvider)
          .postRequestMessage(widget.requestId, body);
      _controller.clear();
      ref.invalidate(requestMessagesProvider(widget.requestId));
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final messages = ref.watch(requestMessagesProvider(widget.requestId));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Conversation', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        messages.when(
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (_, _) => const Text('Could not load messages'),
          data: (items) => items.isEmpty
              ? const Text('No messages yet')
              : Column(
                  children: items
                      .map((message) => Align(
                            alignment: message.isStaff
                                ? Alignment.centerLeft
                                : Alignment.centerRight,
                            child: Container(
                              margin: const EdgeInsets.only(bottom: 6),
                              padding: const EdgeInsets.symmetric(
                                horizontal: 12,
                                vertical: 8,
                              ),
                              decoration: BoxDecoration(
                                color: message.isStaff
                                    ? AeraColors.canvas
                                    : Theme.of(context).colorScheme.primaryContainer,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(message.body),
                                  const SizedBox(height: 2),
                                  Text(
                                    '${message.isStaff ? (message.authorName ?? 'Staff') : 'Customer'} · ${message.createdAt.hour.toString().padLeft(2, '0')}:${message.createdAt.minute.toString().padLeft(2, '0')}',
                                    style: Theme.of(context)
                                        .textTheme
                                        .labelSmall,
                                  ),
                                ],
                              ),
                            ),
                          ))
                      .toList(),
                ),
        ),
        const SizedBox(height: 8),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _controller,
                minLines: 1,
                maxLines: 3,
                decoration: const InputDecoration(
                  hintText: 'Message the customer…',
                  isDense: true,
                ),
                onSubmitted: (_) => _send(),
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filled(
              onPressed: _sending ? null : _send,
              icon: _sending
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.send),
            ),
          ],
        ),
      ],
    );
  }
}

class _RequestInfoButton extends ConsumerWidget {
  const _RequestInfoButton({required this.requestId});
  final String requestId;

  @override
  Widget build(BuildContext context, WidgetRef ref) => OutlinedButton(
    onPressed: () async {
      final controller = TextEditingController();
      final body = await showDialog<String>(
        context: context,
        builder: (dialogContext) => AlertDialog(
          title: const Text('Request more information'),
          content: TextField(
            controller: controller,
            autofocus: true,
            maxLines: 3,
            decoration: const InputDecoration(
              hintText: 'What do you need from the customer?',
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () =>
                  Navigator.of(dialogContext).pop(controller.text.trim()),
              child: const Text('Send'),
            ),
          ],
        ),
      );
      if (body == null || body.isEmpty || !context.mounted) return;
      try {
        await ref
            .read(requestsRepositoryProvider)
            .requestInformation(requestId, body);
        ref.invalidate(requestDetailProvider(requestId));
        ref.invalidate(requestMessagesProvider(requestId));
        ref.invalidate(requestsListProvider);
      } on ApiException catch (error) {
        if (context.mounted) {
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text(error.message)));
        }
      }
    },
    child: const Text('Request more information'),
  );
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
