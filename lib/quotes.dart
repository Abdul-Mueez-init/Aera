import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

class QuoteLine {
  const QuoteLine({
    required this.description,
    required this.quantity,
    required this.unitPriceMinor,
  });

  final String description;
  final double quantity;
  final int unitPriceMinor;
}

class QuoteDraft {
  const QuoteDraft({
    required this.customer,
    required this.lines,
    required this.discountMinor,
    required this.taxRateBps,
    this.customerId = '',
    this.jobId,
    this.currency = 'USD',
    this.quoteId,
    this.shareToken,
  });

  final String customer;
  final String customerId;
  final String? jobId;
  final String currency;
  final String? quoteId;
  final List<QuoteLine> lines;
  final int discountMinor;
  final int taxRateBps;
  final String? shareToken;

  int get subtotalMinor => lines.fold(
    0,
    (sum, line) => sum + (line.quantity * line.unitPriceMinor).round(),
  );
  int get taxMinor =>
      ((subtotalMinor - discountMinor) * taxRateBps / 10000).round();
  int get totalMinor => subtotalMinor - discountMinor + taxMinor;
}

abstract interface class QuoteApi {
  Future<QuoteDraft> send(QuoteDraft draft);
  Future<QuoteDraft> respond(String token, String action);
}

class HttpQuoteApi implements QuoteApi {
  HttpQuoteApi({required this.baseUrl, required this.accessToken});

  final String baseUrl;
  final String accessToken;

  Map<String, String> get _headers => {
    'Authorization': 'Bearer $accessToken',
    'Content-Type': 'application/json',
  };

  @override
  Future<QuoteDraft> send(QuoteDraft draft) async {
    if (draft.customerId.isEmpty) {
      throw ArgumentError('customerId is required for a live quote');
    }
    final response = await http.post(
      Uri.parse('$baseUrl/api/v1/quotes'),
      headers: _headers,
      body: jsonEncode({
        'customerId': draft.customerId,
        if (draft.jobId != null) 'jobId': draft.jobId,
        'currency': draft.currency,
        'discountMinor': draft.discountMinor,
        'taxRateBps': draft.taxRateBps,
        'items': draft.lines
            .map(
              (line) => {
                'description': line.description,
                'quantity': line.quantity,
                'unitPriceMinor': line.unitPriceMinor,
              },
            )
            .toList(),
      }),
    );
    _check(response);
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    final created = body['data'] as Map<String, dynamic>;
    final quoteId = created['id'] as String;
    final sendResponse = await http.post(
      Uri.parse('$baseUrl/api/v1/quotes/$quoteId/send'),
      headers: _headers,
    );
    _check(sendResponse);
    final sentBody = jsonDecode(sendResponse.body) as Map<String, dynamic>;
    return _fromManagerQuote(sentBody['data'] as Map<String, dynamic>, draft);
  }

  @override
  Future<QuoteDraft> respond(String token, String action) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/v1/quotes/shared/$token/respond'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'action': action}),
    );
    _check(response);
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return _fromPublicQuote(body['data'] as Map<String, dynamic>, token);
  }

  void _check(http.Response response) {
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('Quote request failed (${response.statusCode})');
    }
  }

  QuoteDraft _fromManagerQuote(
    Map<String, dynamic> json,
    QuoteDraft fallback,
  ) => QuoteDraft(
    customer: _customerName(json['customer'] as Map<String, dynamic>),
    customerId: json['customerId'] as String? ?? fallback.customerId,
    jobId: json['jobId'] as String? ?? fallback.jobId,
    currency: json['currency'] as String? ?? fallback.currency,
    quoteId: json['id'] as String? ?? fallback.quoteId,
    lines: _lines(json['items'] as List<dynamic>),
    discountMinor: _int(json['discountMinor']),
    taxRateBps: _int(json['taxRateBps']),
    shareToken: json['shareToken'] as String?,
  );

  QuoteDraft _fromPublicQuote(Map<String, dynamic> json, String token) {
    final customer = json['customer'] as Map<String, dynamic>;
    return QuoteDraft(
      customer: _customerName(customer),
      currency: json['currency'] as String? ?? 'USD',
      quoteId: json['id'] as String?,
      lines: _lines(json['items'] as List<dynamic>),
      discountMinor: _int(json['discountMinor']),
      taxRateBps: _int(json['taxRateBps']),
      shareToken: token,
    );
  }

  List<QuoteLine> _lines(List<dynamic> items) => items.map((item) {
    final line = item as Map<String, dynamic>;
    return QuoteLine(
      description: line['description'] as String,
      quantity: double.parse(line['quantity'].toString()),
      unitPriceMinor: _int(line['unitPriceMinor']),
    );
  }).toList();

  String _customerName(Map<String, dynamic> customer) =>
      '${customer['firstName']} ${customer['lastName']}';

  int _int(Object? value) => int.tryParse(value.toString()) ?? 0;
}

class DemoQuoteApi implements QuoteApi {
  QuoteDraft? _draft;

  @override
  Future<QuoteDraft> send(QuoteDraft draft) async {
    _draft = QuoteDraft(
      customer: draft.customer,
      customerId: draft.customerId,
      jobId: draft.jobId,
      currency: draft.currency,
      quoteId: draft.quoteId,
      lines: draft.lines,
      discountMinor: draft.discountMinor,
      taxRateBps: draft.taxRateBps,
      shareToken: 'aera-demo-quote-1042',
    );
    return _draft!;
  }

  @override
  Future<QuoteDraft> respond(String token, String action) async {
    if (_draft == null || _draft!.shareToken != token) {
      throw StateError('Quote not found');
    }
    return _draft!;
  }
}

class QuoteEditorPage extends StatefulWidget {
  const QuoteEditorPage({
    super.key,
    required this.api,
    this.customerId = '',
    this.jobId,
  });

  final QuoteApi api;
  final String customerId;
  final String? jobId;

  @override
  State<QuoteEditorPage> createState() => _QuoteEditorPageState();
}

class _QuoteEditorPageState extends State<QuoteEditorPage> {
  final _descriptionController = TextEditingController(
    text: 'AC diagnostic and repair',
  );
  final _quantityController = TextEditingController(text: '1');
  final _priceController = TextEditingController(text: '185');
  final _discountController = TextEditingController(text: '0');
  final _taxController = TextEditingController(text: '8.25');
  final _lines = <QuoteLine>[];
  QuoteDraft? _sentQuote;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _addLine();
  }

  @override
  void dispose() {
    _descriptionController.dispose();
    _quantityController.dispose();
    _priceController.dispose();
    _discountController.dispose();
    _taxController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final draft = _draft;
    return Scaffold(
      appBar: AppBar(title: const Text('Create quote')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
        children: [
          Text(
            'Jordan Ellis',
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 4),
          const Text('Job #1042  |  AC not cooling'),
          const SizedBox(height: 24),
          Text('Line items', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 8),
          ..._lines.asMap().entries.map(
            (entry) => _LineRow(
              line: entry.value,
              onRemove: _lines.length == 1
                  ? null
                  : () => setState(() => _lines.removeAt(entry.key)),
            ),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: _addLine,
            icon: const Icon(Icons.add),
            label: const Text('Add line item'),
          ),
          const SizedBox(height: 20),
          TextField(
            controller: _discountController,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'Discount (USD)',
              prefixText: '\$ ',
              border: OutlineInputBorder(),
            ),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _taxController,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              labelText: 'Tax rate',
              suffixText: '%',
              border: OutlineInputBorder(),
            ),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 20),
          _Totals(draft: draft),
          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: _busy ? null : _send,
            icon: const Icon(Icons.send_outlined),
            label: const Text('Send quote'),
          ),
          if (_sentQuote?.shareToken != null) ...[
            const SizedBox(height: 16),
            Card(
              elevation: 0,
              child: Column(
                children: [
                  ListTile(
                    leading: const Icon(Icons.link),
                    title: const Text('Quote ready to share'),
                    subtitle: Text(_sentQuote!.shareToken!),
                  ),
                  SizedBox(
                    width: double.infinity,
                    child: TextButton(
                      onPressed: _previewApproval,
                      child: const Text('Preview customer view'),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  QuoteDraft get _draft => QuoteDraft(
    customer: 'Jordan Ellis',
    customerId: widget.customerId,
    jobId: widget.jobId,
    currency: 'USD',
    lines: _lines,
    discountMinor: ((double.tryParse(_discountController.text) ?? 0) * 100)
        .round(),
    taxRateBps: ((double.tryParse(_taxController.text) ?? 0) * 100).round(),
  );

  void _addLine() {
    setState(
      () => _lines.add(
        QuoteLine(
          description: _descriptionController.text,
          quantity: double.tryParse(_quantityController.text) ?? 1,
          unitPriceMinor: ((double.tryParse(_priceController.text) ?? 0) * 100)
              .round(),
        ),
      ),
    );
  }

  Future<void> _send() async {
    setState(() => _busy = true);
    try {
      final sent = await widget.api.send(_draft);
      if (mounted) setState(() => _sentQuote = sent);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _previewApproval() async {
    final quote = _sentQuote!;
    if (!mounted) return;
    await Navigator.of(context).push<void>(
      MaterialPageRoute<void>(
        builder: (_) => CustomerQuotePage(quote: quote, api: widget.api),
      ),
    );
  }
}

class _LineRow extends StatelessWidget {
  const _LineRow({required this.line, required this.onRemove});

  final QuoteLine line;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) => Card(
    elevation: 0,
    child: ListTile(
      title: Text(line.description),
      subtitle: Text(
        '${line.quantity}  x  \$${(line.unitPriceMinor / 100).toStringAsFixed(2)}',
      ),
      trailing: IconButton(
        onPressed: onRemove,
        tooltip: 'Remove line',
        icon: const Icon(Icons.delete_outline),
      ),
    ),
  );
}

class _Totals extends StatelessWidget {
  const _Totals({required this.draft});

  final QuoteDraft draft;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      _TotalRow(label: 'Subtotal', value: draft.subtotalMinor),
      _TotalRow(label: 'Discount', value: -draft.discountMinor),
      _TotalRow(label: 'Tax', value: draft.taxMinor),
      const Divider(),
      _TotalRow(label: 'Total', value: draft.totalMinor, strong: true),
    ],
  );
}

class _TotalRow extends StatelessWidget {
  const _TotalRow({
    required this.label,
    required this.value,
    this.strong = false,
  });

  final String label;
  final int value;
  final bool strong;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: strong ? Theme.of(context).textTheme.titleMedium : null,
        ),
        Text(
          '\$${(value / 100).toStringAsFixed(2)}',
          style: strong ? Theme.of(context).textTheme.titleMedium : null,
        ),
      ],
    ),
  );
}

class CustomerQuotePage extends StatefulWidget {
  const CustomerQuotePage({super.key, required this.quote, required this.api});

  final QuoteDraft quote;
  final QuoteApi api;

  @override
  State<CustomerQuotePage> createState() => _CustomerQuotePageState();
}

class _CustomerQuotePageState extends State<CustomerQuotePage> {
  String? _decision;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Review quote')),
    body: ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      children: [
        Text('Aera HVAC', style: Theme.of(context).textTheme.labelLarge),
        const SizedBox(height: 8),
        Text(
          'Your service quote',
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        const SizedBox(height: 20),
        ...widget.quote.lines.map(
          (line) => ListTile(
            title: Text(line.description),
            trailing: Text(
              '\$${(line.quantity * line.unitPriceMinor / 100).toStringAsFixed(2)}',
            ),
          ),
        ),
        const Divider(),
        _TotalRow(label: 'Total', value: widget.quote.totalMinor, strong: true),
        const SizedBox(height: 24),
        if (_decision != null)
          const Card(
            elevation: 0,
            child: ListTile(
              leading: Icon(Icons.check_circle_outline),
              title: Text('Quote response recorded'),
              subtitle: Text('The service team has been notified.'),
            ),
          )
        else ...[
          FilledButton.icon(
            onPressed: () => _respond('APPROVED'),
            icon: const Icon(Icons.check),
            label: const Text('Approve quote'),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () => _respond('DECLINED'),
            icon: const Icon(Icons.close),
            label: const Text('Decline quote'),
          ),
        ],
      ],
    ),
  );

  Future<void> _respond(String action) async {
    await widget.api.respond(widget.quote.shareToken!, action);
    if (mounted) setState(() => _decision = action);
  }
}
