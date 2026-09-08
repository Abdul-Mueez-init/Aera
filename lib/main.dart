import 'package:flutter/material.dart';

import 'technician_execution.dart';
import 'quotes.dart';
import 'invoices.dart';
import 'customer_portal.dart';

void main() {
  runApp(const AeraApp());
}

class AeraApp extends StatelessWidget {
  const AeraApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Aera',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF1E5A58),
          surface: Colors.white,
        ),
        scaffoldBackgroundColor: const Color(0xFFF6F5F1),
        useMaterial3: true,
      ),
      home: const AeraHomePage(),
    );
  }
}

class AeraHomePage extends StatelessWidget {
  const AeraHomePage({super.key});

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        title: const Text('Good morning, Maya'),
        actions: [
          IconButton(
            onPressed: () {},
            tooltip: 'Notifications',
            icon: const Icon(Icons.notifications_none_outlined),
          ),
          IconButton(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => QuoteEditorPage(api: DemoQuoteApi()),
                ),
              );
            },
            tooltip: 'Quotes',
            icon: const Icon(Icons.request_quote_outlined),
          ),
          IconButton(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => InvoicePage(api: DemoInvoiceApi()),
                ),
              );
            },
            tooltip: 'Invoices',
            icon: const Icon(Icons.receipt_long_outlined),
          ),
          IconButton(
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) =>
                      CustomerPortalPage(api: DemoCustomerPortalApi()),
                ),
              );
            },
            tooltip: 'Customer portal',
            icon: const Icon(Icons.person_pin_outlined),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
        children: [
          Text(
            'Wednesday, September 9',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(height: 24),
          Text(
            'Today at a glance',
            style: Theme.of(
              context,
            ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _MetricCard(
                  label: 'Jobs today',
                  value: '08',
                  icon: Icons.calendar_today_outlined,
                  color: colorScheme.primary,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _MetricCard(
                  label: 'Collected',
                  value: '\$2,480',
                  icon: Icons.trending_up,
                  color: const Color(0xFF2F7D5A),
                ),
              ),
            ],
          ),
          const SizedBox(height: 28),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Next up',
                style: Theme.of(
                  context,
                ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
              ),
              TextButton(onPressed: () {}, child: const Text('View schedule')),
            ],
          ),
          const SizedBox(height: 8),
          const _JobCard(
            time: '09:30 AM',
            customer: 'Jordan Ellis',
            issue: 'AC not cooling',
            technician: 'Alex Morgan',
            status: 'Scheduled',
          ),
          const SizedBox(height: 12),
          const _JobCard(
            time: '11:45 AM',
            customer: 'Northline Bakery',
            issue: 'Preventive maintenance',
            technician: 'Sam Rivera',
            status: 'Assigned',
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: 0,
        onDestinationSelected: (index) {
          if (index == 1) {
            Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) =>
                    TechnicianTodayPage(api: DemoTechnicianExecutionApi()),
              ),
            );
          }
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard),
            label: 'Overview',
          ),
          NavigationDestination(
            icon: Icon(Icons.assignment_outlined),
            selectedIcon: Icon(Icons.assignment),
            label: 'Jobs',
          ),
          NavigationDestination(
            icon: Icon(Icons.people_outline),
            selectedIcon: Icon(Icons.people),
            label: 'Customers',
          ),
        ],
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });

  final String label;
  final String value;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color),
            const SizedBox(height: 20),
            Text(value, style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 4),
            Text(label, style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ),
    );
  }
}

class _JobCard extends StatelessWidget {
  const _JobCard({
    required this.time,
    required this.customer,
    required this.issue,
    required this.technician,
    required this.status,
  });

  final String time;
  final String customer;
  final String issue;
  final String technician;
  final String status;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(time, style: Theme.of(context).textTheme.labelLarge),
                Chip(label: Text(status)),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              customer,
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 4),
            Text(issue),
            const SizedBox(height: 12),
            Row(
              children: [
                const Icon(Icons.person_outline, size: 18),
                const SizedBox(width: 6),
                Text(technician),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
