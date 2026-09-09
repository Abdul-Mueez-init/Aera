import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_app_bar.dart';
import '../../core/widgets/aera_button.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_text_field.dart';

class CreateCustomerScreen extends StatefulWidget {
  const CreateCustomerScreen({super.key});

  @override
  State<CreateCustomerScreen> createState() => _CreateCustomerScreenState();
}

class _CreateCustomerScreenState extends State<CreateCustomerScreen> {
  String _classification = 'residential';
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController(text: '+92 (300) ');
  final _emailController = TextEditingController();
  final _addressController = TextEditingController();
  final _cityController = TextEditingController(text: 'Lahore');
  final _notesController = TextEditingController();

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    _addressController.dispose();
    _cityController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  void _saveCustomer() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Customer account created successfully!')),
    );
    context.pop();
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
            // Header Context Card
            AeraCard(
              padding: const EdgeInsets.all(14),
              child: Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: AeraColors.accentSoft,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(Icons.speed, color: AeraColors.accent, size: 20),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Fast Client Registration', style: AeraTypography.bodyMedium.copyWith(fontWeight: FontWeight.w700)),
                        Text('Takes ~45s in field for immediate job booking and quoting.', style: AeraTypography.bodySm.copyWith(fontSize: 11)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),

            // Account Classification
            AeraCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('ACCOUNT CLASSIFICATION', style: AeraTypography.labelUpper.copyWith(fontSize: 10)),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: _classPill('Residential', Icons.home, 'residential'),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: _classPill('Commercial', Icons.corporate_fare, 'commercial'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),

            // Primary Contact Form
            AeraCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.person, size: 18, color: AeraColors.accent),
                      const SizedBox(width: 8),
                      Text('Primary Contact Information', style: AeraTypography.h3.copyWith(fontSize: 15)),
                    ],
                  ),
                  const SizedBox(height: 14),
                  AeraTextField(
                    label: 'Full Customer / Entity Name *',
                    hintText: 'e.g. Sarah Khan or Apex Holdings',
                    controller: _nameController,
                    prefixIcon: const Icon(Icons.badge_outlined, size: 20, color: AeraColors.outline),
                  ),
                  const SizedBox(height: 14),
                  AeraTextField(
                    label: 'Primary Mobile Number *',
                    hintText: '+92 (300) 000-0000',
                    controller: _phoneController,
                    keyboardType: TextInputType.phone,
                    prefixIcon: const Icon(Icons.phone_iphone, size: 20, color: AeraColors.outline),
                  ),
                  const SizedBox(height: 14),
                  AeraTextField(
                    label: 'Email Address (Quotes & Billing)',
                    hintText: 'client@example.com',
                    controller: _emailController,
                    keyboardType: TextInputType.emailAddress,
                    prefixIcon: const Icon(Icons.mail_outline, size: 20, color: AeraColors.outline),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),

            // Service Location
            AeraCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.location_on, size: 18, color: AeraColors.accent),
                      const SizedBox(width: 8),
                      Text('Primary Service Address', style: AeraTypography.h3.copyWith(fontSize: 15)),
                    ],
                  ),
                  const SizedBox(height: 14),
                  AeraTextField(
                    label: 'Street & House / Suite Number *',
                    hintText: 'e.g. House 42-B, Block K, Gulberg III',
                    controller: _addressController,
                    prefixIcon: const Icon(Icons.home_outlined, size: 20, color: AeraColors.outline),
                  ),
                  const SizedBox(height: 14),
                  AeraTextField(
                    label: 'City / District *',
                    hintText: 'Lahore',
                    controller: _cityController,
                    prefixIcon: const Icon(Icons.location_city, size: 20, color: AeraColors.outline),
                  ),
                  const SizedBox(height: 14),
                  AeraTextField(
                    label: 'Site Access Notes / Gate Code',
                    hintText: 'e.g. Gate code #4290, security guard on front porch',
                    controller: _notesController,
                    maxLines: 2,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            AeraButton(
              text: 'Save Customer & Book Job',
              icon: const Icon(Icons.check, size: 18, color: Colors.white),
              onPressed: _saveCustomer,
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _classPill(String title, IconData icon, String value) {
    final isSelected = _classification == value;
    return InkWell(
      onTap: () => setState(() => _classification = value),
      borderRadius: AeraRadii.borderMd,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: isSelected ? AeraColors.accentSoft : AeraColors.surfaceSubtle,
          borderRadius: AeraRadii.borderMd,
          border: Border.all(
            color: isSelected ? AeraColors.accent : Colors.transparent,
            width: 1.5,
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 18, color: isSelected ? AeraColors.accent : AeraColors.inkSoft),
            const SizedBox(width: 8),
            Text(
              title,
              style: AeraTypography.bodyMedium.copyWith(
                fontWeight: FontWeight.w700,
                color: isSelected ? AeraColors.accent : AeraColors.ink,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
