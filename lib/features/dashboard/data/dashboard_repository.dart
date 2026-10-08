import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';

final dashboardRepositoryProvider = Provider<DashboardRepository>((ref) {
  final client = ref.watch(apiClientProvider);
  return DashboardRepository(client);
});

class DashboardSummary {
  const DashboardSummary({
    required this.date,
    required this.timezone,
    required this.jobsToday,
    required this.jobsByStatus,
    required this.unassignedJobs,
    required this.outstandingInvoices,
    required this.revenueThisMonth,
  });

  final String date;
  final String timezone;
  final int jobsToday;
  final List<JobStatusCount> jobsByStatus;
  final int unassignedJobs;
  final OutstandingInvoices outstandingInvoices;
  final RevenueThisMonth revenueThisMonth;

  factory DashboardSummary.fromJson(Map<String, dynamic> json) => DashboardSummary(
        date: json['date'] as String? ?? '',
        timezone: json['timezone'] as String? ?? 'UTC',
        jobsToday: json['jobsToday'] as int? ?? 0,
        jobsByStatus: (json['jobsByStatus'] as List<dynamic>?)
                ?.map((j) => JobStatusCount.fromJson(j as Map<String, dynamic>))
                .toList() ??
            [],
        unassignedJobs: json['unassignedJobs'] as int? ?? 0,
        outstandingInvoices: OutstandingInvoices.fromJson(
            json['outstandingInvoices'] as Map<String, dynamic>? ?? {}),
        revenueThisMonth: RevenueThisMonth.fromJson(
            json['revenueThisMonth'] as Map<String, dynamic>? ?? {}),
      );
}

class JobStatusCount {
  const JobStatusCount({
    required this.status,
    required this.count,
  });

  final String status;
  final int count;

  factory JobStatusCount.fromJson(Map<String, dynamic> json) => JobStatusCount(
        status: json['status'] as String? ?? '',
        count: json['count'] as int? ?? 0,
      );
}

class OutstandingInvoices {
  const OutstandingInvoices({
    required this.count,
    required this.balanceDueByCurrency,
  });

  final int count;
  final List<CurrencyAmount> balanceDueByCurrency;

  factory OutstandingInvoices.fromJson(Map<String, dynamic> json) =>
      OutstandingInvoices(
        count: json['count'] as int? ?? 0,
        balanceDueByCurrency:
            (json['balanceDueByCurrency'] as List<dynamic>?)
                    ?.map((c) => CurrencyAmount.fromJson(c as Map<String, dynamic>))
                    .toList() ??
                [],
      );
}

class RevenueThisMonth {
  const RevenueThisMonth({
    required this.periodStart,
    required this.periodEnd,
    required this.collectedByCurrency,
  });

  final String periodStart;
  final String periodEnd;
  final List<CurrencyAmount> collectedByCurrency;

  factory RevenueThisMonth.fromJson(Map<String, dynamic> json) => RevenueThisMonth(
        periodStart: json['periodStart'] as String? ?? '',
        periodEnd: json['periodEnd'] as String? ?? '',
        collectedByCurrency:
            (json['collectedByCurrency'] as List<dynamic>?)
                    ?.map((c) => CurrencyAmount.fromJson(c as Map<String, dynamic>))
                    .toList() ??
                [],
      );
}

class CurrencyAmount {
  const CurrencyAmount({
    required this.currency,
    required this.totalMinor,
  });

  final String currency;
  final String totalMinor;

  factory CurrencyAmount.fromJson(Map<String, dynamic> json) => CurrencyAmount(
        currency: json['currency'] as String? ?? '',
        totalMinor: json['totalMinor'] as String? ?? '0',
      );
}

class DashboardToday {
  const DashboardToday({
    required this.date,
    required this.jobs,
  });

  final String date;
  final List<TodayJob> jobs;

  factory DashboardToday.fromJson(Map<String, dynamic> json) => DashboardToday(
        date: json['date'] as String? ?? '',
        jobs: (json['jobs'] as List<dynamic>?)
                ?.map((j) => TodayJob.fromJson(j as Map<String, dynamic>))
                .toList() ??
            [],
      );
}

class TodayJob {
  const TodayJob({
    required this.id,
    required this.jobNumber,
    required this.customerName,
    required this.serviceType,
    required this.addressLine,
    required this.technicianName,
    required this.status,
    required this.windowStart,
    required this.windowEnd,
  });

  final String id;
  final String jobNumber;
  final String customerName;
  final String serviceType;
  final String addressLine;
  final String? technicianName;
  final String status;
  final String windowStart;
  final String windowEnd;

  factory TodayJob.fromJson(Map<String, dynamic> json) => TodayJob(
        id: json['id'] as String? ?? '',
        jobNumber: json['jobNumber'] as String? ?? '',
        customerName: json['customerName'] as String? ?? '',
        serviceType: json['serviceType'] as String? ?? '',
        addressLine: json['addressLine'] as String? ?? '',
        technicianName: json['technicianName'] as String?,
        status: json['status'] as String? ?? '',
        windowStart: json['windowStart'] as String? ?? '',
        windowEnd: json['windowEnd'] as String? ?? '',
      );
}

class DashboardAlerts {
  const DashboardAlerts({
    required this.date,
    required this.timezone,
    required this.alerts,
  });

  final String date;
  final String timezone;
  final List<Alert> alerts;

  factory DashboardAlerts.fromJson(Map<String, dynamic> json) => DashboardAlerts(
        date: json['date'] as String? ?? '',
        timezone: json['timezone'] as String? ?? 'UTC',
        alerts: (json['alerts'] as List<dynamic>?)
                ?.map((a) => Alert.fromJson(a as Map<String, dynamic>))
                .toList() ??
            [],
      );
}

class Alert {
  const Alert({
    required this.type,
    this.jobId,
    this.jobNumber,
    this.invoiceId,
    this.invoiceNumber,
    this.customerName,
    this.technicianName,
    required this.message,
    required this.severity,
  });

  final String type;
  final String? jobId;
  final String? jobNumber;
  final String? invoiceId;
  final String? invoiceNumber;
  final String? customerName;
  final String? technicianName;
  final String message;
  final String severity;

  factory Alert.fromJson(Map<String, dynamic> json) => Alert(
        type: json['type'] as String? ?? '',
        jobId: json['jobId'] as String?,
        jobNumber: json['jobNumber'] as String?,
        invoiceId: json['invoiceId'] as String?,
        invoiceNumber: json['invoiceNumber'] as String?,
        customerName: json['customerName'] as String?,
        technicianName: json['technicianName'] as String?,
        message: json['message'] as String? ?? '',
        severity: json['severity'] as String? ?? 'warning',
      );
}

class DashboardRepository {
  DashboardRepository(this._client);

  final ApiClient _client;

  Future<DashboardSummary> getSummary() async {
    final res = await _client.get('/api/v1/dashboard/summary');
    return DashboardSummary.fromJson(res as Map<String, dynamic>);
  }

  Future<DashboardToday> getToday({int limit = 50}) async {
    final res = await _client.get(
      '/api/v1/dashboard/today',
      queryParameters: {'limit': limit.toString()},
    );
    return DashboardToday.fromJson(res as Map<String, dynamic>);
  }

  Future<DashboardAlerts> getAlerts() async {
    final res = await _client.get('/api/v1/dashboard/alerts');
    return DashboardAlerts.fromJson(res as Map<String, dynamic>);
  }
}
