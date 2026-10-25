import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/customers_repository.dart';

class CustomersQuery {
  const CustomersQuery({this.page = 1, this.pageSize = 20, this.search = ''});

  final int page;
  final int pageSize;
  final String search;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is CustomersQuery &&
          page == other.page &&
          pageSize == other.pageSize &&
          search == other.search;

  @override
  int get hashCode => Object.hash(page, pageSize, search);
}

final customersQueryProvider = StateProvider<CustomersQuery>(
  (ref) => const CustomersQuery(),
);

/// Not autoDispose: keeps the last-fetched page cached in memory so
/// navigating away from and back to the customers tab shows data instantly
/// instead of a fresh spinner. Mutations explicitly `ref.invalidate` this.
final customersListProvider = FutureProvider<PaginatedCustomers>((ref) async {
  final query = ref.watch(customersQueryProvider);
  final repo = ref.watch(customersRepositoryProvider);
  return repo.listCustomers(
    page: query.page,
    pageSize: query.pageSize,
    search: query.search.isEmpty ? null : query.search,
  );
});

/// Not autoDispose: a customer detail viewed once stays cached for the rest
/// of the session. Bounded by the number of distinct customers visited.
final customerDetailProvider = FutureProvider.family<Customer, String>((
  ref,
  customerId,
) async {
  final repo = ref.watch(customersRepositoryProvider);
  return repo.getCustomer(customerId);
});

/// Customer picker for the create flows (Create Job / Create Quote).
///
/// Deliberately NOT [customersListProvider]: that provider is driven by
/// the Customers tab's [customersQueryProvider], so a leftover tab search
/// or page would hide selectable customers in the pickers. This provider
/// carries its own search state (set from the picker's own search field)
/// and loads a large page. Auto-disposed so picker state never leaks
/// between visits either.
final pickerCustomersSearchProvider = StateProvider<String>((ref) => '');

final pickerCustomersProvider = FutureProvider.autoDispose<PaginatedCustomers>((
  ref,
) async {
  final search = ref.watch(pickerCustomersSearchProvider);
  final repo = ref.watch(customersRepositoryProvider);
  return repo.listCustomers(
    page: 1,
    pageSize: 100,
    search: search.isEmpty ? null : search,
  );
});

final customerJobsProvider =
    FutureProvider.family<PaginatedCustomerJobs, String>((
      ref,
      customerId,
    ) async {
      final repo = ref.watch(customersRepositoryProvider);
      return repo.getCustomerJobs(customerId);
    });

/// Staff-side portal audit feed for one customer (link issued/opened,
/// handshake events, deactivations). Auto-disposed: it is a "what just
/// happened" view, so stale data is worse than a refetch.
final customerPortalActivityProvider = FutureProvider.autoDispose
    .family<List<PortalActivityEvent>, String>((ref, customerId) async {
      final repo = ref.watch(customersRepositoryProvider);
      return repo.fetchPortalActivity(customerId);
    });
