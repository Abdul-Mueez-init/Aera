import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../data/dashboard_repository.dart';

/// Auto-disposed so dashboard data is always fresh when opened.
final dashboardSummaryProvider = FutureProvider.autoDispose<DashboardSummary>((
  ref,
) async {
  final repo = ref.watch(dashboardRepositoryProvider);
  return repo.getSummary();
});

/// Auto-disposed with the limit as part of the key.
final dashboardTodayProvider = FutureProvider.autoDispose
    .family<DashboardToday, int>((ref, limit) async {
      final repo = ref.watch(dashboardRepositoryProvider);
      return repo.getToday(limit: limit);
    });

/// Auto-disposed so alerts are always fresh.
final dashboardAlertsProvider = FutureProvider.autoDispose<DashboardAlerts>((
  ref,
) async {
  final repo = ref.watch(dashboardRepositoryProvider);
  return repo.getAlerts();
});

/// Fetches the company logo URL from GET /api/v1/companies/current/logo
final companyLogoUrlProvider = FutureProvider.autoDispose<String?>((ref) async {
  final client = ref.watch(apiClientProvider);
  try {
    final res = await client.get('/api/v1/companies/current/logo') as Map<String, dynamic>;
    final data = res['data'] as Map<String, dynamic>?;
    return data?['logoUrl'] as String?;
  } catch (_) {
    return null;
  }
});
