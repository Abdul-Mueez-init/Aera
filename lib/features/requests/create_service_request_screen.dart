import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/network/api_response.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/widgets/aera_text_field.dart';
import '../customers/providers/customers_provider.dart';
import 'data/requests_repository.dart';
import 'providers/requests_provider.dart';

class CreateServiceRequestScreen extends ConsumerStatefulWidget {
  const CreateServiceRequestScreen({super.key});
  @override
  ConsumerState<CreateServiceRequestScreen> createState() =>
      _CreateServiceRequestScreenState();
}

class _CreateServiceRequestScreenState
    extends ConsumerState<CreateServiceRequestScreen> {
  final _title = TextEditingController();
  final _description = TextEditingController();
  final _category = TextEditingController(text: 'General Service');
  String? _customerId;
  String? _addressId;
  String _priority = 'NORMAL';
  bool _inspection = false;
  bool _saving = false;

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    _category.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_customerId == null || _addressId == null ||
        _title.text.trim().isEmpty || _description.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Complete the customer, address, title and description')),
      );
      return;
    }
    setState(() => _saving = true);
    try {
      final request = await ref.read(requestsRepositoryProvider).createRequest(
            CreateServiceRequestInput(
              customerId: _customerId!,
              serviceAddressId: _addressId!,
              title: _title.text,
              description: _description.text,
              serviceCategory: _category.text,
              priority: _priority,
              requiresInspection: _inspection,
            ),
          );
      ref.invalidate(requestsListProvider);
      if (mounted) {
        context.go('/service-requests/${request.id}');
      }
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final customers = ref.watch(pickerCustomersProvider);
    final selected = _customerId;
    final addressField = selected == null
        ? const Text('Select a customer to choose a service address')
        : ref.watch(customerDetailProvider(selected)).when(
            loading: () => const LinearProgressIndicator(),
            error: (_, _) => const Text('Could not load service addresses'),
            data: (customer) => DropdownButtonFormField<String>(
              initialValue: _addressId,
              decoration: const InputDecoration(labelText: 'Service address'),
              items: customer.serviceAddresses
                  .map((address) => DropdownMenuItem(
                        value: address.id,
                        child: Text(address.formatted),
                      ))
                  .toList(),
              onChanged: (value) => setState(() => _addressId = value),
            ),
          );
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AppBar(title: const Text('New Service Request')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          AeraTextField(label: 'Search customers', hintText: 'Type a name to filter…',
            onChanged: (value) => ref.read(pickerCustomersSearchProvider.notifier).state = value),
          const SizedBox(height: 10),
          customers.when(
            loading: () => const LinearProgressIndicator(),
            error: (_, _) => const Text('Could not load customers'),
            data: (page) => DropdownButtonFormField<String>(
              initialValue: selected,
              decoration: const InputDecoration(labelText: 'Customer'),
              items: page.items.map((customer) => DropdownMenuItem(
                value: customer.id, child: Text(customer.fullName),
              )).toList(),
              onChanged: (value) => setState(() {
                _customerId = value;
                _addressId = null;
              }),
            ),
          ),
          const SizedBox(height: 12),
          addressField,
          const SizedBox(height: 12),
          AeraTextField(label: 'Title', controller: _title),
          const SizedBox(height: 12),
          AeraTextField(label: 'Service category', controller: _category),
          const SizedBox(height: 12),
          AeraTextField(label: 'What needs attention?', controller: _description,
            maxLines: 5),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            initialValue: _priority,
            decoration: const InputDecoration(labelText: 'Priority'),
            items: const [
              DropdownMenuItem(value: 'LOW', child: Text('Low')),
              DropdownMenuItem(value: 'NORMAL', child: Text('Normal')),
              DropdownMenuItem(value: 'HIGH', child: Text('High')),
              DropdownMenuItem(value: 'URGENT', child: Text('Urgent')),
            ],
            onChanged: (value) => setState(() => _priority = value ?? 'NORMAL'),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Inspection required'),
            value: _inspection,
            onChanged: (value) => setState(() => _inspection = value),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _saving ? null : _submit,
            child: _saving
                ? const SizedBox(height: 18, width: 18,
                    child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Create request'),
          ),
        ],
      ),
    );
  }
}
