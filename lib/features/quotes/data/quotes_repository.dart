import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';

final quotesRepositoryProvider = Provider<QuotesRepository>((ref) {
  final client = ref.watch(apiClientProvider);
  return QuotesRepository(client);
});

class QuoteCustomer {
  const QuoteCustomer({
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

  factory QuoteCustomer.fromJson(Map<String, dynamic> json) => QuoteCustomer(
    id: json['id'] as String,
    firstName: json['firstName'] as String? ?? '',
    lastName: json['lastName'] as String? ?? '',
    email: json['email'] as String?,
  );
}

/// The narrow `{id, jobNumber, status}` shape `quoteSelect()` actually
/// returns for the attached job — deliberately not the full `Job` model
/// from `jobs_repository.dart`, same "too narrow to reuse" call made for
/// `/schedule` in Phase 5.
class QuoteJobRef {
  const QuoteJobRef({
    required this.id,
    required this.jobNumber,
    required this.status,
  });

  final String id;
  final int jobNumber;
  final String status;

  factory QuoteJobRef.fromJson(Map<String, dynamic> json) => QuoteJobRef(
    id: json['id'] as String,
    jobNumber: json['jobNumber'] as int? ?? 0,
    status: json['status'] as String? ?? '',
  );
}

class QuoteItem {
  const QuoteItem({
    required this.id,
    required this.description,
    required this.quantity,
    required this.unitPriceMinor,
    required this.totalMinor,
    required this.sortOrder,
  });

  final String id;
  final String description;
  final double quantity;
  final int unitPriceMinor;
  final int totalMinor;
  final int sortOrder;

  factory QuoteItem.fromJson(Map<String, dynamic> json) => QuoteItem(
    id: json['id'] as String,
    description: json['description'] as String? ?? '',
    // quantity is a Postgres Decimal, serialized by the backend as a
    // JSON string (see quote.service.ts `jsonSafe`) — never parse as num.
    quantity: double.tryParse(json['quantity']?.toString() ?? '') ?? 0,
    // unitPriceMinor/totalMinor are Postgres BigInt, serialized as strings.
    unitPriceMinor: int.tryParse(json['unitPriceMinor']?.toString() ?? '') ?? 0,
    totalMinor: int.tryParse(json['totalMinor']?.toString() ?? '') ?? 0,
    sortOrder: json['sortOrder'] as int? ?? 0,
  );
}

class QuoteApprovalEvent {
  const QuoteApprovalEvent({
    required this.id,
    required this.action,
    required this.source,
    required this.createdAt,
    this.actorName,
  });

  final String id;
  final String action;
  final String source;
  final DateTime createdAt;
  final String? actorName;

  factory QuoteApprovalEvent.fromJson(Map<String, dynamic> json) {
    final actor = json['actor'] as Map<String, dynamic>?;
    final name = actor != null
        ? '${actor['firstName'] ?? ''} ${actor['lastName'] ?? ''}'.trim()
        : null;
    return QuoteApprovalEvent(
      id: json['id'] as String,
      action: json['action'] as String? ?? '',
      source: json['source'] as String? ?? '',
      createdAt:
          DateTime.tryParse(json['createdAt'] as String? ?? '') ??
          DateTime.now(),
      actorName: (name == null || name.isEmpty) ? null : name,
    );
  }
}

class Quote {
  const Quote({
    required this.id,
    required this.customerId,
    this.jobId,
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
    this.shareToken,
    required this.createdAt,
    required this.updatedAt,
    required this.customer,
    this.job,
    this.items = const [],
    this.approvalEvents = const [],
  });

  final String id;
  final String customerId;
  final String? jobId;
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
  final String? shareToken;
  final DateTime createdAt;
  final DateTime updatedAt;
  final QuoteCustomer customer;
  final QuoteJobRef? job;
  final List<QuoteItem> items;
  final List<QuoteApprovalEvent> approvalEvents;

  factory Quote.fromJson(Map<String, dynamic> json) => Quote(
    id: json['id'] as String,
    customerId: json['customerId'] as String? ?? '',
    jobId: json['jobId'] as String?,
    status: json['status'] as String? ?? 'DRAFT',
    // subtotalMinor/discountMinor/taxMinor/totalMinor are Postgres BigInt,
    // serialized as JSON strings.
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
    shareToken: json['shareToken'] as String?,
    createdAt:
        DateTime.tryParse(json['createdAt'] as String? ?? '') ?? DateTime.now(),
    updatedAt:
        DateTime.tryParse(json['updatedAt'] as String? ?? '') ?? DateTime.now(),
    customer: QuoteCustomer.fromJson(
      json['customer'] as Map<String, dynamic>? ?? const {},
    ),
    job: json['job'] != null
        ? QuoteJobRef.fromJson(json['job'] as Map<String, dynamic>)
        : null,
    items:
        (json['items'] as List<dynamic>?)
            ?.map((i) => QuoteItem.fromJson(i as Map<String, dynamic>))
            .toList() ??
        const [],
    approvalEvents:
        (json['approvalEvents'] as List<dynamic>?)
            ?.map((e) => QuoteApprovalEvent.fromJson(e as Map<String, dynamic>))
            .toList() ??
        const [],
  );
}

class CreateQuoteItemInput {
  const CreateQuoteItemInput({
    required this.description,
    required this.quantity,
    required this.unitPriceMinor,
  });

  final String description;
  final double quantity;
  final int unitPriceMinor;

  Map<String, dynamic> toJson() => {
    'description': description.trim(),
    'quantity': quantity,
    'unitPriceMinor': unitPriceMinor,
  };
}

class CreateQuoteInput {
  const CreateQuoteInput({
    required this.customerId,
    this.jobId,
    required this.currency,
    this.discountMinor = 0,
    this.taxRateBps = 0,
    this.expiresAt,
    required this.items,
  });

  final String customerId;
  final String? jobId;
  final String currency;
  final int discountMinor;
  final int taxRateBps;
  final DateTime? expiresAt;
  final List<CreateQuoteItemInput> items;

  Map<String, dynamic> toJson() => {
    'customerId': customerId,
    if (jobId != null && jobId!.isNotEmpty) 'jobId': jobId,
    'currency': currency.toUpperCase(),
    'discountMinor': discountMinor,
    'taxRateBps': taxRateBps,
    if (expiresAt != null) 'expiresAt': expiresAt!.toUtc().toIso8601String(),
    'items': items.map((i) => i.toJson()).toList(),
  };
}

class QuotesRepository {
  QuotesRepository(this._client);

  final ApiClient _client;

  Future<List<Quote>> listQuotes({String? status}) async {
    final res = await _client.get(
      '/api/v1/quotes',
      queryParameters: {
        if (status != null && status.isNotEmpty) 'status': status,
      },
    );
    return (res as List<dynamic>)
        .map((q) => Quote.fromJson(q as Map<String, dynamic>))
        .toList();
  }

  Future<Quote> getQuote(String quoteId) async {
    final res = await _client.get('/api/v1/quotes/$quoteId');
    return Quote.fromJson(res as Map<String, dynamic>);
  }

  /// Server computes all totals — the [input] carries raw items only.
  /// Never recompute a total client-side and treat it as truth.
  Future<Quote> createQuote(CreateQuoteInput input) async {
    final res = await _client.post('/api/v1/quotes', body: input.toJson());
    return Quote.fromJson(res as Map<String, dynamic>);
  }

  Future<Quote> sendQuote(String quoteId) async {
    final res = await _client.post('/api/v1/quotes/$quoteId/send');
    return Quote.fromJson(res as Map<String, dynamic>);
  }
}
