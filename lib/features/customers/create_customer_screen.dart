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
import '../../core/widgets/aera_text_field.dart';
import 'data/customers_repository.dart';
import 'providers/customers_provider.dart';

class CreateCustomerScreen extends ConsumerStatefulWidget {
  const CreateCustomerScreen({super.key});

  @override
  ConsumerState<CreateCustomerScreen> createState() =>
      _CreateCustomerScreenState();
}

class _CreateCustomerScreenState extends ConsumerState<CreateCustomerScreen> {
  final _firstNameController = TextEditingController();
  final _lastNameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _emailController = TextEditingController();
  final _addressController = TextEditingController();
  final _cityController = TextEditingController(text: 'Lahore');
  final _notesController = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _firstNameController.dispose();
    _lastNameController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    _addressController.dispose();
    _cityController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _saveCustomer() async {
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
      final addressLine = _addressController.text.trim();
      final city = _cityController.text.trim();

      await repo.createCustomer(
        CreateCustomerInput(
          firstName: firstName,
          lastName: lastName,
          phone: _phoneController.text.trim(),
          email: _emailController.text.trim(),
          notes: _notesController.text.trim(),
          address: addressLine.isNotEmpty && city.isNotEmpty
              ? CreateAddressInput(
                  label: 'Primary',
                  line1: addressLine,
                  city: city,
                  countryCode: 'PK',
                )
              : null,
        ),
      );

      ref.invalidate(customersListProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Customer account created successfully!')),
        );
        context.pop();
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message)),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not create customer')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: const AeraAppBar(
        title: 'Create Account',
        subtitle: 'New Client Record',
        showBrand: true,
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          children: [
            AeraCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.person,
                          size: 18, color: AeraColors.accent),
                      const SizedBox(width: 8),
                      Text('Primary Contact Information',
                          style: AeraTypography.h3.copyWith(fontSize: 15)),
                    ],
                  ),
                  const SizedBox(height: 14),
                  AeraTextField(
                    label: 'First Name *',
                    hintText: 'Sarah',
                    controller: _firstNameController,
                  ),
                  const SizedBox(height: 14),
                  AeraTextField(
                    label: 'Last Name *',
                    hintText: 'Khan',
                    controller: _lastNameController,
                  ),
                  const SizedBox(height: 14),
                  AeraTextField(
                    label: 'Primary Mobile Number',
                    hintText: '+92 (300) 000-0000',
                    controller: _phoneController,
                    keyboardType: TextInputType.phone,
                  ),
                  const SizedBox(height: 14),
                  AeraTextField(
                    label: 'Email Address',
                    hintText: 'client@example.com',
                    controller: _emailController,
                    keyboardType: TextInputType.emailAddress,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            AeraCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.location_on,
                          size: 18, color: AeraColors.accent),
                      const SizedBox(width: 8),
                      Text('Primary Service Address',
                          style: AeraTypography.h3.copyWith(fontSize: 15)),
                    ],
                  ),
                  const SizedBox(height: 14),
                  AeraTextField(
                    label: 'Street & House / Suite Number',
                    hintText: 'House 42-B, Block K, Gulberg III',
                    controller: _addressController,
                  ),
                  const SizedBox(height: 14),
                  AeraTextField(
                    label: 'City / District',
                    hintText: 'Lahore',
                    controller: _cityController,
                  ),
                  const SizedBox(height: 14),
                  AeraTextField(
                    label: 'Site Access Notes',
                    hintText: 'Gate code, parking instructions...',
                    controller: _notesController,
                    maxLines: 2,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            AeraButton(
              text: _saving ? 'Saving...' : 'Save Customer',
              icon: _saving
                  ? null
                  : const Icon(Icons.check, size: 18, color: Colors.white),
              onPressed: _saving ? null : _saveCustomer,
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }
}
