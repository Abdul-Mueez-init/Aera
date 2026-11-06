import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/network/api_response.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_card.dart';
import '../auth/providers/auth_provider.dart';
import 'data/company_repository.dart';
import 'providers/company_provider.dart';

/// Company settings screen. Shows the company's real details (name, slug,
/// timezone and currency). Owners can edit these fields; dispatchers and
/// technicians have a read-only view.
class CompanySettingsScreen extends ConsumerStatefulWidget {
  const CompanySettingsScreen({super.key});

  @override
  ConsumerState<CompanySettingsScreen> createState() =>
      _CompanySettingsScreenState();
}

class _CompanySettingsScreenState extends ConsumerState<CompanySettingsScreen> {
  bool _isEditing = false;
  final _nameController = TextEditingController();
  final _timezoneController = TextEditingController();
  final _currencyController = TextEditingController();
  final _depositValueController = TextEditingController();
  String? _depositType;
  bool _isSaving = false;

  @override
  void dispose() {
    _nameController.dispose();
    _timezoneController.dispose();
    _currencyController.dispose();
    _depositValueController.dispose();
    super.dispose();
  }

  void _startEditing(Company company) {
    _nameController.text = company.name;
    _timezoneController.text = company.timezone;
    _currencyController.text = company.defaultCurrency;
    _depositType = company.defaultDepositType == 'NONE'
        ? null
        : company.defaultDepositType;
    _depositValueController.text = company.defaultDepositValue > 0
        ? (company.defaultDepositType == 'FIXED'
              ? (company.defaultDepositValue / 100).toStringAsFixed(2)
              : (company.defaultDepositValue / 100).toStringAsFixed(2))
        : '';
    setState(() => _isEditing = true);
  }

  void _cancelEditing() {
    setState(() => _isEditing = false);
  }

  Future<void> _saveChanges() async {
    final name = _nameController.text.trim();
    final timezone = _timezoneController.text.trim();
    final currency = _currencyController.text.trim().toUpperCase();

    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          backgroundColor: AeraColors.danger,
          content: Text('Company name is required'),
        ),
      );
      return;
    }

    if (currency.length != 3) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          backgroundColor: AeraColors.danger,
          content: Text('Currency must be a 3-letter code (e.g., USD)'),
        ),
      );
      return;
    }

    setState(() => _isSaving = true);
    try {
      // FIXED: UI collects major units → minor. PERCENT: UI collects
      // percent → basis points. Both multiply by 100.
      final depositRaw =
          double.tryParse(_depositValueController.text.trim()) ?? 0;
      final input = UpdateCompanyInput(
        name: name,
        timezone: timezone.isNotEmpty ? timezone : null,
        defaultCurrency: currency.isNotEmpty ? currency : null,
        defaultDepositType: _depositType ?? 'NONE',
        defaultDepositValue: _depositType == null
            ? 0
            : (depositRaw * 100).round(),
      );
      await ref.read(companyRepositoryProvider).updateCompany(input);
      if (!mounted) return;
      setState(() => _isSaving = false);
      setState(() => _isEditing = false);
      ref.invalidate(companyDetailsProvider);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Company settings updated')));
    } catch (error) {
      if (!mounted) return;
      setState(() => _isSaving = false);
      final message = error is ApiException
          ? error.message
          : 'Could not update company settings';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(backgroundColor: AeraColors.danger, content: Text(message)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final role = ref.watch(currentRoleProvider);
    final canEdit = role == 'OWNER';
    final companyAsync = ref.watch(companyDetailsProvider);

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AppBar(
        title: const Text('Company Settings'),
        actions: canEdit && !_isEditing
            ? [
                IconButton(
                  icon: const Icon(Icons.edit_outlined),
                  onPressed: companyAsync.maybeWhen(
                    data: (company) =>
                        () => _startEditing(company),
                    orElse: () => null,
                  ),
                ),
              ]
            : canEdit && _isEditing
            ? [
                TextButton(
                  onPressed: _isSaving ? null : _cancelEditing,
                  child: const Text('Cancel'),
                ),
                TextButton(
                  onPressed: _isSaving ? null : _saveChanges,
                  child: _isSaving
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Save'),
                ),
              ]
            : null,
      ),
      body: companyAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => _ErrorState(
          message: error is ApiException
              ? error.message
              : 'Could not load company details.',
          onRetry: () => ref.invalidate(companyDetailsProvider),
        ),
        data: (company) => RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(companyDetailsProvider);
            await ref.read(companyDetailsProvider.future);
          },
          child: _CompanyDetails(
            company: company,
            isEditing: _isEditing,
            canEdit: canEdit,
            nameController: _nameController,
            timezoneController: _timezoneController,
            currencyController: _currencyController,
            depositType: _depositType,
            depositValueController: _depositValueController,
            onDepositTypeChanged: (v) => setState(() => _depositType = v),
          ),
        ),
      ),
    );
  }
}

class _CompanyDetails extends StatelessWidget {
  const _CompanyDetails({
    required this.company,
    required this.isEditing,
    required this.canEdit,
    required this.nameController,
    required this.timezoneController,
    required this.currencyController,
    required this.depositType,
    required this.depositValueController,
    required this.onDepositTypeChanged,
  });

  final Company company;
  final bool isEditing;
  final bool canEdit;
  final TextEditingController nameController;
  final TextEditingController timezoneController;
  final TextEditingController currencyController;
  final String? depositType;
  final TextEditingController depositValueController;
  final ValueChanged<String?> onDepositTypeChanged;

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      children: [
        AeraCard(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: AeraColors.accentSoft,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: const Icon(
                  Icons.domain,
                  color: AeraColors.accent,
                  size: 26,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Text(
                  company.name,
                  style: AeraTypography.h3.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        Text(
          'COMPANY DETAILS',
          style: AeraTypography.labelUpper.copyWith(color: AeraColors.inkSoft),
        ),
        const SizedBox(height: 8),
        AeraCard(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
          child: Column(
            children: [
              isEditing && canEdit
                  ? _editableRow('Company name', nameController)
                  : _detailRow('Company name', company.name),
              const Divider(color: AeraColors.line, height: 1),
              _detailRow('Company handle', company.slug),
              const Divider(color: AeraColors.line, height: 1),
              isEditing && canEdit
                  ? _editableRow('Timezone', timezoneController)
                  : _detailRow('Timezone', company.timezone),
              const Divider(color: AeraColors.line, height: 1),
              isEditing && canEdit
                  ? _editableRow(
                      'Currency',
                      currencyController,
                      uppercase: true,
                    )
                  : _detailRow('Currency', company.defaultCurrency),
              const Divider(color: AeraColors.line, height: 1),
              isEditing && canEdit
                  ? _depositEditor()
                  : _detailRow('Default deposit', _depositLabel(company)),
            ],
          ),
        ),
        const SizedBox(height: 12),
        if (!canEdit)
          Text(
            'These details are read-only for your role.',
            style: AeraTypography.label.copyWith(color: AeraColors.outline),
          )
        else if (!isEditing)
          Text(
            'Tap the edit icon to change company settings.',
            style: AeraTypography.label.copyWith(color: AeraColors.outline),
          ),
        const SizedBox(height: 24),
      ],
    );
  }

  String _depositLabel(Company company) {
    if (company.defaultDepositType == 'NONE' ||
        company.defaultDepositValue <= 0) {
      return 'None';
    }
    final value = company.defaultDepositValue / 100;
    return company.defaultDepositType == 'FIXED'
        ? '${company.defaultCurrency} ${value.toStringAsFixed(2)}'
        : '${value.toStringAsFixed(2)}%';
  }

  Widget _depositEditor() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Default deposit',
            style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
          ),
          const SizedBox(height: 6),
          DropdownButtonFormField<String>(
            initialValue: depositType,
            isExpanded: true,
            decoration: const InputDecoration(
              isDense: true,
              contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              border: OutlineInputBorder(),
            ),
            items: const [
              DropdownMenuItem(value: null, child: Text('None')),
              DropdownMenuItem(value: 'FIXED', child: Text('Fixed amount')),
              DropdownMenuItem(
                value: 'PERCENT',
                child: Text('Percent of total'),
              ),
            ],
            onChanged: onDepositTypeChanged,
          ),
          if (depositType != null) ...[
            const SizedBox(height: 8),
            TextField(
              controller: depositValueController,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: InputDecoration(
                labelText: depositType == 'FIXED'
                    ? 'Amount (${company.defaultCurrency})'
                    : 'Percent (%)',
                isDense: true,
                border: const OutlineInputBorder(),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _detailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
            ),
          ),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: AeraTypography.bodySm.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _editableRow(
    String label,
    TextEditingController controller, {
    bool uppercase = false,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
            ),
          ),
          Expanded(
            child: TextField(
              controller: controller,
              textCapitalization: uppercase
                  ? TextCapitalization.characters
                  : TextCapitalization.none,
              style: AeraTypography.bodySm.copyWith(
                fontWeight: FontWeight.w600,
              ),
              decoration: const InputDecoration(
                border: UnderlineInputBorder(),
                contentPadding: EdgeInsets.symmetric(vertical: 4),
              ),
            ),
          ),
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
            const Icon(Icons.error_outline, color: AeraColors.danger, size: 32),
            const SizedBox(height: 12),
            Text(
              message,
              textAlign: TextAlign.center,
              style: AeraTypography.bodySm.copyWith(color: AeraColors.inkSoft),
            ),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh, size: 18),
              label: const Text('Try again'),
            ),
          ],
        ),
      ),
    );
  }
}
