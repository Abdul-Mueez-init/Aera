import 'package:aera/core/network/sentry_scrub.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

void main() {
  group('scrubUrlFragment', () {
    test('strips a portal token fragment', () {
      expect(
        scrubUrlFragment('https://portal.quantixlabs.live/open#t=abc123'),
        'https://portal.quantixlabs.live/open',
      );
    });

    test('keeps the query string, drops only the fragment', () {
      expect(
        scrubUrlFragment('https://portal.quantixlabs.live/p?x=1#t=abc'),
        'https://portal.quantixlabs.live/p?x=1',
      );
    });

    test('leaves fragment-free strings unchanged', () {
      expect(scrubUrlFragment('/p/closed'), '/p/closed');
      expect(scrubUrlFragment(''), '');
    });
  });

  group('scrubSentryEvent', () {
    test('defragments the request URL and clears the fragment field', () {
      final event = SentryEvent(
        request: SentryRequest(
          url: 'https://portal.quantixlabs.live/open#t=secret-token',
          fragment: 't=secret-token',
          method: 'GET',
        ),
      );
      final scrubbed = scrubSentryEvent(event);
      expect(scrubbed.request?.url, 'https://portal.quantixlabs.live/open');
      expect(scrubbed.request?.fragment, isNull);
      expect(scrubbed.request?.method, 'GET');
    });

    test('scrubs breadcrumbs attached to the event', () {
      final event = SentryEvent(
        breadcrumbs: [
          Breadcrumb(
            message: 'Navigated to /open#t=secret-token',
            category: 'navigation',
          ),
        ],
      );
      final scrubbed = scrubSentryEvent(event);
      expect(scrubbed.breadcrumbs?.single.message, 'Navigated to /open');
    });

    test('passes through events without request or breadcrumbs', () {
      final event = SentryEvent();
      expect(scrubSentryEvent(event), same(event));
    });
  });

  group('scrubSentryBreadcrumb', () {
    test('scrubs message and string data values only', () {
      final crumb = Breadcrumb(
        message: 'http.client GET https://portal.quantixlabs.live/open#t=x',
        data: <String, dynamic>{
          'url': 'https://portal.quantixlabs.live/open#t=x',
          'status': 200,
        },
      );
      final scrubbed = scrubSentryBreadcrumb(crumb);
      expect(
        scrubbed.message,
        'http.client GET https://portal.quantixlabs.live/open',
      );
      expect(scrubbed.data?['url'], 'https://portal.quantixlabs.live/open');
      expect(scrubbed.data?['status'], 200);
    });
  });
}
