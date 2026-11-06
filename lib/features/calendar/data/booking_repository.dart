import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';

final bookingRepositoryProvider = Provider<BookingRepository>((ref) {
  return BookingRepository(ref.watch(apiClientProvider));
});

class BookingConfig {
  const BookingConfig({
    required this.bookingMode,
    required this.travelBufferMinutes,
    required this.timezone,
    required this.businessHours,
  });

  final String bookingMode;
  final int travelBufferMinutes;
  final String timezone;
  final List<BusinessHour> businessHours;

  factory BookingConfig.fromJson(Map<String, dynamic> json) {
    final company = json['company'] as Map<String, dynamic>? ?? const {};
    return BookingConfig(
      bookingMode: company['bookingMode'] as String? ?? 'DISPATCHER_CONFIRMS',
      travelBufferMinutes: company['travelBufferMinutes'] as int? ?? 0,
      timezone: company['timezone'] as String? ?? 'UTC',
      businessHours: (json['businessHours'] as List<dynamic>? ?? const [])
          .map((item) => BusinessHour.fromJson(item as Map<String, dynamic>))
          .toList(),
    );
  }
}

class BusinessHour {
  const BusinessHour({
    required this.weekday,
    required this.open,
    required this.close,
  });

  final int weekday;
  final String open;
  final String close;

  factory BusinessHour.fromJson(Map<String, dynamic> json) => BusinessHour(
    weekday: json['weekday'] as int? ?? 0,
    open: json['open'] as String? ?? '09:00',
    close: json['close'] as String? ?? '17:00',
  );
}

class UnscheduledJob {
  const UnscheduledJob({
    required this.id,
    required this.jobNumber,
    required this.serviceType,
    required this.status,
    this.customerName,
    this.priority,
  });

  final String id;
  final String jobNumber;
  final String serviceType;
  final String status;
  final String? customerName;
  final String? priority;

  factory UnscheduledJob.fromJson(Map<String, dynamic> json) {
    final customer = json['customer'] as Map<String, dynamic>?;
    final name =
        '${customer?['firstName'] ?? ''} ${customer?['lastName'] ?? ''}'.trim();
    return UnscheduledJob(
      id: json['id'] as String,
      jobNumber: json['jobNumber']?.toString() ?? '',
      serviceType: json['serviceType']?.toString() ?? '',
      status: json['status']?.toString() ?? '',
      customerName: name.isEmpty ? null : name,
      priority: json['priority']?.toString(),
    );
  }
}

class BookingProposal {
  const BookingProposal({
    required this.id,
    required this.status,
    this.requestId,
    this.jobId,
    this.quoteId,
  });

  final String id;
  final String status;
  final String? requestId;
  final String? jobId;
  final String? quoteId;

  factory BookingProposal.fromJson(Map<String, dynamic> json) =>
      BookingProposal(
        id: json['id'] as String,
        status: json['status']?.toString() ?? 'OPEN',
        requestId: json['requestId']?.toString(),
        jobId: json['jobId']?.toString(),
        quoteId: json['quoteId']?.toString(),
      );
}

class AvailabilityWindow {
  const AvailabilityWindow({
    required this.startsAt,
    required this.endsAt,
    required this.capacity,
  });

  final DateTime startsAt;
  final DateTime endsAt;
  final int capacity;

  factory AvailabilityWindow.fromJson(Map<String, dynamic> json) =>
      AvailabilityWindow(
        startsAt: DateTime.parse(json['startsAt'] as String),
        endsAt: DateTime.parse(json['endsAt'] as String),
        capacity: json['capacity'] as int? ?? 1,
      );
}

class TeamTechnician {
  const TeamTechnician({
    required this.userId,
    required this.name,
    this.email,
    this.workingHours = const [],
  });

  final String userId;
  final String name;
  final String? email;
  final List<BusinessHour> workingHours;

  factory TeamTechnician.fromJson(Map<String, dynamic> json) => TeamTechnician(
    userId: json['userId'] as String,
    name: json['name']?.toString() ?? '',
    email: json['email']?.toString(),
    workingHours: (json['workingHours'] as List<dynamic>? ?? const [])
        .map((h) => BusinessHour.fromJson(h as Map<String, dynamic>))
        .toList(),
  );
}

class TimeOff {
  const TimeOff({
    required this.id,
    required this.technicianId,
    required this.startsAt,
    required this.endsAt,
    this.reason,
  });

  final String id;
  final String technicianId;
  final DateTime startsAt;
  final DateTime endsAt;
  final String? reason;

  factory TimeOff.fromJson(Map<String, dynamic> json) => TimeOff(
    id: json['id'] as String,
    technicianId: json['technicianId'] as String,
    startsAt: DateTime.parse(json['startsAt'] as String),
    endsAt: DateTime.parse(json['endsAt'] as String),
    reason: json['reason']?.toString(),
  );
}

class TeamAvailability {
  const TeamAvailability({required this.technicians, required this.timeOff});

  final List<TeamTechnician> technicians;
  final List<TimeOff> timeOff;

  factory TeamAvailability.fromJson(Map<String, dynamic> json) =>
      TeamAvailability(
        technicians: (json['technicians'] as List<dynamic>? ?? const [])
            .map((t) => TeamTechnician.fromJson(t as Map<String, dynamic>))
            .toList(),
        timeOff: (json['timeOff'] as List<dynamic>? ?? const [])
            .map((t) => TimeOff.fromJson(t as Map<String, dynamic>))
            .toList(),
      );
}

class BookingRepository {
  BookingRepository(this._client);
  final ApiClient _client;

  Future<BookingConfig> getConfig() async {
    final response = await _client.get('/api/v1/booking/config');
    return BookingConfig.fromJson(response as Map<String, dynamic>);
  }

  Future<BookingConfig> updateConfig({
    required String bookingMode,
    required int travelBufferMinutes,
    required List<BusinessHour> businessHours,
  }) async {
    final response = await _client.patch(
      '/api/v1/booking/config',
      body: {
        'bookingMode': bookingMode,
        'travelBufferMinutes': travelBufferMinutes,
        'businessHours': businessHours
            .map(
              (hour) => {
                'weekday': hour.weekday,
                'open': hour.open,
                'close': hour.close,
              },
            )
            .toList(),
      },
    );
    return BookingConfig.fromJson(response as Map<String, dynamic>);
  }

  /// Unscheduled queue (NEW/QUOTING jobs with no scheduledStart).
  /// ApiClient unwraps the `{data: …}` envelope.
  Future<List<UnscheduledJob>> listQueue() async {
    final response = await _client.get('/api/v1/booking/queue');
    return (response as List<dynamic>? ?? const [])
        .map((item) => UnscheduledJob.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<List<BookingProposal>> listProposals({String? status}) async {
    final query = status == null ? '' : '?status=$status';
    final response = await _client.get('/api/v1/booking/proposals$query');
    return (response as List<dynamic>? ?? const [])
        .map((item) => BookingProposal.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<List<AvailabilityWindow>> getAvailability({
    required DateTime startsAt,
    required DateTime endsAt,
    required int durationMinutes,
    String? serviceId,
  }) async {
    final query =
        'startsAt=${Uri.encodeComponent(startsAt.toUtc().toIso8601String())}'
        '&endsAt=${Uri.encodeComponent(endsAt.toUtc().toIso8601String())}'
        '&durationMinutes=$durationMinutes'
        '${serviceId == null ? '' : '&serviceId=$serviceId'}';
    final response = await _client.get('/api/v1/booking/availability?$query');
    final windows = (response as Map<String, dynamic>?)?['windows'];
    if (windows is! List) return const [];
    return windows
        .map(
          (item) => AvailabilityWindow.fromJson(item as Map<String, dynamic>),
        )
        .toList();
  }

  /// Propose 1–3 windows to the customer for a request/job/quote.
  Future<void> createProposal({
    String? requestId,
    String? jobId,
    String? quoteId,
    required List<AvailabilityWindow> windows,
    required DateTime expiresAt,
  }) async {
    await _client.post(
      '/api/v1/booking/proposals',
      body: {
        'requestId': ?requestId,
        'jobId': ?jobId,
        'quoteId': ?quoteId,
        'windows': windows
            .map(
              (w) => {
                'startsAt': w.startsAt.toUtc().toIso8601String(),
                'endsAt': w.endsAt.toUtc().toIso8601String(),
                'capacity': w.capacity,
              },
            )
            .toList(),
        'expiresAt': expiresAt.toUtc().toIso8601String(),
      },
    );
  }

  Future<TeamAvailability> getTeamAvailability() async {
    final response = await _client.get('/api/v1/booking/team-availability');
    return TeamAvailability.fromJson(response as Map<String, dynamic>);
  }

  Future<TeamAvailability> setTechnicianWorkingHours(
    String technicianId,
    List<BusinessHour> hours,
  ) async {
    final response = await _client.put(
      '/api/v1/booking/technicians/$technicianId/working-hours',
      body: {
        'hours': hours
            .map(
              (h) => {'weekday': h.weekday, 'open': h.open, 'close': h.close},
            )
            .toList(),
      },
    );
    return TeamAvailability.fromJson(response as Map<String, dynamic>);
  }

  Future<void> createTimeOff({
    required String technicianId,
    required DateTime startsAt,
    required DateTime endsAt,
    String? reason,
  }) async {
    await _client.post(
      '/api/v1/booking/time-off',
      body: {
        'technicianId': technicianId,
        'startsAt': startsAt.toUtc().toIso8601String(),
        'endsAt': endsAt.toUtc().toIso8601String(),
        'reason': ?reason,
      },
    );
  }

  Future<void> deleteTimeOff(String timeOffId) async {
    await _client.delete('/api/v1/booking/time-off/$timeOffId');
  }

  Future<void> createHold({
    String? jobId,
    String? requestId,
    String? quoteId,
    String? technicianId,
    required DateTime windowStart,
    required DateTime windowEnd,
  }) async {
    await _client.post(
      '/api/v1/booking/holds',
      body: {
        'jobId': ?jobId,
        'requestId': ?requestId,
        'quoteId': ?quoteId,
        'technicianId': ?technicianId,
        'windowStart': windowStart.toUtc().toIso8601String(),
        'windowEnd': windowEnd.toUtc().toIso8601String(),
      },
    );
  }
}
