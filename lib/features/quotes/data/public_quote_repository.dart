import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

import '../../../core/network/api_client.dart';
import '../../../core/network/api_response.dart';

/// The public quote-approval link (`GET/POST /api/v1/quotes/shared/:shareToken`)
/// is a bearer-less endpoint keyed by `Quote.shareToken` — same shape of
/// problem as the customer portal token, and the same answer: this
/// deliberately does NOT reuse [ApiClient]'s `setAccessToken`/refresh
/// machinery, because there is no staff session on the other end. We still
/// borrow [ApiClient.baseUrl] so the platform base-URL detection isn't
/// duplicated, but requests never carry an `Authorization` header.
///
/// This is a separate credential/flow from the customer portal token in
/// `portal_repository.dart`: a quote's `shareToken` (see `PortalQuote`) is
/// generated per-quote by `sendQuote` and lets a customer approve/decline
/// without ever holding the longer-lived 30-day portal link.
final publicQuoteRepositoryProvider = Provider<PublicQuoteRepository>((ref) {
  final baseUrl = ref.watch(apiClientProvider).baseUrl;
  return PublicQuoteRepository(baseUrl: baseUrl);
});

class PublicQuoteCustomerRef {
  const PublicQuoteCustomerRef({
    required this.firstName,
    required this.lastName,
  });

  final String firstName;
  final String lastName;

  String get fullName => '$firstName $lastName'.trim();

  factory PublicQuoteCustomerRef.fromJson(Map<String, dynamic> json) =>
      PublicQuoteCustomerRef(
        firstName: json['firstName'] as String? ?? '',
        lastName: json['lastName'] as String? ?? '',
      );
}

/// The narrow `{jobNumber, serviceType}` shape `getPublicQuote` selects for
/// the attached job — deliberately not the full job model, same "too
/// narrow to reuse" call made for `QuoteJobRef` in `quotes_repository.dart`.
class PublicQuoteJobRef {
  const PublicQuoteJobRef({required this.jobNumber, required this.serviceType});

  final int jobNumber;
  final String serviceType;

  factory PublicQuoteJobRef.fromJson(Map<String, dynamic> json) =>
      PublicQuoteJobRef(
        jobNumber: json['jobNumber'] as int? ?? 0,
        serviceType: json['serviceType'] as String? ?? '',
      );
}

class PublicQuoteItem {
  const PublicQuoteItem({
    required this.description,
    required this.quantity,
    required this.unitPriceMinor,
    required this.totalMinor,
  });

  final String description;
  final double quantity;
  final int unitPriceMinor;
  final int totalMinor;

  factory PublicQuoteItem.fromJson(Map<String, dynamic> json) =>
      PublicQuoteItem(
        description: json['description'] as String? ?? '',
        // quantity is a Postgres Decimal, serialized as a JSON string (see
        // `jsonSafe` in quote.service.ts) — never parse as num.
        quantity: double.tryParse(json['quantity']?.toString() ?? '') ?? 0,
        unitPriceMinor:
            int.tryParse(json['unitPriceMinor']?.toString() ?? '') ?? 0,
        totalMinor: int.tryParse(json['totalMinor']?.toString() ?? '') ?? 0,
      );
}

class PublicQuote {
  const PublicQuote({
    required this.id,
    required this.status,
    required this.subtotalMinor,
    required this.discountMinor,
    required this.taxMinor,
    required this.taxRateBps,
    required this.totalMinor,
    required this.currency,
    this.expiresAt,
    this.sentAt,
    this.approvedAt,
    this.declinedAt,
    this.customer,
    this.job,
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
  final DateTime? sentAt;
  final DateTime? approvedAt;
  final DateTime? declinedAt;
  final PublicQuoteCustomerRef? customer;
  final PublicQuoteJobRef? job;
  final List<PublicQuoteItem> items;

  bool get isExpired =>
      expiresAt != null && expiresAt!.isBefore(DateTime.now());

  /// The only status from which `respond` is a valid action. Anything else
  /// (already `APPROVED`/`DECLINED`, or `EXPIRED`/`DRAFT`) means the
  /// decision has already been made or isn't this customer's to make yet.
  bool get canRespond => status == 'SENT' && !isExpired;

  factory PublicQuote.fromJson(Map<String, dynamic> json) => PublicQuote(
    id: json['id'] as String,
    status: json['status'] as String? ?? 'SENT',
    subtotalMinor: int.tryParse(json['subtotalMinor']?.toString() ?? '') ?? 0,
    discountMinor: int.tryParse(json['discountMinor']?.toString() ?? '') ?? 0,
    taxMinor: int.tryParse(json['taxMinor']?.toString() ?? '') ?? 0,
    taxRateBps: json['taxRateBps'] as int? ?? 0,
    totalMinor: int.tryParse(json['totalMinor']?.toString() ?? '') ?? 0,
    currency: json['currency'] as String? ?? 'USD',
    expiresAt: json['expiresAt'] != null
        ? DateTime.tryParse(json['expiresAt'] as String)
        : null,
    sentAt: json['sentAt'] != null
        ? DateTime.tryParse(json['sentAt'] as String)
        : null,
    approvedAt: json['approvedAt'] != null
        ? DateTime.tryParse(json['approvedAt'] as String)
        : null,
    declinedAt: json['declinedAt'] != null
        ? DateTime.tryParse(json['declinedAt'] as String)
        : null,
    customer: json['customer'] != null
        ? PublicQuoteCustomerRef.fromJson(
            json['customer'] as Map<String, dynamic>,
          )
        : null,
    job: json['job'] != null
        ? PublicQuoteJobRef.fromJson(json['job'] as Map<String, dynamic>)
        : null,
    items:
        (json['items'] as List<dynamic>?)
            ?.map((i) => PublicQuoteItem.fromJson(i as Map<String, dynamic>))
            .toList() ??
        const [],
  );
}

class PublicQuoteRepository {
  PublicQuoteRepository({required this.baseUrl, http.Client? client})
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

  /// Deliberately no `Authorization` header — the quote's `shareToken` in
  /// the path *is* the credential. Never attach the staff access token here.
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

  /// Throws [ApiException] with `code: 'RESOURCE_NOT_FOUND'` (404) if the
  /// share token is unknown.
  Future<PublicQuote> fetchQuote(String shareToken) async {
    final response = await _client.get(
      _buildUri('/api/v1/quotes/shared/$shareToken'),
      headers: _headers,
    );
    final data = _processResponse(response);
    return PublicQuote.fromJson(data as Map<String, dynamic>);
  }

  /// Throws [ApiException] with:
  /// - `code: 'RESOURCE_NOT_FOUND'` (404) — share token invalid.
  /// - `code: 'QUOTE_ALREADY_RESOLVED'` (409) — quote is no longer `SENT`
  ///   and the requested action doesn't match its current status (the
  ///   backend is idempotent if the action *matches* the current status).
  Future<PublicQuote> respond(
    String shareToken, {
    required bool approve,
  }) async {
    final response = await _client.post(
      _buildUri('/api/v1/quotes/shared/$shareToken/respond'),
      headers: _headers,
      body: jsonEncode({'action': approve ? 'APPROVED' : 'DECLINED'}),
    );
    final data = _processResponse(response);
    return PublicQuote.fromJson(data as Map<String, dynamic>);
  }
}
