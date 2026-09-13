import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/public_quote_repository.dart';

/// Not autoDispose: same rationale as `portalSnapshotProvider` — once a
/// customer opens their quote-approval link the snapshot stays cached for
/// the rest of that browsing session. Keyed by the share token itself,
/// since the token *is* the identity here (there is no logged-in user
/// session to hang it off).
///
/// Call `ref.invalidate(publicQuoteProvider(shareToken))` after
/// `PublicQuoteRepository.respond` to refresh with the server's resolved
/// status.
final publicQuoteProvider = FutureProvider.family<PublicQuote, String>((
  ref,
  shareToken,
) async {
  final repo = ref.watch(publicQuoteRepositoryProvider);
  return repo.fetchQuote(shareToken);
});
