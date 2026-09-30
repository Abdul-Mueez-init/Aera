import 'package:flutter_test/flutter_test.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'package:aera/core/observability/sentry_bootstrap.dart';

void main() {
  group('redactUrl', () {
    test('redacts portal and quote-approval capability tokens', () {
      expect(
        redactUrl('https://api.aera.app/portal/abc123XYZ'),
        'https://api.aera.app/portal/[redacted]',
      );
      expect(
        redactUrl('/portal/abc123XYZ/reviews?page=1'),
        '/portal/[redacted]/reviews?page=1',
      );
      expect(
        redactUrl('/quote-approval/tok_9/respond'),
        '/quote-approval/[redacted]/respond',
      );
    });

    test('redacts invoice-payment and technician-tracking tokens', () {
      expect(
        redactUrl('/invoice-payment/secret-token/INV-123'),
        '/invoice-payment/[redacted]/INV-123',
      );
      expect(
        redactUrl('/technician-tracking/token123/JOB-456'),
        '/technician-tracking/[redacted]/JOB-456',
      );
    });

    test('redacts backend API portal and shared-quote tokens', () {
      expect(
        redactUrl('https://api.aera.app/api/v1/portal/abc123XYZ'),
        'https://api.aera.app/api/v1/portal/[redacted]',
      );
      expect(
        redactUrl('/api/v1/portal/abc123XYZ/reviews?page=1'),
        '/api/v1/portal/[redacted]/reviews?page=1',
      );
      expect(
        redactUrl('/api/v1/quotes/shared/tok_9/respond'),
        '/api/v1/quotes/shared/[redacted]/respond',
      );
    });

    test('redacts secret query parameters and leaves normal URLs alone', () {
      expect(
        redactUrl('/x?key=SECRET&page=2'),
        '/x?key=[redacted]&page=2',
      );
      expect(
        redactUrl('/api/v1/jobs?page=1'),
        '/api/v1/jobs?page=1',
      );
      expect(
        redactUrl('/x?token=abc&api_key=xyz'),
        '/x?token=[redacted]&api_key=[redacted]',
      );
    });

    test('handles empty and null-like URLs', () {
      expect(redactUrl(''), '');
      expect(redactUrl('/simple-path'), '/simple-path');
    });
  });

  group('beforeSend', () {
    test('scrubs sensitive data from events', () {
      final event = SentryEvent(
        request: SentryRequest(
          url: 'https://api.aera.app/portal/secret-token',
          queryString: 'token=abc&page=1',
        ),
        breadcrumbs: [
          Breadcrumb(
            category: 'http',
            data: {'url': 'https://api.aera.app/portal/secret-token'},
          ),
        ],
        user: SentryUser(id: 'user-1', email: 'test@example.com'),
      );

      final scrubbed = beforeSend(event, null);

      expect(scrubbed?.request?.url, 'https://api.aera.app/portal/[redacted]');
      expect(scrubbed?.request?.queryString, 'token=[redacted]&page=1');
      expect(scrubbed?.breadcrumbs?[0].data?['url'], 'https://api.aera.app/portal/[redacted]');
      // User should only have id, email should be removed
      expect(scrubbed?.user?.id, 'user-1');
      expect(scrubbed?.user?.email, null);
    });

    test('handles events with no request or user', () {
      final event = SentryEvent(message: SentryMessage('hi'));
      final scrubbed = beforeSend(event, null);
      expect(scrubbed?.message?.formatted, 'hi');
    });
  });
}
