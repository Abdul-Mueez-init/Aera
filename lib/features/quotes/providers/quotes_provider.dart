import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/quotes_repository.dart';

class QuotesQuery {
  const QuotesQuery({this.status});

  final String? status;

  @override
  bool operator ==(Object other) =>
      identical(this, other) || other is QuotesQuery && status == other.status;

  @override
  int get hashCode => status.hashCode;
}

final quotesQueryProvider = StateProvider<QuotesQuery>(
  (ref) => const QuotesQuery(),
);

/// Not autoDispose: keeps the last-fetched list cached, same rationale as
/// `jobsListProvider`. Mutations explicitly `ref.invalidate` this.
final quotesListProvider = FutureProvider<List<Quote>>((ref) async {
  final query = ref.watch(quotesQueryProvider);
  final repo = ref.watch(quotesRepositoryProvider);
  return repo.listQuotes(status: query.status);
});

/// Not autoDispose: a quote viewed once stays cached for the rest of the
/// session, bounded by the number of distinct quotes visited — mirrors
/// `jobDetailProvider`.
final quoteDetailProvider = FutureProvider.family<Quote, String>((
  ref,
  quoteId,
) async {
  final repo = ref.watch(quotesRepositoryProvider);
  return repo.getQuote(quoteId);
});
