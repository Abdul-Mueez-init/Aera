import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/portal_repository.dart';

/// Not autoDispose: same rationale as `quoteDetailProvider` /
/// `jobDetailProvider` — once a customer opens their portal link the
/// snapshot stays cached for the rest of that browsing session. Keyed by
/// the portal token itself rather than a separate global "current token"
/// StateProvider, since the token *is* the identity here (there is no
/// logged-in user session to hang it off) and a screen only ever needs the
/// snapshot for the one token in its own route/link.
///
/// Call `ref.invalidate(portalSnapshotProvider(token))` after a mutation
/// (e.g. `PortalRepository.submitReview`) to refresh — same pattern used
/// after `QuotesRepository.sendQuote` in `quote_detail_screen.dart`.
final portalSnapshotProvider = FutureProvider.family<PortalCustomer, String>((
  ref,
  token,
) async {
  final repo = ref.watch(portalRepositoryProvider);
  return repo.fetchPortal(token);
});
