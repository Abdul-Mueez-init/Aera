import 'package:aera/features/jobs/data/jobs_repository.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('JobInvoiceSummary.fromJson', () {
    test('technician shape (no financial fields) stays null, never 0/USD', () {
      // job.service.ts deliberately selects only id/invoiceNumber/status/
      // createdAt for TECHNICIAN.
      final summary = JobInvoiceSummary.fromJson({
        'id': 'inv-1',
        'invoiceNumber': 'INV-1001',
        'status': 'ISSUED',
        'createdAt': '2026-10-25T09:00:00.000Z',
      });

      expect(summary.invoiceNumber, 'INV-1001');
      expect(summary.status, 'ISSUED');
      expect(summary.totalMinor, isNull);
      expect(summary.balanceDueMinor, isNull);
      expect(summary.currency, isNull);
    });

    test('office shape parses real amounts and currency', () {
      final summary = JobInvoiceSummary.fromJson({
        'id': 'inv-1',
        'invoiceNumber': 'INV-1001',
        'status': 'PARTIALLY_PAID',
        'totalMinor': '25000',
        'balanceDueMinor': '10000',
        'currency': 'PKR',
      });

      expect(summary.totalMinor, 25000);
      expect(summary.balanceDueMinor, 10000);
      expect(summary.currency, 'PKR');
    });
  });

  group('Job.fromJson timestamps', () {
    test('scheduled instants are converted to local time at parse', () {
      final job = Job.fromJson({
        'id': 'job-1',
        'jobNumber': 42,
        'serviceType': 'AC Repair',
        'problemDescription': 'Not cooling',
        'priority': 'NORMAL',
        'status': 'SCHEDULED',
        'scheduledStart': '2026-10-25T09:00:00.000Z',
        'scheduledEnd': '2026-10-25T10:00:00.000Z',
        'createdAt': '2026-10-25T08:00:00.000Z',
        'updatedAt': '2026-10-25T08:00:00.000Z',
        'customer': {'id': 'c1', 'firstName': 'A', 'lastName': 'B'},
        'serviceAddress': {
          'id': 'a1',
          'label': 'Home',
          'line1': '1 Main St',
          'city': 'Austin',
          'countryCode': 'US',
        },
      });

      // Same instant, but a local DateTime so DateFormat renders local
      // wall-clock time instead of UTC fields.
      expect(job.scheduledStart!.isUtc, isFalse);
      expect(
        job.scheduledStart!.millisecondsSinceEpoch,
        DateTime.utc(2026, 10, 25, 9).millisecondsSinceEpoch,
      );
      expect(job.scheduledEnd!.isUtc, isFalse);
      expect(job.createdAt.isUtc, isFalse);
    });
  });
}
