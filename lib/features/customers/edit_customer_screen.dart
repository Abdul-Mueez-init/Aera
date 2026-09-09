import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/network/api_response.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_text_field.dart';
import 'data/customers_repository.dart';
import 'providers/customers_provider.dart';

class EditCustomerScreen extends ConsumerStatefulWidget {
  const EditCustomerScreen({super.key, required this.customerId});

  final String customerId;

  @override
  ConsumerState<EditCustomerScreen> createState() => _EditCustomerScreenState();
}

class _EditCustomerScreenState extends ConsumerState<EditCustomerScreen> {
  final _firstNameController = TextEditingController();
  final _lastNameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _emailController = TextEditingController();
  final _notesController = TextEditingController();
  bool _hydrated = false;
  bool _saving = false;

  @override
  void dispose() {
    _firstNameController.dispose();
    _lastNameController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  void _hydrate(Customer customer) {
    if (_hydrated) return;
    _firstNameController.text = customer.firstName;
    _lastNameController.text = customer.lastName;
    _phoneController.text = customer.phone ?? '';
    _emailController.text = customer.email ?? '';
    _notesController.text = customer.notes ?? '';
    _hydrated = true;
  }

  Future<void> _save() async {
    final firstName = _firstNameController.text.trim();
    final lastName = _lastNameController.text.trim();
    if (firstName.isEmpty || lastName.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('First and last name are required')),
      );
      return;
    }

    setState(() => _saving = true);
    try {
      final repo = ref.read(customersRepositoryProvider);
      await repo.updateCustomer(
        widget.customerId,
        firstName: firstName,
        lastName: lastName,
        phone: _phoneController.text,
        email: _emailController.text,
        notes: _notesController.text,
      );
      ref.invalidate(customerDetailProvider(widget.customerId));
      ref.invalidate(customersListProvider);
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Customer updated')));
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
          const SnackBar(content: Text('Could not update customer')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final customerAsync = ref.watch(customerDetailProvider(widget.customerId));

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: const AeraAppBar(
        title: 'Edit Account',
        subtitle: 'Update Client Record',
      ),
      body: SafeArea(
        child: customerAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    error is ApiException
                        ? error.message
                        : 'Could not load customer',
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 12),
                  FilledButton(
                    onPressed: () => ref.invalidate(
                      customerDetailProvider(widget.customerId),
                    ),
                    child: const Text('Retry'),
                  ),
                ],
              ),
            ),
          ),
          data: (customer) {
            _hydrate(customer);
            return ListView(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
              children: [
                AeraCard(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(
                            Icons.person,
                            size: 18,
                            color: AeraColors.accent,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            'Primary Contact Information',
                            style: AeraTypography.h3.copyWith(fontSize: 15),
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),
                      AeraTextField(
                        label: 'First Name *',
                        controller: _firstNameController,
                      ),
                      const SizedBox(height: 14),
                      AeraTextField(
                        label: 'Last Name *',
                        controller: _lastNameController,
                      ),
                      const SizedBox(height: 14),
                      AeraTextField(
                        label: 'Primary Mobile Number',
                        controller: _phoneController,
                        keyboardType: TextInputType.phone,
                      ),
                      const SizedBox(height: 14),
                      AeraTextField(
                        label: 'Email Address',
                        controller: _emailController,
                        keyboardType: TextInputType.emailAddress,
                      ),
                      const SizedBox(height: 14),
                      AeraTextField(
                        label: 'Site Access Notes',
                        controller: _notesController,
                        maxLines: 3,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),
                AeraButton(
                  text: _saving ? 'Saving...' : 'Save Changes',
                  icon: _saving
                      ? null
                      : const Icon(Icons.check, size: 18, color: Colors.white),
                  isLoading: _saving,
                  onPressed: _saving ? null : _save,
                ),
                const SizedBox(height: 20),
              ],
            );
          },
        ),
      ),
    );
  }
}
