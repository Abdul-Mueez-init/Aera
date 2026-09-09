import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/network/api_response.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';
import 'data/customers_repository.dart';
import 'providers/customers_provider.dart';

class CustomerDetailScreen extends ConsumerWidget {
  const CustomerDetailScreen({super.key, required this.customerId});

  final String customerId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final customerAsync = ref.watch(customerDetailProvider(customerId));

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AeraAppBar(
        title: 'Customer Profile',
        subtitle: customerAsync.maybeWhen(
          data: (c) => c.fullName,
          orElse: () => '#$customerId',
        ),
        actions: [
          if (customerAsync.hasValue && customerAsync.value!.phone != null)
            IconButton(
              icon: const Icon(Icons.phone_outlined, color: AeraColors.accent),
              onPressed: () {},
            ),
        ],
      ),
      body: SafeArea(
        child: customerAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  error is ApiException
                      ? error.message
                      : 'Could not load customer',
                ),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: () =>
                      ref.invalidate(customerDetailProvider(customerId)),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
          data: (customer) => ListView(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            children: [
              _ProfileHeader(customer: customer),
              const SizedBox(height: 14),
              _AddressesCard(customer: customer),
              if (customer.notes != null && customer.notes!.isNotEmpty) ...[
                const SizedBox(height: 14),
                AeraCard(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Notes',
                          style: AeraTypography.h3.copyWith(fontSize: 15)),
                      const SizedBox(height: 8),
                      Text(customer.notes!, style: AeraTypography.bodySm),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 20),
              AeraButton(
                text: 'Create New Job for ${customer.firstName}',
                icon: const Icon(Icons.add_task, size: 18, color: Colors.white),
                onPressed: () => context.push('/create-job'),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: AeraButton(
                      text: 'View All Jobs',
                      variant: AeraButtonVariant.secondary,
                      onPressed: () => context.push('/jobs'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: AeraButton(
                      text: 'Invoices & Billing',
                      variant: AeraButtonVariant.outline,
                      onPressed: () => context.push('/invoices'),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }
}

class _ProfileHeader extends StatelessWidget {
  const _ProfileHeader({required this.customer});

  final Customer customer;

  @override
  Widget build(BuildContext context) {
    return AeraCard(
      padding: const EdgeInsets.all(18),
      child: Column(
        children: [
          CircleAvatar(
            radius: 28,
            backgroundColor: AeraColors.accentSoft,
            child: Text(
              customer.initials,
              style: AeraTypography.h2.copyWith(
                color: AeraColors.accentDeep,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(height: 10),
          Text(customer.fullName,
              style: AeraTypography.h2.copyWith(fontSize: 20)),
          const SizedBox(height: 4),
          if (customer.email != null)
            Text(customer.email!, style: AeraTypography.bodySm),
          if (customer.phone != null) ...[
            const SizedBox(height: 4),
            Text(customer.phone!, style: AeraTypography.bodySm),
          ],
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: AeraColors.successSoft,
              borderRadius: AeraRadii.borderFull,
            ),
            child: Text(
              customer.status,
              style: AeraTypography.label.copyWith(
                color: AeraColors.success,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AddressesCard extends StatelessWidget {
  const _AddressesCard({required this.customer});

  final Customer customer;

  @override
  Widget build(BuildContext context) {
    return AeraCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Service Addresses (${customer.serviceAddresses.length})',
            style: AeraTypography.h3.copyWith(fontSize: 15),
          ),
          const SizedBox(height: 8),
          if (customer.serviceAddresses.isEmpty)
            Text('No addresses on file', style: AeraTypography.bodySm)
          else
            ...customer.serviceAddresses.map(
              (addr) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AeraColors.surfaceContainerLow,
                    borderRadius: AeraRadii.borderMd,
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.home,
                          size: 18, color: AeraColors.accent),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(addr.label,
                                style: AeraTypography.bodyMedium
                                    .copyWith(fontWeight: FontWeight.w600)),
                            Text(addr.formatted,
                                style: AeraTypography.bodySm
                                    .copyWith(fontSize: 11)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
