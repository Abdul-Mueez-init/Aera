import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/company_repository.dart';

/// The signed-in user's company, as returned by `GET /companies/current`.
///
/// Auto-disposed on purpose: when someone signs out and a different person
/// signs in on the same phone, the next read always fetches fresh data.
final companyDetailsProvider = FutureProvider.autoDispose<Company>((ref) {
  return ref.watch(companyRepositoryProvider).getCurrentCompany();
});
