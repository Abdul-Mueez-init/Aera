import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

class InvoiceSummary {
  const InvoiceSummary({
    required this.id,
    required this.invoiceNumber,
    required this.customer,
    required this.status,
    required this.totalMinor,
    required this.amountPaidMinor,
    required this.balanceDueMinor,
    required this.currency,
    this.items = const [],
  });

  final String id;
  final String invoiceNumber;
  final String customer;
  final String status;
  final int totalMinor;
  final int amountPaidMinor;
  final int balanceDueMinor;
  final String currency;
  final List<InvoiceLine> items;

  InvoiceSummary copyWith({
    String? status,
    int? amountPaidMinor,
    int? balanceDueMinor,
  }) => InvoiceSummary(
    id: id,
    invoiceNumber: invoiceNumber,
    customer: customer,
    status: status ?? this.status,
    totalMinor: totalMinor,
    amountPaidMinor: amountPaidMinor ?? this.amountPaidMinor,
    balanceDueMinor: balanceDueMinor ?? this.balanceDueMinor,
    currency: currency,
    items: items,
  );
}

class InvoiceLine {
  const InvoiceLine({
    required this.description,
    required this.quantity,
    required this.totalMinor,
  });

  final String description;
  final double quantity;
  final int totalMinor;
}

abstract interface class InvoiceApi {
  Future<List<InvoiceSummary>> list();
  Future<InvoiceSummary> issue(String invoiceId);
  Future<InvoiceSummary> recordPayment(String invoiceId, int amountMinor);
}

class HttpInvoiceApi implements InvoiceApi {
  HttpInvoiceApi({required this.baseUrl, required this.accessToken});

  final String baseUrl;
  final String accessToken;

  Map<String, String> get _headers => {
    'Authorization': 'Bearer $accessToken',
    'Content-Type': 'application/json',
  };

  @override
  Future<List<InvoiceSummary>> list() async {
    final response = await http.get(
      Uri.parse('$baseUrl/api/v1/invoices'),
      headers: _headers,
    );
    _check(response);
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return (body['data'] as List<dynamic>)
        .map((item) => _fromJson(item as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<InvoiceSummary> issue(String invoiceId) async {
    return _command(invoiceId, 'issue', {});
  }

  @override
  Future<InvoiceSummary> recordPayment(
    String invoiceId,
    int amountMinor,
  ) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/v1/invoices/$invoiceId/payments'),
      headers: {
        ..._headers,
        'Idempotency-Key': 'flutter-${DateTime.now().microsecondsSinceEpoch}',
      },
      body: jsonEncode({
        'amountMinor': amountMinor,
        'currency': 'USD',
        'method': 'CARD',
      }),
    );
    _check(response);
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return _fromJson(body['data'] as Map<String, dynamic>);
  }

  Future<InvoiceSummary> _command(
    String invoiceId,
    String command,
    Map<String, dynamic> payload,
  ) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/v1/invoices/$invoiceId/$command'),
      headers: _headers,
      body: jsonEncode(payload),
    );
    _check(response);
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return _fromJson(body['data'] as Map<String, dynamic>);
  }

  void _check(http.Response response) {
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('Invoice request failed (${response.statusCode})');
    }
  }

  InvoiceSummary _fromJson(Map<String, dynamic> json) {
    final customer = json['customer'] as Map<String, dynamic>;
    return InvoiceSummary(
      id: json['id'] as String,
      invoiceNumber: json['invoiceNumber'] as String,
      customer: '${customer['firstName']} ${customer['lastName']}',
      status: json['status'] as String,
      totalMinor: _int(json['totalMinor']),
      amountPaidMinor: _int(json['amountPaidMinor']),
      balanceDueMinor: _int(json['balanceDueMinor']),
      currency: json['currency'] as String,
      items: ((json['items'] as List<dynamic>?) ?? const []).map((item) {
        final line = item as Map<String, dynamic>;
        return InvoiceLine(
          description: line['description'] as String,
          quantity: double.parse(line['quantity'].toString()),
          totalMinor: _int(line['totalMinor']),
        );
      }).toList(),
    );
  }

  int _int(Object? value) => int.tryParse(value.toString()) ?? 0;
}

class DemoInvoiceApi implements InvoiceApi {
  var _invoice = const InvoiceSummary(
    id: 'invoice-1',
    invoiceNumber: 'INV-000001',
    customer: 'Jordan Ellis',
    status: 'DRAFT',
    totalMinor: 20025,
    amountPaidMinor: 0,
    balanceDueMinor: 20025,
    currency: 'USD',
    items: [
      InvoiceLine(
        description: 'AC diagnostic and repair',
        quantity: 1,
        totalMinor: 20025,
      ),
    ],
  );

  @override
  Future<List<InvoiceSummary>> list() async => [_invoice];

  @override
  Future<InvoiceSummary> issue(String invoiceId) async {
    _invoice = _invoice.copyWith(status: 'ISSUED');
    return _invoice;
  }

  @override
  Future<InvoiceSummary> recordPayment(
    String invoiceId,
    int amountMinor,
  ) async {
    final paid = _invoice.amountPaidMinor + amountMinor;
    _invoice = _invoice.copyWith(
      status: paid >= _invoice.totalMinor ? 'PAID' : 'PARTIALLY_PAID',
      amountPaidMinor: paid,
      balanceDueMinor: (_invoice.totalMinor - paid).clamp(
        0,
        _invoice.totalMinor,
      ),
    );
    return _invoice;
  }
}

class InvoicePage extends StatefulWidget {
  const InvoicePage({super.key, required this.api});

  final InvoiceApi api;

  @override
  State<InvoicePage> createState() => _InvoicePageState();
}

class _InvoicePageState extends State<InvoicePage> {
  late Future<List<InvoiceSummary>> _invoices;

  @override
  void initState() {
    super.initState();
    _invoices = widget.api.list();
  }

  void _refresh() {
    setState(() {
      _invoices = widget.api.list();
    });
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Invoices'),
      actions: [
        IconButton(
          onPressed: _refresh,
          tooltip: 'Refresh invoices',
          icon: const Icon(Icons.refresh),
        ),
      ],
    ),
    body: FutureBuilder<List<InvoiceSummary>>(
      future: _invoices,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return const Center(child: Text('Could not load invoices'));
        }
        final invoices = snapshot.data ?? const <InvoiceSummary>[];
        if (invoices.isEmpty) {
          return const Center(child: Text('No invoices yet'));
        }
        return ListView.separated(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
          itemCount: invoices.length,
          separatorBuilder: (context, index) => const SizedBox(height: 12),
          itemBuilder: (context, index) => _InvoiceCard(
            invoice: invoices[index],
            api: widget.api,
            onChanged: _refresh,
          ),
        );
      },
    ),
  );
}

class _InvoiceCard extends StatelessWidget {
  const _InvoiceCard({
    required this.invoice,
    required this.api,
    required this.onChanged,
  });

  final InvoiceSummary invoice;
  final InvoiceApi api;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) => Card(
    elevation: 0,
    child: Padding(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                invoice.invoiceNumber,
                style: Theme.of(context).textTheme.labelLarge,
              ),
              Chip(label: Text(invoice.status.replaceAll('_', ' '))),
            ],
          ),
          const SizedBox(height: 8),
          Text(invoice.customer, style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          Text('Total  ${_money(invoice.totalMinor)}'),
          Text(
            'Balance due  ${_money(invoice.balanceDueMinor)}',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 16),
          if (invoice.status == 'DRAFT')
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: () async {
                  await api.issue(invoice.id);
                  onChanged();
                },
                icon: const Icon(Icons.send_outlined),
                label: const Text('Issue invoice'),
              ),
            ),
          if (invoice.status == 'ISSUED' || invoice.status == 'PARTIALLY_PAID')
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () => _recordPayment(context),
                icon: const Icon(Icons.payments_outlined),
                label: const Text('Record payment'),
              ),
            ),
        ],
      ),
    ),
  );

  Future<void> _recordPayment(BuildContext context) async {
    final amountController = TextEditingController(
      text: (invoice.balanceDueMinor / 100).toStringAsFixed(2),
    );
    final amount = await showDialog<int>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Record payment'),
        content: TextField(
          controller: amountController,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(
            labelText: 'Amount',
            prefixText: '\$ ',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(
              context,
              ((double.tryParse(amountController.text) ?? 0) * 100).round(),
            ),
            child: const Text('Record'),
          ),
        ],
      ),
    );
    amountController.dispose();
    if (amount == null || amount <= 0) return;
    await api.recordPayment(invoice.id, amount);
    onChanged();
  }
}

String _money(int minor) => '\$${(minor / 100).toStringAsFixed(2)}';
