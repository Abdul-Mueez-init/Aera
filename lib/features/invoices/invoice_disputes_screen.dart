import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_status_chip.dart';
import 'data/invoices_repository.dart';

final _disputesProvider = FutureProvider.autoDispose
    .family<InvoiceDisputePage, String?>((ref, status) {
      return ref.watch(invoicesRepositoryProvider).listDisputes(status: status);
    });

/// Phase 7.6 — staff disputes inbox. Customers open disputes from the
/// portal; managers review and resolve them here. A dispute never changes
/// invoice state on its own.
class InvoiceDisputesScreen extends ConsumerStatefulWidget {
  const InvoiceDisputesScreen({super.key});

  @override
  ConsumerState<InvoiceDisputesScreen> createState() =>
      _InvoiceDisputesScreenState();
}

class _InvoiceDisputesScreenState extends ConsumerState<InvoiceDisputesScreen> {
  String? _status;

  AeraStatusType _type(String status) => switch (status) {
    'RESOLVED' => AeraStatusType.success,
    'UNDER_REVIEW' => AeraStatusType.info,
    _ => AeraStatusType.danger,
  };

  Future<void> _review(InvoiceDispute d) async {
    await ref.read(invoicesRepositoryProvider).reviewDispute(d.id);
    ref.invalidate(_disputesProvider);
  }

  Future<void> _resolve(InvoiceDispute d) async {
    const resolutions = {
      'UPHELD': 'Upheld — customer is right',
      'ADJUSTED': 'Adjusted — invoice corrected',
      'REFUNDED': 'Refunded — money returned',
    };
    var resolution = resolutions.keys.first;
    final noteController = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) => AlertDialog(
          title: Text('Resolve dispute — ${d.invoiceNumber ?? ''}'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                initialValue: resolution,
                decoration: const InputDecoration(labelText: 'Resolution'),
                items: resolutions.entries
                    .map(
                      (e) =>
                          DropdownMenuItem(value: e.key, child: Text(e.value)),
                    )
                    .toList(),
                onChanged: (v) =>
                    setDialogState(() => resolution = v ?? resolution),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: noteController,
                maxLines: 3,
                decoration: const InputDecoration(
                  hintText: 'Resolution note (required)…',
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(false),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(true),
              child: const Text('Resolve'),
            ),
          ],
        ),
      ),
    );
    final note = noteController.text.trim();
    noteController.dispose();
    if (confirmed != true || note.isEmpty || !mounted) return;
    try {
      await ref
          .read(invoicesRepositoryProvider)
          .resolveDispute(d.id, resolution: resolution, note: note);
      ref.invalidate(_disputesProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Could not resolve: $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final disputesAsync = ref.watch(_disputesProvider(_status));
    return Scaffold(
      appBar: AppBar(title: const Text('Invoice Disputes')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: Row(
              children: [
                for (final tab in [
                  (null, 'All'),
                  ('OPEN', 'Open'),
                  ('UNDER_REVIEW', 'Reviewing'),
                  ('RESOLVED', 'Resolved'),
                ])
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(tab.$2),
                      selected: _status == tab.$1,
                      onSelected: (_) => setState(() => _status = tab.$1),
                    ),
                  ),
              ],
            ),
          ),
          Expanded(
            child: disputesAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) =>
                  Center(child: Text('Could not load disputes: $e')),
              data: (page) {
                if (page.items.isEmpty) {
                  return const Center(child: Text('No disputes'));
                }
                return ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: page.items.length,
                  itemBuilder: (context, i) {
                    final d = page.items[i];
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: AeraCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    d.invoiceNumber ?? 'Invoice',
                                    style: AeraTypography.h3,
                                  ),
                                ),
                                AeraStatusChip(
                                  label: d.status.replaceAll('_', ' '),
                                  type: _type(d.status),
                                ),
                              ],
                            ),
                            const SizedBox(height: 4),
                            Text(
                              '${d.customerName ?? ''} — ${d.reason.replaceAll('_', ' ')}',
                              style: AeraTypography.bodySm,
                            ),
                            const SizedBox(height: 6),
                            Text(d.message),
                            if (d.resolution != null) ...[
                              const SizedBox(height: 6),
                              Text(
                                'Resolution: ${d.resolution} — ${d.resolutionNote ?? ''}',
                                style: AeraTypography.bodySm.copyWith(
                                  color: AeraColors.inkSoft,
                                ),
                              ),
                            ],
                            if (d.status == 'OPEN' ||
                                d.status == 'UNDER_REVIEW') ...[
                              const SizedBox(height: 8),
                              Row(
                                children: [
                                  if (d.status == 'OPEN')
                                    TextButton(
                                      onPressed: () => _review(d),
                                      child: const Text('Start review'),
                                    ),
                                  const Spacer(),
                                  FilledButton.tonal(
                                    onPressed: () => _resolve(d),
                                    child: const Text('Resolve'),
                                  ),
                                ],
                              ),
                            ],
                          ],
                        ),
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
