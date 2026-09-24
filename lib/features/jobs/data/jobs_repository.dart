import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';
import '../../customers/data/customers_repository.dart'
    show ServiceAddress, PageMeta;

final jobsRepositoryProvider = Provider<JobsRepository>((ref) {
  final client = ref.watch(apiClientProvider);
  return JobsRepository(client);
});

class JobCustomer {
  const JobCustomer({
    required this.id,
    required this.firstName,
    required this.lastName,
    this.email,
    this.phone,
  });

  final String id;
  final String firstName;
  final String lastName;
  final String? email;
  final String? phone;

  String get fullName => '$firstName $lastName'.trim();

  factory JobCustomer.fromJson(Map<String, dynamic> json) => JobCustomer(
    id: json['id'] as String,
    firstName: json['firstName'] as String? ?? '',
    lastName: json['lastName'] as String? ?? '',
    email: json['email'] as String?,
    phone: json['phone'] as String?,
  );
}

/// A company member who can be assigned to a job. Built from either the
/// flat `assignedTechnician` object embedded on a job, or the nested
/// `user` object returned by `/companies/current/members`.
class Technician {
  const Technician({
    required this.id,
    required this.firstName,
    required this.lastName,
    this.email,
  });

  final String id;
  final String firstName;
  final String lastName;
  final String? email;

  String get fullName => '$firstName $lastName'.trim();

  String get initials {
    final parts = fullName.split(' ').where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first[0].toUpperCase();
    return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
  }

  factory Technician.fromJson(Map<String, dynamic> json) => Technician(
    id: json['id'] as String,
    firstName: json['firstName'] as String? ?? '',
    lastName: json['lastName'] as String? ?? '',
    email: json['email'] as String?,
  );

  factory Technician.fromMemberJson(Map<String, dynamic> json) {
    final user = json['user'] as Map<String, dynamic>;
    return Technician.fromJson(user);
  }
}

class JobNote {
  const JobNote({
    required this.id,
    required this.body,
    required this.visibility,
    required this.createdAt,
    this.authorName,
  });

  final String id;
  final String body;
  final String visibility;
  final DateTime createdAt;
  final String? authorName;

  factory JobNote.fromJson(Map<String, dynamic> json) {
    final author = json['author'] as Map<String, dynamic>?;
    final name = author != null
        ? '${author['firstName'] ?? ''} ${author['lastName'] ?? ''}'.trim()
        : null;
    return JobNote(
      id: json['id'] as String,
      body: json['body'] as String? ?? '',
      visibility: json['visibility'] as String? ?? 'INTERNAL',
      createdAt:
          DateTime.tryParse(json['createdAt'] as String? ?? '') ??
          DateTime.now(),
      authorName: (name == null || name.isEmpty) ? null : name,
    );
  }
}

class JobStatusHistoryEntry {
  const JobStatusHistoryEntry({
    required this.id,
    this.fromStatus,
    required this.toStatus,
    this.reason,
    required this.createdAt,
    this.actorName,
  });

  final String id;
  final String? fromStatus;
  final String toStatus;
  final String? reason;
  final DateTime createdAt;
  final String? actorName;

  factory JobStatusHistoryEntry.fromJson(Map<String, dynamic> json) {
    final actor = json['actor'] as Map<String, dynamic>?;
    final name = actor != null
        ? '${actor['firstName'] ?? ''} ${actor['lastName'] ?? ''}'.trim()
        : null;
    return JobStatusHistoryEntry(
      id: json['id'] as String,
      fromStatus: json['fromStatus'] as String?,
      toStatus: json['toStatus'] as String? ?? '',
      reason: json['reason'] as String?,
      createdAt:
          DateTime.tryParse(json['createdAt'] as String? ?? '') ??
          DateTime.now(),
      actorName: (name == null || name.isEmpty) ? null : name,
    );
  }
}

class JobPhoto {
  const JobPhoto({
    required this.id,
    required this.objectKey,
    required this.mimeType,
    required this.sizeBytes,
    required this.kind,
    required this.createdAt,
    this.caption,
    this.uploaderName,
  });

  final String id;
  final String objectKey;
  final String mimeType;
  final int sizeBytes;
  final String kind;
  final DateTime createdAt;
  final String? caption;
  final String? uploaderName;

  factory JobPhoto.fromJson(Map<String, dynamic> json) {
    final uploader = json['uploader'] as Map<String, dynamic>?;
    final name = uploader != null
        ? '${uploader['firstName'] ?? ''} ${uploader['lastName'] ?? ''}'.trim()
        : null;
    return JobPhoto(
      id: json['id'] as String,
      objectKey: json['objectKey'] as String? ?? '',
      mimeType: json['mimeType'] as String? ?? '',
      // sizeBytes is a Postgres BigInt, serialized by the backend as a
      // JSON string (see job.service.ts `jsonSafe`) — never parse it as int.
      sizeBytes: int.tryParse(json['sizeBytes']?.toString() ?? '') ?? 0,
      kind: json['kind'] as String? ?? 'OTHER',
      caption: json['caption'] as String?,
      createdAt:
          DateTime.tryParse(json['createdAt'] as String? ?? '') ??
          DateTime.now(),
      uploaderName: (name == null || name.isEmpty) ? null : name,
    );
  }
}

class JobPart {
  const JobPart({
    required this.id,
    required this.name,
    required this.quantity,
    required this.unitPriceMinor,
    required this.currency,
    required this.createdAt,
  });

  final String id;
  final String name;
  final double quantity;
  final int unitPriceMinor;
  final String currency;
  final DateTime createdAt;

  int get totalMinor => (quantity * unitPriceMinor).round();

  factory JobPart.fromJson(Map<String, dynamic> json) => JobPart(
    id: json['id'] as String,
    name: json['name'] as String? ?? '',
    // quantity is a Postgres Decimal, serialized as a JSON string.
    quantity: double.tryParse(json['quantity']?.toString() ?? '') ?? 0,
    // unitPriceMinor is a Postgres BigInt, serialized as a JSON string.
    unitPriceMinor: int.tryParse(json['unitPriceMinor']?.toString() ?? '') ?? 0,
    currency: json['currency'] as String? ?? 'USD',
    createdAt:
        DateTime.tryParse(json['createdAt'] as String? ?? '') ?? DateTime.now(),
  );
}

class JobInvoiceSummary {
  const JobInvoiceSummary({
    required this.id,
    required this.invoiceNumber,
    required this.status,
    required this.totalMinor,
    required this.balanceDueMinor,
    required this.currency,
  });

  final String id;
  final String invoiceNumber;
  final String status;
  final int totalMinor;
  final int balanceDueMinor;
  final String currency;

  factory JobInvoiceSummary.fromJson(Map<String, dynamic> json) => JobInvoiceSummary(
    id: json['id'] as String,
    invoiceNumber: json['invoiceNumber'] as String? ?? '',
    status: json['status'] as String? ?? 'DRAFT',
    totalMinor: int.tryParse(json['totalMinor']?.toString() ?? '') ?? 0,
    balanceDueMinor: int.tryParse(json['balanceDueMinor']?.toString() ?? '') ?? 0,
    currency: json['currency'] as String? ?? 'USD',
  );
}

class Job {
  const Job({
    required this.id,
    required this.jobNumber,
    required this.serviceType,
    required this.problemDescription,
    required this.priority,
    required this.status,
    this.scheduledStart,
    this.scheduledEnd,
    this.startedAt,
    this.completedAt,
    this.completionSummary,
    required this.createdAt,
    required this.updatedAt,
    required this.customer,
    required this.serviceAddress,
    this.assignedTechnician,
    this.notes = const [],
    this.statusHistory = const [],
    this.photos = const [],
    this.parts = const [],
    this.invoices = const [],
  });

  final String id;
  final int jobNumber;
  final String serviceType;
  final String problemDescription;
  final String priority;
  final String status;
  final DateTime? scheduledStart;
  final DateTime? scheduledEnd;
  final DateTime? startedAt;
  final DateTime? completedAt;
  final String? completionSummary;
  final DateTime createdAt;
  final DateTime updatedAt;
  final JobCustomer customer;
  final ServiceAddress serviceAddress;
  final Technician? assignedTechnician;
  final List<JobNote> notes;
  final List<JobStatusHistoryEntry> statusHistory;
  final List<JobPhoto> photos;
  final List<JobPart> parts;
  final List<JobInvoiceSummary> invoices;

  factory Job.fromJson(Map<String, dynamic> json) => Job(
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
    startedAt: json['startedAt'] != null
        ? DateTime.tryParse(json['startedAt'] as String)
        : null,
    completedAt: json['completedAt'] != null
        ? DateTime.tryParse(json['completedAt'] as String)
        : null,
    completionSummary: json['completionSummary'] as String?,
    createdAt:
        DateTime.tryParse(json['createdAt'] as String? ?? '') ?? DateTime.now(),
    updatedAt:
        DateTime.tryParse(json['updatedAt'] as String? ?? '') ?? DateTime.now(),
    customer: JobCustomer.fromJson(
      json['customer'] as Map<String, dynamic>? ?? const {},
    ),
    serviceAddress: ServiceAddress.fromJson(
      json['serviceAddress'] as Map<String, dynamic>? ?? const {},
    ),
    assignedTechnician: json['assignedTechnician'] != null
        ? Technician.fromJson(
            json['assignedTechnician'] as Map<String, dynamic>,
          )
        : null,
    notes:
        (json['notes'] as List<dynamic>?)
            ?.map((n) => JobNote.fromJson(n as Map<String, dynamic>))
            .toList() ??
        const [],
    statusHistory:
        (json['statusHistory'] as List<dynamic>?)
            ?.map(
              (h) => JobStatusHistoryEntry.fromJson(h as Map<String, dynamic>),
            )
            .toList() ??
        const [],
    photos:
        (json['photos'] as List<dynamic>?)
            ?.map((p) => JobPhoto.fromJson(p as Map<String, dynamic>))
            .toList() ??
        const [],
    parts:
        (json['parts'] as List<dynamic>?)
            ?.map((p) => JobPart.fromJson(p as Map<String, dynamic>))
            .toList() ??
        const [],
    invoices:
        (json['invoices'] as List<dynamic>?)
            ?.map((i) => JobInvoiceSummary.fromJson(i as Map<String, dynamic>))
            .toList() ??
        const [],
  );
}

class PaginatedJobs {
  const PaginatedJobs({required this.items, required this.meta});

  final List<Job> items;
  final PageMeta meta;
}

class CreateJobInput {
  const CreateJobInput({
    required this.customerId,
    required this.serviceAddressId,
    required this.serviceType,
    required this.problemDescription,
    this.priority,
  });

  final String customerId;
  final String serviceAddressId;
  final String serviceType;
  final String problemDescription;
  final String? priority;

  Map<String, dynamic> toJson() => {
    'customerId': customerId,
    'serviceAddressId': serviceAddressId,
    'serviceType': serviceType.trim(),
    'problemDescription': problemDescription.trim(),
    if (priority != null && priority!.isNotEmpty) 'priority': priority,
  };
}

/// Response shape shared by `/jobs/:jobId/assign` and
/// `/schedule/jobs/:jobId/schedule` (`/reschedule`) — both return the
/// updated job plus any technician double-booking warnings.
class JobMutationResult {
  const JobMutationResult({required this.job, required this.warnings});

  final Job job;
  final List<JobScheduleWarning> warnings;

  factory JobMutationResult.fromJson(Map<String, dynamic> json) =>
      JobMutationResult(
        job: Job.fromJson(json['job'] as Map<String, dynamic>),
        warnings: (json['warnings'] as List<dynamic>? ?? const [])
            .map((w) => JobScheduleWarning.fromJson(w as Map<String, dynamic>))
            .toList(),
      );
}

class JobScheduleWarning {
  const JobScheduleWarning({
    required this.jobId,
    required this.jobNumber,
    this.customerName,
  });

  final String jobId;
  final int jobNumber;
  final String? customerName;

  factory JobScheduleWarning.fromJson(Map<String, dynamic> json) {
    final customer = json['customer'] as Map<String, dynamic>?;
    final name = customer != null
        ? '${customer['firstName'] ?? ''} ${customer['lastName'] ?? ''}'.trim()
        : null;
    return JobScheduleWarning(
      jobId: json['jobId'] as String,
      jobNumber: json['jobNumber'] as int? ?? 0,
      customerName: (name == null || name.isEmpty) ? null : name,
    );
  }
}

class JobsRepository {
  JobsRepository(this._client);

  final ApiClient _client;

  Future<PaginatedJobs> listJobs({
    int page = 1,
    int pageSize = 20,
    String? status,
    String? priority,
  }) async {
    final res = await _client.get(
      '/api/v1/jobs',
      queryParameters: {
        'page': page.toString(),
        'pageSize': pageSize.toString(),
        if (status != null && status.isNotEmpty) 'status': status,
        if (priority != null && priority.isNotEmpty) 'priority': priority,
      },
    );
    final map = res as Map<String, dynamic>;
    return PaginatedJobs(
      items: (map['items'] as List<dynamic>)
          .map((j) => Job.fromJson(j as Map<String, dynamic>))
          .toList(),
      meta: PageMeta.fromJson(map['meta'] as Map<String, dynamic>),
    );
  }

  Future<Job> getJob(String jobId) async {
    final res = await _client.get('/api/v1/jobs/$jobId');
    return Job.fromJson(res as Map<String, dynamic>);
  }

  Future<Job> createJob(CreateJobInput input) async {
    final res = await _client.post('/api/v1/jobs', body: input.toJson());
    return Job.fromJson(res as Map<String, dynamic>);
  }

  /// Generic status command (`NEW`, `QUOTING`, `SCHEDULED`, `EN_ROUTE`,
  /// `IN_PROGRESS`, `WAITING_PARTS`, `CANCELLED`). The backend rejects
  /// `COMPLETED` here on purpose — use [completeJob] for that transition.
  Future<Job> transitionStatus(
    String jobId,
    String status, {
    String? reason,
  }) async {
    final res = await _client.post(
      '/api/v1/jobs/$jobId/status',
      body: {
        'status': status,
        if (reason != null && reason.isNotEmpty) 'reason': reason,
      },
    );
    return Job.fromJson(res as Map<String, dynamic>);
  }

  Future<Job> completeJob(
    String jobId,
    String summary, {
    bool? autoInvoice,
    bool? allowZeroAmountInvoice,
  }) async {
    final res = await _client.post(
      '/api/v1/jobs/$jobId/complete',
      body: {
        'summary': summary.trim(),
        if (autoInvoice != null) 'autoInvoice': autoInvoice,
        if (allowZeroAmountInvoice != null)
          'allowZeroAmountInvoice': allowZeroAmountInvoice,
      },
    );
    return Job.fromJson(res as Map<String, dynamic>);
  }

  Future<JobMutationResult> assignTechnician(
    String jobId,
    String? technicianId,
  ) async {
    final res = await _client.post(
      '/api/v1/jobs/$jobId/assign',
      body: {'technicianId': technicianId},
    );
    return JobMutationResult.fromJson(res as Map<String, dynamic>);
  }

  /// `reschedule: false` calls `POST /schedule/jobs/:jobId/schedule`
  /// (valid from NEW/QUOTING, promotes the job to SCHEDULED).
  /// `reschedule: true` calls `.../reschedule` (only valid once the job is
  /// already SCHEDULED) — this mirrors the two backend routes exactly.
  Future<JobMutationResult> scheduleJob(
    String jobId, {
    required DateTime scheduledStart,
    required DateTime scheduledEnd,
    bool reschedule = false,
  }) async {
    final path = reschedule
        ? '/api/v1/schedule/jobs/$jobId/reschedule'
        : '/api/v1/schedule/jobs/$jobId/schedule';
    final res = await _client.post(
      path,
      body: {
        'scheduledStart': scheduledStart.toUtc().toIso8601String(),
        'scheduledEnd': scheduledEnd.toUtc().toIso8601String(),
      },
    );
    return JobMutationResult.fromJson(res as Map<String, dynamic>);
  }

  /// Active technicians on the company, sourced from
  /// `/companies/current/members` (there is no jobs-scoped technician
  /// list endpoint, so this filters the membership roster client-side).
  Future<List<Technician>> listTechnicians() async {
    final res = await _client.get('/api/v1/companies/current/members');
    final members = (res as List<dynamic>).cast<Map<String, dynamic>>();
    return members
        .where((m) => m['role'] == 'TECHNICIAN' && m['status'] == 'ACTIVE')
        .map(Technician.fromMemberJson)
        .toList();
  }
}
