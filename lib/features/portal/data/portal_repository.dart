import 'dart:convert';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

import '../../../core/config/app_config.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/portal_client_factory.dart';
import 'portal_session_store.dart';

/// Session-based customer portal repository (handoff 6.2) — the rewrite of
/// the old long-lived-token repository.
///
/// The portal link is exchanged exactly once (`POST /portal/exchange`) for a
/// server-side session; every later call is authorized by that session:
///
/// - Web: `deliver: "cookie"` — the browser keeps the HttpOnly session
///   cookie (the client from [createPortalClient] sends it automatically).
/// - Mobile: `deliver: "bearer"` — the returned `sessionToken` is kept in
///   [PortalSessionStore] (secure storage) and attached as
///   `Authorization: Bearer` on later calls.
///
/// Every call carries `X-Aera-Portal: 1` (the backend's CSRF guard requires
/// it). The link token itself is never stored, logged, or put in a route.
final portalRepositoryProvider = Provider<PortalRepository>((ref) {
  final baseUrl = ref.watch(apiClientProvider).baseUrl;
  return PortalRepository(
    baseUrl: baseUrl,
    client: createPortalClient(),
    store: PortalSessionStore(),
  );
});

/// Variants of [PortalClosed], named after the situations the customer can
/// be in when their portal access is gone.
abstract final class PortalClosedVariant {
  /// The grant was deactivated (job done, staff deactivated, or swept).
  static const String deactivated = 'deactivated';

  /// The link was already opened on another device (single-use).
  static const String alreadyUsed = 'alreadyUsed';

  /// The link was never opened and its expiry passed.
  static const String expired = 'expired';

  /// The link (or session) is not valid at all.
  static const String invalid = 'invalid';
}

/// Result of a portal API call. Sealed so screens must handle every case:
/// an active session, a closed portal (with the business's contact details
/// so the customer can still reach them), an invalid link, or a plain
/// failure worth retrying.
sealed class PortalResult {
  const PortalResult();
}

/// The session is alive. [snapshot] is set by `job()`; [quote] by
/// `respondToQuote()`; [review] by `submitReview()`.
final class PortalSessionActive extends PortalResult {
  const PortalSessionActive({this.snapshot, this.quote, this.review});

  final PortalSnapshot? snapshot;
  final PortalQuote? quote;
  final PortalReview? review;
}

/// The portal is closed for this customer. [variant] is one of
/// [PortalClosedVariant]; [contact] carries the company + owner/dispatcher
/// contact payload the backend sends with 410 responses (when present).
final class PortalClosed extends PortalResult {
  const PortalClosed({required this.variant, this.contact});

  final String variant;
  final CompanyContactInfo? contact;
}

/// The link token is unknown/invalid (`401 PORTAL_LINK_INVALID`).
final class PortalInvalid extends PortalResult {
  const PortalInvalid();
}

/// Anything else went wrong (network, 5xx, unexpected payload).
final class PortalFailure extends PortalResult {
  const PortalFailure(this.message);

  final String message;
}

/// Extracts the one-time token from a portal link fragment.
///
/// Fragments look like `t=<token>` (the part after `#` in
/// `https://portal…/open#t=…`). Returns null when there is no usable `t`
/// parameter. Pure and unit-testable; the token is only ever handed to
/// [PortalRepository.exchange] — never stored in a provider or a route.
String? parsePortalFragment(String fragment) {
  var value = fragment.trim();
  if (value.startsWith('#')) value = value.substring(1);
  if (value.isEmpty) return null;
  for (final part in value.split('&')) {
    final eq = part.indexOf('=');
    if (eq <= 0) continue;
    if (part.substring(0, eq) != 't') continue;
    final token = Uri.decodeComponent(part.substring(eq + 1)).trim();
    return token.isEmpty ? null : token;
  }
  return null;
}

/// One owner/dispatcher contact from the closed-portal payload.
class PortalContact {
  const PortalContact({
    required this.role,
    required this.name,
    this.phone,
    this.email,
  });

  final String role; // 'OWNER' | 'DISPATCHER'
  final String name;
  final String? phone;
  final String? email;

  factory PortalContact.fromJson(Map<String, dynamic> json) => PortalContact(
    role: json['role'] as String? ?? 'OWNER',
    name: json['name'] as String? ?? '',
    phone: json['phone'] as String?,
    email: json['email'] as String?,
  );
}

/// The `{company, contacts}` payload the backend attaches to 410 portal
/// responses, so a customer whose access ended can still call the business.
class CompanyContactInfo {
  const CompanyContactInfo({
    required this.companyName,
    this.companyPhone,
    this.contacts = const [],
  });

  final String companyName;
  final String? companyPhone;
  final List<PortalContact> contacts;

  static CompanyContactInfo? tryParse(Map<String, dynamic> data) {
    final company = data['company'];
    if (company is! Map<String, dynamic>) return null;
    final name = company['name'] as String?;
    if (name == null || name.isEmpty) return null;
    return CompanyContactInfo(
      companyName: name,
      companyPhone: company['phone'] as String?,
      contacts:
          (data['contacts'] as List<dynamic>?)
              ?.map((c) => PortalContact.fromJson(c as Map<String, dynamic>))
              .toList() ??
          const [],
    );
  }
}

/// The job's address as exposed in the portal snapshot.
class PortalJobAddress {
  const PortalJobAddress({
    required this.line1,
    required this.city,
    this.line2,
    this.region,
    this.postalCode,
  });

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
    if (postalCode != null && postalCode!.isNotEmpty) postalCode,
  ].join(', ');

  factory PortalJobAddress.fromJson(Map<String, dynamic> json) =>
      PortalJobAddress(
        line1: json['line1'] as String? ?? '',
        line2: json['line2'] as String?,
        city: json['city'] as String? ?? '',
        region: json['region'] as String?,
        postalCode: json['postalCode'] as String?,
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

/// The on-site handshake code, present in the snapshot only while the
/// technician is en route. Shown to the customer only — the technician must
/// ask for it and type it in (handoff 6.3).
class PortalHandshake {
  const PortalHandshake({required this.code, this.technicianName});

  final String code;
  final String? technicianName;

  factory PortalHandshake.fromJson(Map<String, dynamic> json) =>
      PortalHandshake(
        code: json['code']?.toString() ?? '',
        technicianName: json['technicianName'] as String?,
      );
}

/// The one job this portal session is scoped to (`data.job`).
class PortalJob {
  const PortalJob({
    required this.jobNumber,
    required this.serviceType,
    required this.problemDescription,
    required this.status,
    this.scheduledStart,
    this.scheduledEnd,
    this.completedAt,
    this.address,
    this.technician,
    this.handshake,
  });

  final int jobNumber;
  final String serviceType;
  final String problemDescription;
  final String status;
  final DateTime? scheduledStart;
  final DateTime? scheduledEnd;
  final DateTime? completedAt;
  final PortalJobAddress? address;
  final PortalTechnicianRef? technician;
  final PortalHandshake? handshake;

  factory PortalJob.fromJson(Map<String, dynamic> json) => PortalJob(
    // jobNumber is a plain Prisma Int — never string-encoded (money is).
    jobNumber: json['jobNumber'] as int? ?? 0,
    serviceType: json['serviceType'] as String? ?? '',
    problemDescription: json['problemDescription'] as String? ?? '',
    status: json['status'] as String? ?? 'NEW',
    scheduledStart: json['scheduledStart'] != null
        ? DateTime.tryParse(json['scheduledStart'] as String)?.toLocal()
        : null,
    scheduledEnd: json['scheduledEnd'] != null
        ? DateTime.tryParse(json['scheduledEnd'] as String)?.toLocal()
        : null,
    completedAt: json['completedAt'] != null
        ? DateTime.tryParse(json['completedAt'] as String)?.toLocal()
        : null,
    address: json['address'] != null
        ? PortalJobAddress.fromJson(json['address'] as Map<String, dynamic>)
        : null,
    technician: json['technician'] != null
        ? PortalTechnicianRef.fromJson(
            json['technician'] as Map<String, dynamic>,
          )
        : null,
    handshake: json['handshake'] != null
        ? PortalHandshake.fromJson(json['handshake'] as Map<String, dynamic>)
        : null,
  );
}

class PortalLineItem {
  const PortalLineItem({
    required this.id,
    required this.description,
    required this.quantity,
    required this.unitPriceMinor,
    required this.totalMinor,
  });

  final String id;
  final String description;
  final double quantity;
  final int unitPriceMinor;
  final int totalMinor;

  factory PortalLineItem.fromJson(Map<String, dynamic> json) => PortalLineItem(
    id: json['id'] as String? ?? '',
    description: json['description'] as String? ?? '',
    // quantity is a Postgres Decimal serialized as a JSON string; money is
    // BigInt serialized as a JSON string. Never parse either as num.
    quantity: double.tryParse(json['quantity']?.toString() ?? '') ?? 0,
    unitPriceMinor: int.tryParse(json['unitPriceMinor']?.toString() ?? '') ?? 0,
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
    required this.taxRateBps,
    required this.totalMinor,
    required this.currency,
    this.expiresAt,
    this.items = const [],
  });

  final String id;
  final String status;
  final int subtotalMinor;
  final int discountMinor;
  final int taxMinor;
  final int taxRateBps;
  final int totalMinor;
  final String currency;
  final DateTime? expiresAt;
  final List<PortalLineItem> items;

  factory PortalQuote.fromJson(Map<String, dynamic> json) => PortalQuote(
    id: json['id'] as String,
    status: json['status'] as String? ?? 'SENT',
    subtotalMinor: int.tryParse(json['subtotalMinor']?.toString() ?? '') ?? 0,
    discountMinor: int.tryParse(json['discountMinor']?.toString() ?? '') ?? 0,
    taxMinor: int.tryParse(json['taxMinor']?.toString() ?? '') ?? 0,
    taxRateBps: json['taxRateBps'] as int? ?? 0,
    totalMinor: int.tryParse(json['totalMinor']?.toString() ?? '') ?? 0,
    currency: json['currency'] as String? ?? 'USD',
    expiresAt: json['expiresAt'] != null
        ? DateTime.tryParse(json['expiresAt'] as String)?.toLocal()
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
        ? DateTime.tryParse(json['issuedAt'] as String)?.toLocal()
        : null,
    dueAt: json['dueAt'] != null
        ? DateTime.tryParse(json['dueAt'] as String)?.toLocal()
        : null,
    items:
        (json['items'] as List<dynamic>?)
            ?.map((i) => PortalLineItem.fromJson(i as Map<String, dynamic>))
            .toList() ??
        const [],
  );
}

/// The customer's review for the session job, when one exists.
class PortalReview {
  const PortalReview({required this.id, required this.rating, this.comment});

  final String id;
  final int rating;
  final String? comment;

  factory PortalReview.fromJson(Map<String, dynamic> json) => PortalReview(
    id: json['id'] as String,
    rating: json['rating'] as int? ?? 0,
    comment: json['comment'] as String?,
  );
}

class PortalCompany {
  const PortalCompany({required this.name});

  final String name;

  factory PortalCompany.fromJson(Map<String, dynamic> json) =>
      PortalCompany(name: json['name'] as String? ?? '');
}

/// The full `GET /api/v1/portal/job` snapshot: exactly one job (the
/// session's), its customer-visible quotes and invoices, the review if any,
/// and the company name. No history, no other jobs (handoff G11).
class PortalSnapshot {
  const PortalSnapshot({
    required this.job,
    required this.company,
    this.quotes = const [],
    this.invoices = const [],
    this.review,
  });

  final PortalJob job;
  final PortalCompany company;
  final List<PortalQuote> quotes;
  final List<PortalInvoice> invoices;
  final PortalReview? review;

  factory PortalSnapshot.fromJson(Map<String, dynamic> json) => PortalSnapshot(
    job: PortalJob.fromJson(json['job'] as Map<String, dynamic>),
    company: PortalCompany.fromJson(
      (json['company'] as Map<String, dynamic>?) ?? const {},
    ),
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
    review: json['review'] != null
        ? PortalReview.fromJson(json['review'] as Map<String, dynamic>)
        : null,
  );
}

class PortalRepository {
  PortalRepository({
    String? baseUrl,
    http.Client? client,
    PortalSessionStore? store,
    bool? forceWebTransport,
  }) : baseUrl = baseUrl ?? AppConfig.apiBaseUrl,
       _client = client ?? http.Client(),
       _store = store ?? PortalSessionStore(),
       _webTransport = forceWebTransport ?? kIsWeb;

  final String baseUrl;
  final http.Client _client;
  final PortalSessionStore _store;

  /// True on web (cookie session), false on mobile (bearer session).
  /// Overridable only so tests can exercise both transports on one platform.
  final bool _webTransport;

  String? _bearerToken;
  bool _bearerLoaded = false;

  Uri _buildUri(String path) {
    final cleanPath = path.startsWith('/') ? path : '/$path';
    final baseUri = Uri.parse(baseUrl);
    return baseUri.replace(
      path: '${baseUri.path}$cleanPath'.replaceAll('//', '/'),
    );
  }

  Future<String?> _bearer() async {
    if (_webTransport) return null;
    if (!_bearerLoaded) {
      _bearerToken = await _store.read();
      _bearerLoaded = true;
    }
    return _bearerToken;
  }

  Future<Map<String, String>> _headers() async {
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      // Required by the backend's portal CSRF guard on every call.
      'X-Aera-Portal': '1',
    };
    final bearer = await _bearer();
    if (bearer != null && bearer.isNotEmpty) {
      headers['Authorization'] = 'Bearer $bearer';
    }
    return headers;
  }

  /// Maps a non-2xx response to the sealed result types. The 410 bodies
  /// carry `{data: {state, company, contacts}}` alongside the error, which
  /// is where [PortalClosed.contact] comes from.
  PortalResult _errorResult(http.Response response) {
    dynamic decoded;
    try {
      decoded = response.body.isNotEmpty ? jsonDecode(response.body) : null;
    } catch (_) {
      decoded = null;
    }
    final error = decoded is Map<String, dynamic> ? decoded['error'] : null;
    final code = error is Map<String, dynamic>
        ? error['code']?.toString()
        : null;
    final message = error is Map<String, dynamic>
        ? error['message']?.toString()
        : null;
    final data = decoded is Map<String, dynamic> ? decoded['data'] : null;
    final contact = data is Map<String, dynamic>
        ? CompanyContactInfo.tryParse(data)
        : null;

    if (response.statusCode == 410 && code == 'PORTAL_ACCESS_DEACTIVATED') {
      return PortalClosed(
        variant: PortalClosedVariant.deactivated,
        contact: contact,
      );
    }
    if (response.statusCode == 410 && code == 'PORTAL_LINK_EXPIRED') {
      return PortalClosed(
        variant: PortalClosedVariant.expired,
        contact: contact,
      );
    }
    if (response.statusCode == 409 && code == 'PORTAL_LINK_ALREADY_USED') {
      return PortalClosed(
        variant: PortalClosedVariant.alreadyUsed,
        contact: contact,
      );
    }
    if (response.statusCode == 401 && code == 'PORTAL_LINK_INVALID') {
      return const PortalInvalid();
    }
    if (response.statusCode == 401 && code == 'PORTAL_SESSION_EXPIRED') {
      // A live session that expired by age/idle timeout (portal.session.ts).
      // The portal is closed for this customer — same end state as an
      // expired link, though a contacts payload may not be attached.
      return PortalClosed(
        variant: PortalClosedVariant.expired,
        contact: contact,
      );
    }
    return PortalFailure(
      message ?? 'Request failed with status ${response.statusCode}',
    );
  }

  dynamic _dataOrNull(http.Response response) {
    if (response.statusCode < 200 || response.statusCode >= 300) return null;
    try {
      final decoded = response.body.isNotEmpty
          ? jsonDecode(response.body)
          : null;
      if (decoded is Map<String, dynamic>) return decoded['data'];
      return decoded;
    } catch (_) {
      return null;
    }
  }

  /// Burns the one-time link [token] and establishes the session.
  /// Web asks for `deliver: "cookie"`; mobile for `deliver: "bearer"` and
  /// keeps the returned session token in secure storage.
  Future<PortalResult> exchange(String token) async {
    final http.Response response;
    try {
      response = await _client.post(
        _buildUri('/api/v1/portal/exchange'),
        headers: await _headers(),
        body: jsonEncode({
          'token': token,
          'deliver': _webTransport ? 'cookie' : 'bearer',
        }),
      );
    } catch (_) {
      return const PortalFailure('Could not reach the server');
    }
    final data = _dataOrNull(response);
    if (data == null) return _errorResult(response);
    if (!_webTransport) {
      final sessionToken = (data as Map<String, dynamic>)['sessionToken'];
      if (sessionToken is String && sessionToken.isNotEmpty) {
        _bearerToken = sessionToken;
        _bearerLoaded = true;
        await _store.write(sessionToken);
      }
    }
    return const PortalSessionActive();
  }

  /// Probes the existing session (cookie on web, stored bearer on mobile).
  /// Any 401 here simply means "no live session" ([PortalInvalid]) — the
  /// caller then falls back to exchanging the link token.
  Future<PortalResult> session() async {
    final http.Response response;
    try {
      response = await _client.get(
        _buildUri('/api/v1/portal/session'),
        headers: await _headers(),
      );
    } catch (_) {
      return const PortalFailure('Could not reach the server');
    }
    if (_dataOrNull(response) == null) {
      if (response.statusCode == 401) return const PortalInvalid();
      return _errorResult(response);
    }
    return const PortalSessionActive();
  }

  /// Loads the session job snapshot (`GET /api/v1/portal/job`).
  Future<PortalResult> job() async {
    final http.Response response;
    try {
      response = await _client.get(
        _buildUri('/api/v1/portal/job'),
        headers: await _headers(),
      );
    } catch (_) {
      return const PortalFailure('Could not reach the server');
    }
    final data = _dataOrNull(response);
    if (data == null) return _errorResult(response);
    try {
      return PortalSessionActive(
        snapshot: PortalSnapshot.fromJson(data as Map<String, dynamic>),
      );
    } catch (_) {
      return const PortalFailure('Received an unexpected response');
    }
  }

  /// Approves or declines a quote in the snapshot. [action] is
  /// `'APPROVED'` or `'DECLINED'`.
  Future<PortalResult> respondToQuote(String quoteId, String action) async {
    final http.Response response;
    try {
      response = await _client.post(
        _buildUri('/api/v1/portal/quotes/$quoteId/respond'),
        headers: await _headers(),
        body: jsonEncode({'action': action}),
      );
    } catch (_) {
      return const PortalFailure('Could not reach the server');
    }
    final data = _dataOrNull(response);
    if (data == null) return _errorResult(response);
    try {
      final map = data as Map<String, dynamic>;
      final quoteJson = map['quote'] is Map<String, dynamic>
          ? map['quote'] as Map<String, dynamic>
          : map;
      return PortalSessionActive(quote: PortalQuote.fromJson(quoteJson));
    } catch (_) {
      return const PortalFailure('Received an unexpected response');
    }
  }

  /// Submits the review for the session job (job is taken from the session
  /// server-side, never from the body).
  Future<PortalResult> submitReview(int rating, String? comment) async {
    final http.Response response;
    try {
      response = await _client.post(
        _buildUri('/api/v1/portal/reviews'),
        headers: await _headers(),
        body: jsonEncode({
          'rating': rating,
          if (comment != null && comment.trim().isNotEmpty)
            'comment': comment.trim(),
        }),
      );
    } catch (_) {
      return const PortalFailure('Could not reach the server');
    }
    final data = _dataOrNull(response);
    if (data == null) return _errorResult(response);
    try {
      final map = data as Map<String, dynamic>;
      final reviewJson = map['review'] is Map<String, dynamic>
          ? map['review'] as Map<String, dynamic>
          : map;
      return PortalSessionActive(review: PortalReview.fromJson(reviewJson));
    } catch (_) {
      return const PortalFailure('Received an unexpected response');
    }
  }

  /// Revokes the session server-side and forgets the stored bearer token.
  /// Best effort: local state is cleared even if the call fails.
  Future<void> logout() async {
    try {
      await _client.post(
        _buildUri('/api/v1/portal/logout'),
        headers: await _headers(),
      );
    } catch (_) {
      // The session may already be gone; local cleanup still applies.
    }
    _bearerToken = null;
    _bearerLoaded = true;
    await _store.clear();
  }
}
