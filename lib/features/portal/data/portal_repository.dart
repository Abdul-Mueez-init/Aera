import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

import '../../../core/network/api_client.dart';
import '../../../core/network/api_response.dart';

/// The public customer portal is reached through a bearer-less link
/// (`/api/v1/portal/:token`) issued by staff via
/// `POST /customers/:customerId/portal-access`. It is never the staff JWT
/// session, so this repository deliberately does NOT use [ApiClient]'s
/// `setAccessToken`/refresh machinery — there is no logged-in user on the
/// other end, only a long-lived opaque token embedded in a link. We still
/// borrow [ApiClient.baseUrl] (same host detection for web/Android/iOS) so
/// the platform base-URL logic isn't duplicated, but requests never carry
/// an `Authorization` header.
final portalRepositoryProvider = Provider<PortalRepository>((ref) {
  final baseUrl = ref.watch(apiClientProvider).baseUrl;
  return PortalRepository(baseUrl: baseUrl);
});

/// A customer's own service address, as returned at the top level of the
/// portal snapshot (`customer.serviceAddresses`).
class PortalServiceAddress {
  const PortalServiceAddress({
    required this.id,
    required this.label,
    required this.line1,
    required this.city,
    this.line2,
    this.region,
    this.postalCode,
  });

  final String id;
  final String label;
  final String line1;
  final String? line2;
  final String city;
  final String? region;
  final String? postalCode;

  String get formatted => [
    line1,
    if (line2 != null && line2!.isNotEmpty) line2,
    city,
    if (region != null && region!.isNotEmpty) region,
  ].join(', ');

  factory PortalServiceAddress.fromJson(Map<String, dynamic> json) =>
      PortalServiceAddress(
        id: json['id'] as String,
        label: json['label'] as String? ?? '',
        line1: json['line1'] as String? ?? '',
        line2: json['line2'] as String?,
        city: json['city'] as String? ?? '',
        region: json['region'] as String?,
        postalCode: json['postalCode'] as String?,
      );
}

/// The narrow `{line1, city, region}` shape `getPublicPortal` actually
/// selects for a job's address — deliberately not the full
/// [PortalServiceAddress], same "too narrow to reuse" call made for
/// `QuoteJobRef` in `quotes_repository.dart`.
class PortalJobAddress {
  const PortalJobAddress({
    required this.line1,
    required this.city,
    this.region,
  });

  final String line1;
  final String city;
  final String? region;

  String get formatted => [
    line1,
    city,
    if (region != null && region!.isNotEmpty) region,
  ].join(', ');

  factory PortalJobAddress.fromJson(Map<String, dynamic> json) =>
      PortalJobAddress(
        line1: json['line1'] as String? ?? '',
        city: json['city'] as String? ?? '',
        region: json['region'] as String?,
      );
}

class PortalTechnicianRef {
  const PortalTechnicianRef({required this.firstName, required this.lastName});

  final String firstName;
  final String lastName;

  String get fullName => '$firstName $lastName'.trim();

  factory PortalTechnicianRef.fromJson(Map<String, dynamic> json) =>
      PortalTechnicianRef(
        firstName: json['firstName'] as String? ?? '',
        lastName: json['lastName'] as String? ?? '',
      );
}

/// The narrow `{id, rating, comment}` shape returned inline on a job
/// (`take: 1`) — just enough to know whether/how the customer already
/// reviewed this job. Not the same as [PortalReview], which is the result
/// of actually submitting a review.
class PortalJobReviewRef {
  const PortalJobReviewRef({
    required this.id,
    required this.rating,
    this.comment,
  });

  final String id;
  final int rating;
  final String? comment;

  factory PortalJobReviewRef.fromJson(Map<String, dynamic> json) =>
      PortalJobReviewRef(
        id: json['id'] as String,
        rating: json['rating'] as int? ?? 0,
        comment: json['comment'] as String?,
      );
}

class PortalJob {
  const PortalJob({
    required this.id,
    required this.jobNumber,
    required this.serviceType,
    required this.problemDescription,
    required this.status,
    this.scheduledStart,
    this.scheduledEnd,
    this.completedAt,
    this.address,
    this.technician,
    this.reviews = const [],
  });

  final String id;
  final int jobNumber;
  final String serviceType;
  final String problemDescription;
  final String status;
  final DateTime? scheduledStart;
  final DateTime? scheduledEnd;
  final DateTime? completedAt;
  final PortalJobAddress? address;
  final PortalTechnicianRef? technician;
  final List<PortalJobReviewRef> reviews;

  bool get hasReview => reviews.isNotEmpty;

  factory PortalJob.fromJson(Map<String, dynamic> json) => PortalJob(
    id: json['id'] as String,
    // jobNumber is a plain Prisma Int, unlike the BigInt money fields below
    // — never string-encoded. Same convention as `QuoteJobRef.jobNumber`.
    jobNumber: json['jobNumber'] as int? ?? 0,
    serviceType: json['serviceType'] as String? ?? '',
    problemDescription: json['problemDescription'] as String? ?? '',
    status: json['status'] as String? ?? 'NEW',
    scheduledStart: json['scheduledStart'] != null
        ? DateTime.tryParse(json['scheduledStart'] as String)
        : null,
    scheduledEnd: json['scheduledEnd'] != null
        ? DateTime.tryParse(json['scheduledEnd'] as String)
        : null,
    completedAt: json['completedAt'] != null
        ? DateTime.tryParse(json['completedAt'] as String)
        : null,
    address: json['serviceAddress'] != null
        ? PortalJobAddress.fromJson(
            json['serviceAddress'] as Map<String, dynamic>,
          )
        : null,
    technician: json['assignedTechnician'] != null
        ? PortalTechnicianRef.fromJson(
            json['assignedTechnician'] as Map<String, dynamic>,
          )
        : null,
    reviews:
        (json['reviews'] as List<dynamic>?)
            ?.map((r) => PortalJobReviewRef.fromJson(r as Map<String, dynamic>))
            .toList() ??
        const [],
  );
}

class PortalLineItem {
  const PortalLineItem({
    required this.description,
    required this.quantity,
    required this.totalMinor,
  });

  final String description;
  final double quantity;
  final int totalMinor;

  factory PortalLineItem.fromJson(Map<String, dynamic> json) => PortalLineItem(
    description: json['description'] as String? ?? '',
    // quantity is a Postgres Decimal, serialized by the backend as a JSON
    // string (see `jsonSafe` in quote/invoice services) — never parse as num.
    quantity: double.tryParse(json['quantity']?.toString() ?? '') ?? 0,
    totalMinor: int.tryParse(json['totalMinor']?.toString() ?? '') ?? 0,
  );
}

class PortalQuote {
  const PortalQuote({
    required this.id,
    required this.status,
    required this.subtotalMinor,
    required this.discountMinor,
    required this.taxMinor,
    required this.totalMinor,
    required this.currency,
    this.shareToken,
    this.expiresAt,
    this.items = const [],
  });

  final String id;
  final String status;
  final int subtotalMinor;
  final int discountMinor;
  final int taxMinor;
  final int totalMinor;
  final String currency;
  final String? shareToken;
  final DateTime? expiresAt;
  final List<PortalLineItem> items;

  factory PortalQuote.fromJson(Map<String, dynamic> json) => PortalQuote(
    id: json['id'] as String,
    status: json['status'] as String? ?? 'SENT',
    // subtotalMinor/discountMinor/taxMinor/totalMinor are Postgres BigInt,
    // serialized as JSON strings.
    subtotalMinor: int.tryParse(json['subtotalMinor']?.toString() ?? '') ?? 0,
    discountMinor: int.tryParse(json['discountMinor']?.toString() ?? '') ?? 0,
    taxMinor: int.tryParse(json['taxMinor']?.toString() ?? '') ?? 0,
    totalMinor: int.tryParse(json['totalMinor']?.toString() ?? '') ?? 0,
    currency: json['currency'] as String? ?? 'USD',
    shareToken: json['shareToken'] as String?,
    expiresAt: json['expiresAt'] != null
        ? DateTime.tryParse(json['expiresAt'] as String)
        : null,
    items:
        (json['items'] as List<dynamic>?)
            ?.map((i) => PortalLineItem.fromJson(i as Map<String, dynamic>))
            .toList() ??
        const [],
  );
}

class PortalInvoice {
  const PortalInvoice({
    required this.id,
    required this.invoiceNumber,
    required this.status,
    required this.totalMinor,
    required this.amountPaidMinor,
    required this.balanceDueMinor,
    required this.currency,
    this.issuedAt,
    this.dueAt,
    this.items = const [],
  });

  final String id;
  final String invoiceNumber;
  final String status;
  final int totalMinor;
  final int amountPaidMinor;
  final int balanceDueMinor;
  final String currency;
  final DateTime? issuedAt;
  final DateTime? dueAt;
  final List<PortalLineItem> items;

  factory PortalInvoice.fromJson(Map<String, dynamic> json) => PortalInvoice(
    id: json['id'] as String,
    invoiceNumber: json['invoiceNumber'] as String? ?? '',
    status: json['status'] as String? ?? 'ISSUED',
    totalMinor: int.tryParse(json['totalMinor']?.toString() ?? '') ?? 0,
    amountPaidMinor:
        int.tryParse(json['amountPaidMinor']?.toString() ?? '') ?? 0,
    balanceDueMinor:
        int.tryParse(json['balanceDueMinor']?.toString() ?? '') ?? 0,
    currency: json['currency'] as String? ?? 'USD',
    issuedAt: json['issuedAt'] != null
        ? DateTime.tryParse(json['issuedAt'] as String)
        : null,
    dueAt: json['dueAt'] != null
        ? DateTime.tryParse(json['dueAt'] as String)
        : null,
    items:
        (json['items'] as List<dynamic>?)
            ?.map((i) => PortalLineItem.fromJson(i as Map<String, dynamic>))
            .toList() ??
        const [],
  );
}

/// The full snapshot returned by `GET /api/v1/portal/:token`. This is
/// `portal.customer` on the backend (see `getPublicPortal` in
/// `portal.service.ts`) — jobs are already filtered to non-cancelled and
/// ordered by `scheduledStart` ascending, quotes/invoices are already
/// filtered to customer-visible statuses and ordered newest-first.
class PortalCustomer {
  const PortalCustomer({
    required this.id,
    required this.firstName,
    required this.lastName,
    this.email,
    this.phone,
    this.serviceAddresses = const [],
    this.jobs = const [],
    this.quotes = const [],
    this.invoices = const [],
  });

  final String id;
  final String firstName;
  final String lastName;
  final String? email;
  final String? phone;
  final List<PortalServiceAddress> serviceAddresses;
  final List<PortalJob> jobs;
  final List<PortalQuote> quotes;
  final List<PortalInvoice> invoices;

  String get fullName => '$firstName $lastName'.trim();

  /// Non-completed jobs, already backend-sorted by `scheduledStart` asc.
  List<PortalJob> get upcomingJobs =>
      jobs.where((job) => job.status != 'COMPLETED').toList();

  /// Completed jobs — service history, oldest-first (same ordering as
  /// `jobs`; reverse in the UI if a newest-first list is wanted).
  List<PortalJob> get serviceHistory =>
      jobs.where((job) => job.status == 'COMPLETED').toList();

  factory PortalCustomer.fromJson(Map<String, dynamic> json) => PortalCustomer(
    id: json['id'] as String,
    firstName: json['firstName'] as String? ?? '',
    lastName: json['lastName'] as String? ?? '',
    email: json['email'] as String?,
    phone: json['phone'] as String?,
    serviceAddresses:
        (json['serviceAddresses'] as List<dynamic>?)
            ?.map(
              (a) => PortalServiceAddress.fromJson(a as Map<String, dynamic>),
            )
            .toList() ??
        const [],
    jobs:
        (json['jobs'] as List<dynamic>?)
            ?.map((j) => PortalJob.fromJson(j as Map<String, dynamic>))
            .toList() ??
        const [],
    quotes:
        (json['quotes'] as List<dynamic>?)
            ?.map((q) => PortalQuote.fromJson(q as Map<String, dynamic>))
            .toList() ??
        const [],
    invoices:
        (json['invoices'] as List<dynamic>?)
            ?.map((i) => PortalInvoice.fromJson(i as Map<String, dynamic>))
            .toList() ??
        const [],
  );
}

/// Result of `POST /api/v1/portal/:token/reviews`.
class PortalReview {
  const PortalReview({
    required this.id,
    required this.rating,
    this.comment,
    required this.createdAt,
  });

  final String id;
  final int rating;
  final String? comment;
  final DateTime createdAt;

  factory PortalReview.fromJson(Map<String, dynamic> json) => PortalReview(
    id: json['id'] as String,
    rating: json['rating'] as int? ?? 0,
    comment: json['comment'] as String?,
    createdAt:
        DateTime.tryParse(json['createdAt'] as String? ?? '') ?? DateTime.now(),
  );
}

class PortalRepository {
  PortalRepository({required this.baseUrl, http.Client? client})
    : _client = client ?? http.Client();

  final String baseUrl;
  final http.Client _client;

  Uri _buildUri(String path) {
    final cleanPath = path.startsWith('/') ? path : '/$path';
    final baseUri = Uri.parse(baseUrl);
    return baseUri.replace(
      path: '${baseUri.path}$cleanPath'.replaceAll('//', '/'),
    );
  }

  /// Deliberately no `Authorization` header — the portal token in the path
  /// *is* the credential. Never attach the staff access token here.
  Map<String, String> get _headers => const {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  dynamic _processResponse(http.Response response) {
    dynamic decoded;
    try {
      decoded = response.body.isNotEmpty ? jsonDecode(response.body) : null;
    } catch (e) {
      throw ApiException(
        statusCode: response.statusCode,
        code: 'INVALID_JSON_RESPONSE',
        message: 'Could not parse response: ${response.body}',
      );
    }

    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (decoded is Map<String, dynamic> && decoded.containsKey('data')) {
        return decoded['data'];
      }
      return decoded;
    }

    if (decoded is Map<String, dynamic> && decoded.containsKey('error')) {
      final err = decoded['error'] as Map<String, dynamic>;
      throw ApiException(
        statusCode: response.statusCode,
        code: err['code']?.toString() ?? 'ERROR',
        message: err['message']?.toString() ?? 'Unknown error',
        details: err['details'],
      );
    }

    throw ApiException(
      statusCode: response.statusCode,
      code: 'HTTP_${response.statusCode}',
      message: 'Request failed with status ${response.statusCode}',
    );
  }

  /// Throws [ApiException] with `code: 'PORTAL_ACCESS_EXPIRED'` (HTTP 401)
  /// if the token is unknown, revoked, or past its 30-day expiry.
  Future<PortalCustomer> fetchPortal(String token) async {
    final response = await _client.get(
      _buildUri('/api/v1/portal/$token'),
      headers: _headers,
    );
    final data = _processResponse(response);
    return PortalCustomer.fromJson(data as Map<String, dynamic>);
  }

  /// Throws [ApiException] with:
  /// - `code: 'PORTAL_ACCESS_EXPIRED'` (401) — token invalid/expired.
  /// - `code: 'REVIEW_JOB_NOT_ELIGIBLE'` (422) — job isn't this customer's
  ///   completed job.
  /// - `code: 'REVIEW_ALREADY_SUBMITTED'` (409) — one review per job.
  Future<PortalReview> submitReview(
    String token, {
    required String jobId,
    required int rating,
    String? comment,
  }) async {
    final response = await _client.post(
      _buildUri('/api/v1/portal/$token/reviews'),
      headers: _headers,
      body: jsonEncode({
        'jobId': jobId,
        'rating': rating,
        if (comment != null && comment.trim().isNotEmpty)
          'comment': comment.trim(),
      }),
    );
    final data = _processResponse(response);
    return PortalReview.fromJson(data as Map<String, dynamic>);
  }
}
