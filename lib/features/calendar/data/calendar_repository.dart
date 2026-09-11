import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../core/network/api_client.dart';
import '../../jobs/data/jobs_repository.dart' show Technician, JobCustomer;

final calendarRepositoryProvider = Provider<CalendarRepository>((ref) {
  final client = ref.watch(apiClientProvider);
  return CalendarRepository(client);
});

/// Lightweight address shape as returned by `GET /schedule` — this is
/// NOT the full `ServiceAddress` from customers_repository.dart. That
/// class does `json['id'] as String` with a hard cast, but
/// `scheduling.service.ts`'s `getDaySchedule` only selects
/// `{line1, city, region}` on the job's address — no `id`, `label`,
/// `line2`, `postalCode`, or `countryCode`. Reusing `ServiceAddress`
/// here would throw at runtime. Kept deliberately separate.
class ScheduleAddress {
  const ScheduleAddress({required this.line1, this.city, this.region});

  final String line1;
  final String? city;
  final String? region;

  String get formatted => [
    line1,
    if (city != null && city!.isNotEmpty) city,
  ].whereType<String>().join(', ');

  factory ScheduleAddress.fromJson(Map<String, dynamic> json) =>
      ScheduleAddress(
        line1: json['line1'] as String? ?? '',
        city: json['city'] as String?,
        region: json['region'] as String?,
      );
}

/// The job shape embedded in `GET /schedule`'s response. A deliberate
/// subset of `Job` from jobs_repository.dart (that endpoint's Prisma
/// `select` is narrower than `jobSelect()` used by `GET /jobs/:jobId`),
/// so this is its own class rather than `Job` with optional fields
/// papered over. `Technician` and `JobCustomer` are safe to reuse as-is
/// — both endpoints select the same minimal shape for those.
class ScheduledJob {
  const ScheduledJob({
    required this.id,
    required this.jobNumber,
    required this.serviceType,
    required this.problemDescription,
    required this.priority,
    required this.status,
    this.scheduledStart,
    this.scheduledEnd,
    required this.customer,
    required this.serviceAddress,
    this.assignedTechnician,
  });

  final String id;
  final int jobNumber;
  final String serviceType;
  final String problemDescription;
  final String priority;
  final String status;
  final DateTime? scheduledStart;
  final DateTime? scheduledEnd;
  final JobCustomer customer;
  final ScheduleAddress serviceAddress;
  final Technician? assignedTechnician;

  factory ScheduledJob.fromJson(Map<String, dynamic> json) => ScheduledJob(
    id: json['id'] as String,
    jobNumber: json['jobNumber'] as int? ?? 0,
    serviceType: json['serviceType'] as String? ?? '',
    problemDescription: json['problemDescription'] as String? ?? '',
    priority: json['priority'] as String? ?? 'NORMAL',
    status: json['status'] as String? ?? 'NEW',
    scheduledStart: json['scheduledStart'] != null
        ? DateTime.tryParse(json['scheduledStart'] as String)
        : null,
    scheduledEnd: json['scheduledEnd'] != null
        ? DateTime.tryParse(json['scheduledEnd'] as String)
        : null,
    customer: JobCustomer.fromJson(
      json['customer'] as Map<String, dynamic>? ?? const {},
    ),
    serviceAddress: ScheduleAddress.fromJson(
      json['serviceAddress'] as Map<String, dynamic>? ?? const {},
    ),
    assignedTechnician: json['assignedTechnician'] != null
        ? Technician.fromJson(
            json['assignedTechnician'] as Map<String, dynamic>,
          )
        : null,
  );
}

class ScheduleDay {
  const ScheduleDay({required this.date, required this.jobs});

  final String date;
  final List<ScheduledJob> jobs;

  factory ScheduleDay.fromJson(Map<String, dynamic> json) => ScheduleDay(
    date: json['date'] as String? ?? '',
    jobs: (json['jobs'] as List<dynamic>? ?? const [])
        .map((j) => ScheduledJob.fromJson(j as Map<String, dynamic>))
        .toList(),
  );
}

class WorkloadEntry {
  const WorkloadEntry({required this.technician, required this.jobCount});

  final Technician technician;
  final int jobCount;

  factory WorkloadEntry.fromJson(Map<String, dynamic> json) => WorkloadEntry(
    technician: Technician.fromJson(json['technician'] as Map<String, dynamic>),
    jobCount: json['jobCount'] as int? ?? 0,
  );
}

class WorkloadDay {
  const WorkloadDay({required this.date, required this.entries});

  final String date;
  final List<WorkloadEntry> entries;

  factory WorkloadDay.fromJson(Map<String, dynamic> json) => WorkloadDay(
    date: json['date'] as String? ?? '',
    // Note: the backend key is "technicians", not "entries" — matches
    // getTechnicianWorkload's `return { date, technicians: workload }`.
    entries: (json['technicians'] as List<dynamic>? ?? const [])
        .map((t) => WorkloadEntry.fromJson(t as Map<String, dynamic>))
        .toList(),
  );
}

class CalendarRepository {
  CalendarRepository(this._client);

  final ApiClient _client;

  static String _dateParam(DateTime date) =>
      DateFormat('yyyy-MM-dd').format(date);

  /// `dayBounds()` in scheduling.service.ts treats this date string as
  /// UTC midnight-to-midnight, same convention already used by
  /// `schedule_job_screen.dart` when it sends `scheduledStart`/`End` as
  /// `.toUtc().toIso8601String()`. A job scheduled very late/early local
  /// time near the UTC day boundary can land in the adjacent day's
  /// bucket — a known limitation inherited from the existing backend
  /// contract, not introduced here.
  Future<ScheduleDay> getDaySchedule(DateTime date) async {
    final res = await _client.get(
      '/api/v1/schedule',
      queryParameters: {'date': _dateParam(date)},
    );
    return ScheduleDay.fromJson(res as Map<String, dynamic>);
  }

  Future<WorkloadDay> getWorkload(DateTime date) async {
    final res = await _client.get(
      '/api/v1/schedule/workload',
      queryParameters: {'date': _dateParam(date)},
    );
    return WorkloadDay.fromJson(res as Map<String, dynamic>);
  }
}
