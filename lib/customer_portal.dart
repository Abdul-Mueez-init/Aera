import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

class PortalAppointment {
  const PortalAppointment({
    required this.jobNumber,
    required this.serviceType,
    required this.status,
    this.jobId,
    this.scheduledStart,
    this.address,
    this.technician,
    this.reviewSubmitted = false,
  });
  final int jobNumber;
  final String serviceType;
  final String status;
  final String? jobId;
  final DateTime? scheduledStart;
  final String? address;
  final String? technician;
  final bool reviewSubmitted;
}

class PortalQuote {
  const PortalQuote({
    required this.id,
    required this.status,
    required this.totalMinor,
    required this.currency,
    required this.shareToken,
  });
  final String id;
  final String status;
  final int totalMinor;
  final String currency;
  final String? shareToken;
}

class PortalInvoice {
  const PortalInvoice({
    required this.invoiceNumber,
    required this.status,
    required this.totalMinor,
    required this.balanceDueMinor,
    required this.currency,
  });
  final String invoiceNumber;
  final String status;
  final int totalMinor;
  final int balanceDueMinor;
  final String currency;
}

class PortalSnapshot {
  const PortalSnapshot({
    required this.firstName,
    required this.lastName,
    required this.appointments,
    required this.quotes,
    required this.invoices,
    required this.history,
  });
  final String firstName;
  final String lastName;
  final List<PortalAppointment> appointments;
  final List<PortalQuote> quotes;
  final List<PortalInvoice> invoices;
  final List<PortalAppointment> history;
}

abstract interface class CustomerPortalApi {
  Future<PortalSnapshot> load();
  Future<void> respondToQuote(String shareToken, String action);
  Future<void> submitReview(String jobId, int rating, String comment);
}

class HttpCustomerPortalApi implements CustomerPortalApi {
  HttpCustomerPortalApi({required this.baseUrl, required this.portalToken});
  final String baseUrl;
  final String portalToken;

  @override
  Future<PortalSnapshot> load() async {
    final response = await http.get(
      Uri.parse('$baseUrl/api/v1/portal/$portalToken'),
    );
    _check(response);
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return _fromJson(body['data'] as Map<String, dynamic>);
  }

  @override
  Future<void> respondToQuote(String shareToken, String action) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/v1/quotes/shared/$shareToken/respond'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'action': action}),
    );
    _check(response);
  }

  @override
  Future<void> submitReview(String jobId, int rating, String comment) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/v1/portal/$portalToken/reviews'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'jobId': jobId, 'rating': rating, 'comment': comment}),
    );
    _check(response);
  }

  void _check(http.Response response) {
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
        'Customer portal request failed (${response.statusCode})',
      );
    }
  }

  PortalSnapshot _fromJson(Map<String, dynamic> json) {
    final jobs = (json['jobs'] as List<dynamic>)
        .map(_appointmentFromJson)
        .toList();
    return PortalSnapshot(
      firstName: json['firstName'] as String,
      lastName: json['lastName'] as String,
      appointments: jobs.where((job) => job.status != 'COMPLETED').toList(),
      quotes: (json['quotes'] as List<dynamic>).map(_quoteFromJson).toList(),
      invoices: (json['invoices'] as List<dynamic>)
          .map(_invoiceFromJson)
          .toList(),
      history: jobs.where((job) => job.status == 'COMPLETED').toList(),
    );
  }

  PortalAppointment _appointmentFromJson(dynamic value) {
    final json = value as Map<String, dynamic>;
    final address = json['serviceAddress'] as Map<String, dynamic>?;
    final technician = json['assignedTechnician'] as Map<String, dynamic>?;
    return PortalAppointment(
      jobNumber: json['jobNumber'] as int,
      serviceType: json['serviceType'] as String,
      status: json['status'] as String,
      jobId: json['id'] as String?,
      scheduledStart: DateTime.tryParse(
        json['scheduledStart'] as String? ?? '',
      ),
      address: address == null
          ? null
          : '${address['line1']}, ${address['city']}',
      technician: technician == null
          ? null
          : '${technician['firstName']} ${technician['lastName']}',
      reviewSubmitted:
          ((json['reviews'] as List<dynamic>?) ?? const []).isNotEmpty,
    );
  }

  PortalQuote _quoteFromJson(dynamic value) {
    final json = value as Map<String, dynamic>;
    return PortalQuote(
      id: json['id'] as String,
      status: json['status'] as String,
      totalMinor: _int(json['totalMinor']),
      currency: json['currency'] as String,
      shareToken: json['shareToken'] as String?,
    );
  }

  PortalInvoice _invoiceFromJson(dynamic value) {
    final json = value as Map<String, dynamic>;
    return PortalInvoice(
      invoiceNumber: json['invoiceNumber'] as String,
      status: json['status'] as String,
      totalMinor: _int(json['totalMinor']),
      balanceDueMinor: _int(json['balanceDueMinor']),
      currency: json['currency'] as String,
    );
  }

  int _int(Object? value) => int.tryParse(value.toString()) ?? 0;
}

class DemoCustomerPortalApi implements CustomerPortalApi {
  var _quoteStatus = 'SENT';

  @override
  Future<PortalSnapshot> load() async => PortalSnapshot(
    firstName: 'Jordan',
    lastName: 'Ellis',
    appointments: [
      PortalAppointment(
        jobNumber: 1042,
        serviceType: 'AC repair',
        status: 'SCHEDULED',
        scheduledStart: DateTime(2026, 9, 9, 9, 30),
        address: '18 Willow Street, Austin',
        technician: 'Alex Morgan',
      ),
    ],
    quotes: [
      PortalQuote(
        id: 'quote-1',
        status: _quoteStatus,
        totalMinor: 20025,
        currency: 'USD',
        shareToken: 'aera-demo-quote-1042',
      ),
    ],
    invoices: const [
      PortalInvoice(
        invoiceNumber: 'INV-000001',
        status: 'ISSUED',
        totalMinor: 20025,
        balanceDueMinor: 20025,
        currency: 'USD',
      ),
    ],
    history: const [
      PortalAppointment(
        jobNumber: 1008,
        serviceType: 'Filter replacement',
        status: 'COMPLETED',
      ),
    ],
  );

  @override
  Future<void> respondToQuote(String shareToken, String action) async {
    _quoteStatus = action;
  }

  @override
  Future<void> submitReview(String jobId, int rating, String comment) async {}
}

class CustomerPortalPage extends StatefulWidget {
  const CustomerPortalPage({super.key, required this.api});
  final CustomerPortalApi api;
  @override
  State<CustomerPortalPage> createState() => _CustomerPortalPageState();
}

class _CustomerPortalPageState extends State<CustomerPortalPage> {
  late Future<PortalSnapshot> _snapshot;
  @override
  void initState() {
    super.initState();
    _snapshot = widget.api.load();
  }

  void _refresh() {
    setState(() {
      _snapshot = widget.api.load();
    });
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Your service'),
      actions: [
        IconButton(
          onPressed: _refresh,
          tooltip: 'Refresh',
          icon: const Icon(Icons.refresh),
        ),
      ],
    ),
    body: FutureBuilder<PortalSnapshot>(
      future: _snapshot,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: CircularProgressIndicator());
        }
        if (snapshot.hasError) {
          return const Center(
            child: Text('This portal link is no longer available'),
          );
        }
        return _PortalContent(
          snapshot: snapshot.data!,
          api: widget.api,
          onChanged: _refresh,
        );
      },
    ),
  );
}

class _PortalContent extends StatelessWidget {
  const _PortalContent({
    required this.snapshot,
    required this.api,
    required this.onChanged,
  });
  final PortalSnapshot snapshot;
  final CustomerPortalApi api;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
    children: [
      Text(
        'Hi, ${snapshot.firstName}',
        style: Theme.of(context).textTheme.headlineSmall,
      ),
      const SizedBox(height: 4),
      const Text('Everything about your service in one place.'),
      const SizedBox(height: 24),
      _Section(
        title: 'Next appointment',
        child: snapshot.appointments.isEmpty
            ? const Text('No upcoming appointments')
            : _AppointmentCard(appointment: snapshot.appointments.first),
      ),
      const SizedBox(height: 20),
      _Section(
        title: 'Quotes',
        child: Column(
          children: snapshot.quotes
              .map(
                (quote) =>
                    _QuoteCard(quote: quote, api: api, onChanged: onChanged),
              )
              .toList(),
        ),
      ),
      const SizedBox(height: 20),
      _Section(
        title: 'Invoices',
        child: Column(
          children: snapshot.invoices
              .map((invoice) => _InvoiceCard(invoice: invoice))
              .toList(),
        ),
      ),
      const SizedBox(height: 20),
      _Section(
        title: 'Service history',
        child: Column(
          children: snapshot.history
              .map(
                (item) =>
                    _HistoryCard(item: item, api: api, onChanged: onChanged),
              )
              .toList(),
        ),
      ),
    ],
  );
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child});
  final String title;
  final Widget child;
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(title, style: Theme.of(context).textTheme.titleLarge),
      const SizedBox(height: 8),
      child,
    ],
  );
}

class _AppointmentCard extends StatelessWidget {
  const _AppointmentCard({required this.appointment});
  final PortalAppointment appointment;
  @override
  Widget build(BuildContext context) => Card(
    elevation: 0,
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            appointment.serviceType,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          Text('${appointment.scheduledStart ?? ''}'),
          if (appointment.address != null) Text(appointment.address!),
          if (appointment.technician != null)
            Text('Technician: ${appointment.technician}'),
        ],
      ),
    ),
  );
}

class _QuoteCard extends StatelessWidget {
  const _QuoteCard({
    required this.quote,
    required this.api,
    required this.onChanged,
  });
  final PortalQuote quote;
  final CustomerPortalApi api;
  final VoidCallback onChanged;
  @override
  Widget build(BuildContext context) => Card(
    elevation: 0,
    child: ListTile(
      title: Text('Quote ${_money(quote.totalMinor)}'),
      subtitle: Text(quote.status),
      trailing: quote.status == 'SENT'
          ? TextButton(
              onPressed: () => _respond('APPROVED'),
              child: const Text('Approve'),
            )
          : null,
    ),
  );
  Future<void> _respond(String action) async {
    await api.respondToQuote(quote.shareToken!, action);
    onChanged();
  }
}

class _InvoiceCard extends StatelessWidget {
  const _InvoiceCard({required this.invoice});
  final PortalInvoice invoice;
  @override
  Widget build(BuildContext context) => Card(
    elevation: 0,
    child: ListTile(
      title: Text(invoice.invoiceNumber),
      subtitle: Text(invoice.status),
      trailing: Text('Due ${_money(invoice.balanceDueMinor)}'),
    ),
  );
}

class _HistoryCard extends StatelessWidget {
  const _HistoryCard({
    required this.item,
    required this.api,
    required this.onChanged,
  });

  final PortalAppointment item;
  final CustomerPortalApi api;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) => Card(
    elevation: 0,
    child: ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16),
      leading: const Icon(Icons.history),
      title: Text(item.serviceType),
      subtitle: Text('Job #${item.jobNumber}  |  Completed'),
      trailing: item.reviewSubmitted
          ? const Icon(Icons.star, color: Colors.amber)
          : TextButton(
              onPressed: item.jobId == null ? null : () => _review(context),
              child: const Text('Review'),
            ),
    ),
  );

  Future<void> _review(BuildContext context) async {
    var rating = 5;
    final commentController = TextEditingController();
    final result = await showDialog<(int, String)>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          title: const Text('How was your service?'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<int>(
                value: rating,
                decoration: const InputDecoration(labelText: 'Rating'),
                items: [1, 2, 3, 4, 5]
                    .map(
                      (value) => DropdownMenuItem(
                        value: value,
                        child: Text('$value stars'),
                      ),
                    )
                    .toList(),
                onChanged: (value) => setDialogState(() => rating = value ?? 5),
              ),
              TextField(
                controller: commentController,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'Comment (optional)',
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(context, (
                rating,
                commentController.text.trim(),
              )),
              child: const Text('Submit review'),
            ),
          ],
        ),
      ),
    );
    commentController.dispose();
    if (result == null || item.jobId == null) return;
    await api.submitReview(item.jobId!, result.$1, result.$2);
    onChanged();
  }
}

String _money(int minor) => '\$${(minor / 100).toStringAsFixed(2)}';
