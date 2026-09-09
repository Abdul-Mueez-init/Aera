import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/network/api_response.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_status_chip.dart';
import 'data/customers_repository.dart';
import 'providers/customers_provider.dart';

class CustomerDetailScreen extends ConsumerStatefulWidget {
  const CustomerDetailScreen({super.key, required this.customerId});

  final String customerId;

  @override
  ConsumerState<CustomerDetailScreen> createState() =>
      _CustomerDetailScreenState();
}

class _CustomerDetailScreenState extends ConsumerState<CustomerDetailScreen> {
  bool _archiving = false;

  Future<void> _confirmArchive(Customer customer) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: AeraColors.surface,
        shape: RoundedRectangleBorder(borderRadius: AeraRadii.borderLg),
        title: Text(
          'Archive ${customer.fullName}?',
          style: AeraTypography.h3.copyWith(fontSize: 17),
        ),
        content: Text(
          'Archived customers are hidden from the active list but their '
          'job and address history is preserved. This can be reversed only '
          'from the backend.',
          style: AeraTypography.bodySm,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(
              'Cancel',
              style: AeraTypography.bodyMedium.copyWith(
                color: AeraColors.inkSoft,
              ),
            ),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(
              'Archive',
              style: AeraTypography.bodyMedium.copyWith(
                color: AeraColors.danger,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );

    if (confirmed != true) return;

    setState(() => _archiving = true);
    try {
      await ref.read(customersRepositoryProvider).archiveCustomer(customer.id);
      ref.invalidate(customersListProvider);
      ref.invalidate(customerDetailProvider(customer.id));
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Customer archived')));
        context.pop();
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(e.message)));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not archive customer')),
        );
      }
    } finally {
      if (mounted) setState(() => _archiving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final customerAsync = ref.watch(customerDetailProvider(widget.customerId));

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AeraAppBar(
        title: 'Customer Profile',
        subtitle: customerAsync.maybeWhen(
          data: (c) => c.fullName,
          orElse: () => '#${widget.customerId}',
        ),
        actions: [
          if (customerAsync.hasValue)
            IconButton(
              icon: const Icon(Icons.edit_outlined, color: AeraColors.accent),
              onPressed: () =>
                  context.push('/customers/${widget.customerId}/edit'),
            ),
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
                      ref.invalidate(customerDetailProvider(widget.customerId)),
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
              const SizedBox(height: 14),
              _RecentJobsCard(customerId: customer.id),
              if (customer.notes != null && customer.notes!.isNotEmpty) ...[
                const SizedBox(height: 14),
                AeraCard(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Notes',
                        style: AeraTypography.h3.copyWith(fontSize: 15),
                      ),
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
              if (customer.status == 'ACTIVE') ...[
                const SizedBox(height: 20),
                AeraButton(
                  text: _archiving ? 'Archiving...' : 'Archive Customer',
                  variant: AeraButtonVariant.danger,
                  isLoading: _archiving,
                  onPressed: _archiving
                      ? null
                      : () => _confirmArchive(customer),
                ),
              ] else ...[
                const SizedBox(height: 20),
                Center(
                  child: Text(
                    'This customer is archived',
                    style: AeraTypography.bodySm.copyWith(
                      color: AeraColors.inkSoft,
                    ),
                  ),
                ),
              ],
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
    final isActive = customer.status == 'ACTIVE';
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
          Text(
            customer.fullName,
            style: AeraTypography.h2.copyWith(fontSize: 20),
          ),
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
              color: isActive ? AeraColors.successSoft : AeraColors.warningSoft,
              borderRadius: AeraRadii.borderFull,
            ),
            child: Text(
              customer.status,
              style: AeraTypography.label.copyWith(
                color: isActive ? AeraColors.success : AeraColors.warning,
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
                      const Icon(
                        Icons.home,
                        size: 18,
                        color: AeraColors.accent,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              addr.label,
                              style: AeraTypography.bodyMedium.copyWith(
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            Text(
                              addr.formatted,
                              style: AeraTypography.bodySm.copyWith(
                                fontSize: 11,
                              ),
                            ),
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

AeraStatusType _jobStatusType(String status) {
  switch (status) {
    case 'COMPLETED':
      return AeraStatusType.completed;
    case 'CANCELLED':
      return AeraStatusType.danger;
    case 'IN_PROGRESS':
    case 'EN_ROUTE':
      return AeraStatusType.inProgress;
    case 'WAITING_PARTS':
      return AeraStatusType.warning;
    case 'SCHEDULED':
      return AeraStatusType.scheduled;
    case 'QUOTING':
      return AeraStatusType.info;
    case 'NEW':
    default:
      return AeraStatusType.neutral;
  }
}

class _RecentJobsCard extends ConsumerWidget {
  const _RecentJobsCard({required this.customerId});

  final String customerId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final jobsAsync = ref.watch(customerJobsProvider(customerId));

    return AeraCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Recent Jobs', style: AeraTypography.h3.copyWith(fontSize: 15)),
          const SizedBox(height: 10),
          jobsAsync.when(
            loading: () => const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Center(
                child: SizedBox(
                  height: 18,
                  width: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            ),
            error: (error, _) => Text(
              error is ApiException ? error.message : 'Could not load jobs',
              style: AeraTypography.bodySm.copyWith(color: AeraColors.danger),
            ),
            data: (page) {
              if (page.items.isEmpty) {
                return Text(
                  'No jobs yet for this customer',
                  style: AeraTypography.bodySm,
                );
              }
              return Column(
                children: page.items
                    .map(
                      (job) => Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: InkWell(
                          borderRadius: AeraRadii.borderMd,
                          onTap: () => context.push('/jobs/${job.id}'),
                          child: Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: AeraColors.surfaceContainerLow,
                              borderRadius: AeraRadii.borderMd,
                            ),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        job.serviceType,
                                        style: AeraTypography.bodyMedium
                                            .copyWith(
                                              fontWeight: FontWeight.w600,
                                            ),
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        job.scheduledStart != null
                                            ? DateFormat(
                                                'MMM d, h:mm a',
                                              ).format(job.scheduledStart!)
                                            : 'Unscheduled',
                                        style: AeraTypography.bodySm.copyWith(
                                          fontSize: 11,
                                        ),
                                      ),
                                      if (job.technicianName != null) ...[
                                        const SizedBox(height: 2),
                                        Text(
                                          job.technicianName!,
                                          style: AeraTypography.bodySm.copyWith(
                                            fontSize: 11,
                                          ),
                                        ),
                                      ],
                                    ],
                                  ),
                                ),
                                AeraStatusChip(
                                  label: job.status.replaceAll('_', ' '),
                                  type: _jobStatusType(job.status),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    )
                    .toList(),
              );
            },
          ),
        ],
      ),
    );
  }
}
