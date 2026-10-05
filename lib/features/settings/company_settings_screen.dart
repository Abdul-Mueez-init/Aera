import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/network/api_response.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_card.dart';
import 'data/company_repository.dart';
import 'providers/company_provider.dart';

/// Read-only view of the company's real details (name, slug, timezone and
/// currency). Those are the only company fields the backend stores, so
/// nothing else is shown.
class CompanySettingsScreen extends ConsumerWidget {
  const CompanySettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final companyAsync = ref.watch(companyDetailsProvider);

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AppBar(
        title: const Text('Company Settings'),
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
          child: _CompanyDetails(company: company),
        ),
      ),
    );
  }
}

class _CompanyDetails extends StatelessWidget {
  const _CompanyDetails({required this.company});

  final Company company;

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
              _detailRow('Company name', company.name),
              const Divider(color: AeraColors.line, height: 1),
              _detailRow('Company handle', company.slug),
              const Divider(color: AeraColors.line, height: 1),
              _detailRow('Timezone', company.timezone),
              const Divider(color: AeraColors.line, height: 1),
              _detailRow('Currency', company.defaultCurrency),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Text(
          'These details are read-only for now.',
          style: AeraTypography.label.copyWith(color: AeraColors.outline),
        ),
        const SizedBox(height: 24),
      ],
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
