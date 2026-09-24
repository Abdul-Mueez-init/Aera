import 'dart:math';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/network/api_client.dart';

final invoicesRepositoryProvider = Provider<InvoicesRepository>((ref) {
  final client = ref.watch(apiClientProvider);
  return InvoicesRepository(client);
});

class InvoiceCustomer {
  const InvoiceCustomer({
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

  factory InvoiceCustomer.fromJson(Map<String, dynamic> json) =>
      InvoiceCustomer(
        id: json['id'] as String,
        firstName: json['firstName'] as String? ?? '',
        lastName: json['lastName'] as String? ?? '',
        email: json['email'] as String?,
      );
}

/// The narrow `{id, jobNumber, status}` shape `invoiceSelect()` actually
/// returns for the attached job — same "too narrow to reuse the full Job
/// model" call already made for `QuoteJobRef` in quotes_repository.dart.
class InvoiceJobRef {
  const InvoiceJobRef({
    required this.id,
    required this.jobNumber,
    required this.status,
  });

  final String id;
  final int jobNumber;
  final String status;

  factory InvoiceJobRef.fromJson(Map<String, dynamic> json) => InvoiceJobRef(
    id: json['id'] as String,
    jobNumber: json['jobNumber'] as int? ?? 0,
    status: json['status'] as String? ?? '',
  );
}

class InvoiceQuoteRef {
  const InvoiceQuoteRef({required this.id, required this.status});

  final String id;
  final String status;

  factory InvoiceQuoteRef.fromJson(Map<String, dynamic> json) =>
      InvoiceQuoteRef(
        id: json['id'] as String,
        status: json['status'] as String? ?? '',
      );
}

class InvoiceItem {
  const InvoiceItem({
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

  factory InvoiceItem.fromJson(Map<String, dynamic> json) => InvoiceItem(
    id: json['id'] as String,
    description: json['description'] as String? ?? '',
    // quantity is a Postgres Decimal, serialized as a JSON string — never
    // parse as num (same pattern as QuoteItem/JobPart).
    quantity: double.tryParse(json['quantity']?.toString() ?? '') ?? 0,
    // unitPriceMinor/totalMinor are Postgres BigInt, serialized as strings.
    unitPriceMinor: int.tryParse(json['unitPriceMinor']?.toString() ?? '') ?? 0,
    totalMinor: int.tryParse(json['totalMinor']?.toString() ?? '') ?? 0,
    sortOrder: json['sortOrder'] as int? ?? 0,
  );
}

class Payment {
  const Payment({
    required this.id,
    required this.amountMinor,
    required this.currency,
    required this.method,
    required this.receivedAt,
    this.provider,
    this.reference,
    this.idempotencyKey,
  });

  final String id;
  final int amountMinor;
  final String currency;
  final String method;
  final DateTime receivedAt;
  final String? provider;
  final String? reference;
  final String? idempotencyKey;

  factory Payment.fromJson(Map<String, dynamic> json) => Payment(
    id: json['id'] as String,
    // amountMinor is a Postgres BigInt, serialized as a JSON string.
    amountMinor: int.tryParse(json['amountMinor']?.toString() ?? '') ?? 0,
    currency: json['currency'] as String? ?? 'USD',
    method: json['method'] as String? ?? 'OTHER',
    receivedAt:
        DateTime.tryParse(json['receivedAt'] as String? ?? '') ??
        DateTime.now(),
    provider: json['provider'] as String?,
    reference: json['reference'] as String?,
    idempotencyKey: json['idempotencyKey'] as String?,
  );
}

class Invoice {
  const Invoice({
    required this.id,
    required this.customerId,
    this.jobId,
    this.quoteId,
    required this.invoiceNumber,
    required this.status,
    required this.subtotalMinor,
    required this.discountMinor,
    required this.taxMinor,
    required this.totalMinor,
    required this.amountPaidMinor,
    required this.balanceDueMinor,
    required this.currency,
    this.dueAt,
    this.issuedAt,
    this.paidAt,
    required this.createdAt,
    required this.updatedAt,
    required this.customer,
    this.job,
    this.quote,
    this.items = const [],
    this.payments = const [],
  });

  final String id;
  final String customerId;
  final String? jobId;
  final String? quoteId;
  final String invoiceNumber;
  final String status;
  final int subtotalMinor;
  final int discountMinor;
  final int taxMinor;
  final int totalMinor;
  final int amountPaidMinor;
  final int balanceDueMinor;
  final String currency;
  final DateTime? dueAt;
  final DateTime? issuedAt;
  final DateTime? paidAt;
  final DateTime createdAt;
  final DateTime updatedAt;
  final InvoiceCustomer customer;
  final InvoiceJobRef? job;
  final InvoiceQuoteRef? quote;
  final List<InvoiceItem> items;
  final List<Payment> payments;

  factory Invoice.fromJson(Map<String, dynamic> json) => Invoice(
    id: json['id'] as String,
    customerId: json['customerId'] as String? ?? '',
    jobId: json['jobId'] as String?,
    quoteId: json['quoteId'] as String?,
    invoiceNumber: json['invoiceNumber'] as String? ?? '',
    status: json['status'] as String? ?? 'DRAFT',
    // subtotalMinor/discountMinor/taxMinor/totalMinor/amountPaidMinor/
    // balanceDueMinor are Postgres BigInt, serialized as JSON strings.
    subtotalMinor: int.tryParse(json['subtotalMinor']?.toString() ?? '') ?? 0,
    discountMinor: int.tryParse(json['discountMinor']?.toString() ?? '') ?? 0,
    taxMinor: int.tryParse(json['taxMinor']?.toString() ?? '') ?? 0,
    totalMinor: int.tryParse(json['totalMinor']?.toString() ?? '') ?? 0,
    amountPaidMinor:
        int.tryParse(json['amountPaidMinor']?.toString() ?? '') ?? 0,
    balanceDueMinor:
        int.tryParse(json['balanceDueMinor']?.toString() ?? '') ?? 0,
    currency: json['currency'] as String? ?? 'USD',
    dueAt: json['dueAt'] != null
        ? DateTime.tryParse(json['dueAt'] as String)
        : null,
    issuedAt: json['issuedAt'] != null
        ? DateTime.tryParse(json['issuedAt'] as String)
        : null,
    paidAt: json['paidAt'] != null
        ? DateTime.tryParse(json['paidAt'] as String)
        : null,
    createdAt:
        DateTime.tryParse(json['createdAt'] as String? ?? '') ?? DateTime.now(),
    updatedAt:
        DateTime.tryParse(json['updatedAt'] as String? ?? '') ?? DateTime.now(),
    customer: InvoiceCustomer.fromJson(
      json['customer'] as Map<String, dynamic>? ?? const {},
    ),
    job: json['job'] != null
        ? InvoiceJobRef.fromJson(json['job'] as Map<String, dynamic>)
        : null,
    quote: json['quote'] != null
        ? InvoiceQuoteRef.fromJson(json['quote'] as Map<String, dynamic>)
        : null,
    items:
        (json['items'] as List<dynamic>?)
            ?.map((i) => InvoiceItem.fromJson(i as Map<String, dynamic>))
            .toList() ??
        const [],
    payments:
        (json['payments'] as List<dynamic>?)
            ?.map((p) => Payment.fromJson(p as Map<String, dynamic>))
            .toList() ??
        const [],
  );
}

class RecordPaymentInput {
  const RecordPaymentInput({
    required this.amountMinor,
    required this.currency,
    required this.method,
    this.reference,
  });

  final int amountMinor;
  final String currency;
  final String method;
  final String? reference;

  Map<String, dynamic> toJson() => {
    'amountMinor': amountMinor,
    'currency': currency.toUpperCase(),
    'method': method,
    if (reference != null && reference!.trim().isNotEmpty)
      'reference': reference!.trim(),
  };
}

class InvoicesRepository {
  InvoicesRepository(this._client);

  final ApiClient _client;

  Future<List<Invoice>> listInvoices({String? status}) async {
    final res = await _client.get(
      '/api/v1/invoices',
      queryParameters: {
        if (status != null && status.isNotEmpty) 'status': status,
      },
    );
    return (res as List<dynamic>)
        .map((i) => Invoice.fromJson(i as Map<String, dynamic>))
        .toList();
  }

  Future<Invoice> getInvoice(String invoiceId) async {
    final res = await _client.get('/api/v1/invoices/$invoiceId');
    return Invoice.fromJson(res as Map<String, dynamic>);
  }

  /// Idempotent server-side — if an invoice already exists for [jobId] it
  /// is returned instead of erroring. Callers don't need to pre-check.
  /// If the job has no approved quote and no parts ($0 total), set
  /// [allowZeroAmount] to true to explicitly confirm a zero-cost invoice.
  Future<Invoice> generateFromJob(
    String jobId, {
    bool? allowZeroAmount,
  }) async {
    final res = await _client.post(
      '/api/v1/invoices/from-job/$jobId',
      body: {
        if (allowZeroAmount != null) 'allowZeroAmount': allowZeroAmount,
      },
    );
    return Invoice.fromJson(res as Map<String, dynamic>);
  }

  Future<Invoice> issueInvoice(String invoiceId) async {
    final res = await _client.post('/api/v1/invoices/$invoiceId/issue');
    return Invoice.fromJson(res as Map<String, dynamic>);
  }

  Future<List<Payment>> listPayments(String invoiceId) async {
    final res = await _client.get('/api/v1/invoices/$invoiceId/payments');
    return (res as List<dynamic>)
        .map((p) => Payment.fromJson(p as Map<String, dynamic>))
        .toList();
  }

  /// Sends a real `Idempotency-Key` HTTP header (server requires it — see
  /// invoice.routes.ts `idempotencyKey()`), not a body field. [idempotencyKey]
  /// is generated by the caller once per distinct payment attempt: reuse the
  /// same key across a pure network retry of the exact same attempt, mint a
  /// fresh one for a genuinely new attempt (e.g. after changing the amount).
  Future<Invoice> recordPayment(
    String invoiceId,
    RecordPaymentInput input,
    String idempotencyKey,
  ) async {
    final res = await _client.post(
      '/api/v1/invoices/$invoiceId/payments',
      body: input.toJson(),
      headers: {'Idempotency-Key': idempotencyKey},
    );
    return Invoice.fromJson(res as Map<String, dynamic>);
  }
}

/// No `uuid` package exists in the project yet (checked pubspec.yaml before
/// writing this) — flagging per rules.md §11 rather than silently adding a
/// dependency for a single call site. A timestamp + random-suffix string is
/// unique enough for a client-generated idempotency key.
String generateIdempotencyKey() {
  final random = Random.secure();
  final suffix = List.generate(
    12,
    (_) => random.nextInt(36).toRadixString(36),
  ).join();
  return 'pay-${DateTime.now().microsecondsSinceEpoch}-$suffix';
}
