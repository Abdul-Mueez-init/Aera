import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/invoices_repository.dart';

class InvoicesQuery {
  const InvoicesQuery({this.status});

  final String? status;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is InvoicesQuery && status == other.status;

  @override
  int get hashCode => status.hashCode;
}

final invoicesQueryProvider = StateProvider<InvoicesQuery>(
  (ref) => const InvoicesQuery(),
);

/// Not autoDispose: keeps the last-fetched list cached, same rationale as
/// `quotesListProvider`/`jobsListProvider`. Mutations explicitly
/// `ref.invalidate` this.
final invoicesListProvider = FutureProvider<List<Invoice>>((ref) async {
  final query = ref.watch(invoicesQueryProvider);
  final repo = ref.watch(invoicesRepositoryProvider);
  return repo.listInvoices(status: query.status);
});

/// Not autoDispose: an invoice viewed once stays cached for the rest of the
/// session, bounded by the number of distinct invoices visited — mirrors
/// `quoteDetailProvider`.
final invoiceDetailProvider = FutureProvider.family<Invoice, String>((
  ref,
  invoiceId,
) async {
  final repo = ref.watch(invoicesRepositoryProvider);
  return repo.getInvoice(invoiceId);
});
