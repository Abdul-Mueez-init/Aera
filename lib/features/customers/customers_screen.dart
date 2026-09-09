import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/network/api_response.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_card.dart';
import 'data/customers_repository.dart';
import 'providers/customers_provider.dart';

class CustomersScreen extends ConsumerStatefulWidget {
  const CustomersScreen({super.key});

  @override
  ConsumerState<CustomersScreen> createState() => _CustomersScreenState();
}

class _CustomersScreenState extends ConsumerState<CustomersScreen> {
  final _searchController = TextEditingController();
  String _debouncedSearch = '';

  @override
  void initState() {
    super.initState();
    _searchController.addListener(_onSearchChanged);
  }

  void _onSearchChanged() {
    final value = _searchController.text.trim();
    if (value == _debouncedSearch) return;
    Future<void>.delayed(const Duration(milliseconds: 350), () {
      if (!mounted || _searchController.text.trim() != value) return;
      setState(() => _debouncedSearch = value);
      ref.read(customersQueryProvider.notifier).state = CustomersQuery(
        search: value,
      );
    });
  }

  @override
  void dispose() {
    _searchController.removeListener(_onSearchChanged);
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final customersAsync = ref.watch(customersListProvider);

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AppBar(
        backgroundColor: AeraColors.surface.withOpacity(0.85),
        elevation: 0,
        scrolledUnderElevation: 1,
        title: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: AeraColors.accent,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.ac_unit, color: Colors.white, size: 18),
            ),
            const SizedBox(width: 10),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('AERA HVAC',
                    style: AeraTypography.labelUpper.copyWith(fontSize: 9)),
                Text('Customers',
                    style: AeraTypography.h3
                        .copyWith(fontSize: 16, fontWeight: FontWeight.w700)),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_outlined,
                color: AeraColors.ink, size: 22),
            onPressed: () => context.push('/notifications'),
          ),
          IconButton(
            icon: CircleAvatar(
              radius: 14,
              backgroundColor: AeraColors.primary,
              child: const Icon(Icons.person, color: Colors.white, size: 16),
            ),
            onPressed: () => context.push('/profile-settings'),
          ),
          const SizedBox(width: 8),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AeraColors.accent,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.person_add, size: 20),
        label: Text(
          'Add Customer',
          style: AeraTypography.bodyMedium
              .copyWith(color: Colors.white, fontWeight: FontWeight.w700),
        ),
        onPressed: () => context.push('/create-customer'),
      ),
      body: SafeArea(
        child: customersAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => _ErrorState(
            message: error is ApiException
                ? error.message
                : 'Could not load customers',
            onRetry: () => ref.invalidate(customersListProvider),
          ),
          data: (page) => RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(customersListProvider);
              await ref.read(customersListProvider.future);
            },
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Customer Accounts',
                            style:
                                AeraTypography.display.copyWith(fontSize: 22)),
                        Row(
                          children: [
                            Container(
                              width: 6,
                              height: 6,
                              decoration: const BoxDecoration(
                                color: AeraColors.success,
                                shape: BoxShape.circle,
                              ),
                            ),
                            const SizedBox(width: 6),
                            Text('${page.meta.total} Active Accounts',
                                style: AeraTypography.bodySm),
                          ],
                        ),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Container(
                  decoration: BoxDecoration(
                    color: AeraColors.surface,
                    borderRadius: AeraRadii.borderMd,
                    border: Border.all(color: AeraColors.line),
                  ),
                  child: TextField(
                    controller: _searchController,
                    style: AeraTypography.bodySm.copyWith(color: AeraColors.ink),
                    decoration: InputDecoration(
                      hintText: 'Search name, phone, email...',
                      hintStyle: AeraTypography.bodySm
                          .copyWith(color: AeraColors.outline),
                      prefixIcon: const Icon(Icons.search,
                          size: 20, color: AeraColors.inkSoft),
                      border: InputBorder.none,
                      enabledBorder: InputBorder.none,
                      focusedBorder: InputBorder.none,
                      contentPadding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 12),
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                if (page.items.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 48),
                    child: Center(
                      child: Column(
                        children: [
                          const Icon(Icons.people_outline,
                              size: 48, color: AeraColors.outline),
                          const SizedBox(height: 12),
                          Text(
                            _debouncedSearch.isEmpty
                                ? 'No customers yet'
                                : 'No matches found',
                            style: AeraTypography.bodyMedium,
                          ),
                          if (_debouncedSearch.isEmpty) ...[
                            const SizedBox(height: 8),
                            Text('Add your first customer to get started',
                                style: AeraTypography.bodySm),
                          ],
                        ],
                      ),
                    ),
                  )
                else
                  ...page.items.map(
                    (cust) => Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: _CustomerCard(customer: cust),
                    ),
                  ),
                if (page.meta.pageCount > 1) ...[
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      IconButton(
                        onPressed: page.meta.page > 1
                            ? () {
                                ref.read(customersQueryProvider.notifier).state =
                                    CustomersQuery(
                                  page: page.meta.page - 1,
                                  search: _debouncedSearch,
                                );
                              }
                            : null,
                        icon: const Icon(Icons.chevron_left),
                      ),
                      Text('Page ${page.meta.page} of ${page.meta.pageCount}',
                          style: AeraTypography.bodySm),
                      IconButton(
                        onPressed: page.meta.page < page.meta.pageCount
                            ? () {
                                ref.read(customersQueryProvider.notifier).state =
                                    CustomersQuery(
                                  page: page.meta.page + 1,
                                  search: _debouncedSearch,
                                );
                              }
                            : null,
                        icon: const Icon(Icons.chevron_right),
                      ),
                    ],
                  ),
                ],
                const SizedBox(height: 60),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _CustomerCard extends StatelessWidget {
  const _CustomerCard({required this.customer});

  final Customer customer;

  @override
  Widget build(BuildContext context) {
    final address = customer.serviceAddresses.isNotEmpty
        ? customer.serviceAddresses.first.formatted
        : 'No address on file';

    return AeraCard(
      padding: const EdgeInsets.all(16),
      onTap: () => context.push('/customers/${customer.id}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 20,
                backgroundColor: AeraColors.surfaceSubtle,
                child: Text(
                  customer.initials,
                  style: AeraTypography.h3.copyWith(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: AeraColors.accent,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(customer.fullName,
                        style: AeraTypography.h3.copyWith(fontSize: 15)),
                    Text(address,
                        style: AeraTypography.bodySm.copyWith(fontSize: 11),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis),
                  ],
                ),
              ),
            ],
          ),
          if (customer.phone != null || customer.email != null) ...[
            const SizedBox(height: 12),
            const Divider(color: AeraColors.line),
            const SizedBox(height: 8),
            Row(
              children: [
                if (customer.phone != null) ...[
                  const Icon(Icons.phone_outlined,
                      size: 14, color: AeraColors.inkSoft),
                  const SizedBox(width: 4),
                  Text(customer.phone!,
                      style: AeraTypography.bodySm.copyWith(fontSize: 11)),
                ],
                const Spacer(),
                if (customer.email != null)
                  Flexible(
                    child: Text(
                      customer.email!,
                      style: AeraTypography.bodySm.copyWith(fontSize: 11),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 48, color: AeraColors.warning),
            const SizedBox(height: 12),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            FilledButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }
}
