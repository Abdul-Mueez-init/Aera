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

final customersListProvider =
    FutureProvider.autoDispose<PaginatedCustomers>((ref) async {
  final query = ref.watch(customersQueryProvider);
  final repo = ref.watch(customersRepositoryProvider);
  return repo.listCustomers(
    page: query.page,
    pageSize: query.pageSize,
    search: query.search.isEmpty ? null : query.search,
  );
});

final customerDetailProvider = FutureProvider.autoDispose
    .family<Customer, String>((ref, customerId) async {
  final repo = ref.watch(customersRepositoryProvider);
  return repo.getCustomer(customerId);
});
