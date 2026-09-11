import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/network/api_response.dart';
import '../../core/theme/aera_colors.dart';
import '../../core/theme/aera_radii.dart';
import '../../core/theme/aera_typography.dart';
import '../../core/widgets/aera_card.dart';
import '../../core/widgets/aera_status_chip.dart';
import 'data/quotes_repository.dart';
import 'providers/quotes_provider.dart';

const _statusTabs = <String, String?>{
  'All': null,
  'Draft': 'DRAFT',
  'Sent': 'SENT',
  'Approved': 'APPROVED',
  'Declined': 'DECLINED',
  'Expired': 'EXPIRED',
};

AeraStatusType _quoteStatusType(String status) {
  switch (status) {
    case 'APPROVED':
      return AeraStatusType.success;
    case 'DECLINED':
      return AeraStatusType.danger;
    case 'SENT':
      return AeraStatusType.info;
    case 'EXPIRED':
      return AeraStatusType.warning;
    case 'DRAFT':
    default:
      return AeraStatusType.neutral;
  }
}

String _formatMoney(int minor, String currency) =>
    '$currency ${(minor / 100).toStringAsFixed(2)}';

class QuotesScreen extends ConsumerStatefulWidget {
  const QuotesScreen({super.key});

  @override
  ConsumerState<QuotesScreen> createState() => _QuotesScreenState();
}

class _QuotesScreenState extends ConsumerState<QuotesScreen> {
  String _activeTab = 'All';

  @override
  Widget build(BuildContext context) {
    final quotesAsync = ref.watch(quotesListProvider);

    return Scaffold(
      backgroundColor: AeraColors.canvas,
      appBar: AppBar(
        backgroundColor: AeraColors.surface.withOpacity(0.85),
        elevation: 0,
        scrolledUnderElevation: 1,
        title: Text(
          'Quotes & Proposals',
          style: AeraTypography.h3.copyWith(fontSize: 16),
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AeraColors.accent,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add, size: 20),
        label: Text(
          'New Quote',
          style: AeraTypography.bodyMedium.copyWith(
            color: Colors.white,
            fontWeight: FontWeight.w700,
          ),
        ),
        onPressed: () => context.push('/create-quote'),
      ),
      body: SafeArea(
        child: quotesAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => _ErrorState(
            message: error is ApiException
                ? error.message
                : 'Could not load quotes',
            onRetry: () => ref.invalidate(quotesListProvider),
          ),
          data: (quotes) {
            final filtered = quotes
                .where(
                  (q) =>
                      _statusTabs[_activeTab] == null ||
                      q.status == _statusTabs[_activeTab],
                )
                .toList();
            return RefreshIndicator(
              onRefresh: () async {
                ref.invalidate(quotesListProvider);
                await ref.read(quotesListProvider.future);
              },
              child: ListView(
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 12,
                ),
                children: [
                  Row(
                    children: [
                      Text(
                        'Quotes',
                        style: AeraTypography.display.copyWith(fontSize: 22),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        width: 5,
                        height: 5,
                        decoration: const BoxDecoration(
                          color: AeraColors.accent,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        '${quotes.length} Total',
                        style: AeraTypography.bodySm,
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),

                  // Status Tabs
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: _statusTabs.keys
                          .map(
                            (title) => Padding(
                              padding: const EdgeInsets.only(right: 8),
                              child: _tabChip(title),
                            ),
                          )
                          .toList(),
                    ),
                  ),
                  const SizedBox(height: 14),

                  if (filtered.isEmpty)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 48),
                      child: Center(
                        child: Column(
                          children: [
                            const Icon(
                              Icons.request_quote_outlined,
                              size: 48,
                              color: AeraColors.outline,
                            ),
                            const SizedBox(height: 12),
                            Text(
                              _activeTab == 'All'
                                  ? 'No quotes yet'
                                  : 'No quotes in this status',
                              style: AeraTypography.bodyMedium,
                            ),
                            if (_activeTab == 'All') ...[
                              const SizedBox(height: 8),
                              Text(
                                'Create your first quote to get started',
                                style: AeraTypography.bodySm,
                              ),
                            ],
                          ],
                        ),
                      ),
                    )
                  else
                    ...filtered.map(
                      (quote) => Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: _QuoteCard(quote: quote),
                      ),
                    ),
                  const SizedBox(height: 60),
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _tabChip(String title) {
    final isSelected = _activeTab == title;
    return InkWell(
      onTap: () => setState(() => _activeTab = title),
      borderRadius: AeraRadii.borderFull,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: isSelected ? AeraColors.accent : AeraColors.surface,
          borderRadius: AeraRadii.borderFull,
          border: Border.all(
            color: isSelected ? Colors.transparent : AeraColors.line,
          ),
        ),
        child: Text(
          title,
          style: AeraTypography.label.copyWith(
            color: isSelected ? Colors.white : AeraColors.ink,
            fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
          ),
        ),
      ),
    );
  }
}

class _QuoteCard extends StatelessWidget {
  const _QuoteCard({required this.quote});

  final Quote quote;

  @override
  Widget build(BuildContext context) {
    final dateLabel = quote.sentAt != null
        ? 'Sent ${DateFormat('MMM d, h:mm a').format(quote.sentAt!)}'
        : 'Created ${DateFormat('MMM d, h:mm a').format(quote.createdAt)}';

    return AeraCard(
      padding: const EdgeInsets.all(14),
      onTap: () => context.push('/quotes/${quote.id}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  dateLabel,
                  style: AeraTypography.label.copyWith(
                    color: AeraColors.outline,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              AeraStatusChip(
                label: quote.status,
                type: _quoteStatusType(quote.status),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  quote.customer.fullName,
                  style: AeraTypography.h3.copyWith(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Text(
                _formatMoney(quote.totalMinor, quote.currency),
                style: AeraTypography.h3.copyWith(fontWeight: FontWeight.w700),
              ),
            ],
          ),
          if (quote.job != null) ...[
            const SizedBox(height: 6),
            Row(
              children: [
                const Icon(Icons.hvac, size: 15, color: AeraColors.accent),
                const SizedBox(width: 6),
                Text(
                  'Job #${quote.job!.jobNumber}',
                  style: AeraTypography.bodySm.copyWith(
                    color: AeraColors.inkSoft,
                  ),
                ),
              ],
            ),
          ],
          const SizedBox(height: 10),
          const Divider(color: AeraColors.line, height: 1),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '${quote.items.length} line item${quote.items.length == 1 ? '' : 's'}',
                style: AeraTypography.label.copyWith(color: AeraColors.inkSoft),
              ),
              Row(
                children: [
                  Text(
                    'Details',
                    style: AeraTypography.label.copyWith(
                      color: AeraColors.accent,
                    ),
                  ),
                  const Icon(
                    Icons.chevron_right,
                    size: 16,
                    color: AeraColors.accent,
                  ),
                ],
              ),
            ],
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
            const Icon(
              Icons.error_outline,
              size: 48,
              color: AeraColors.warning,
            ),
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
