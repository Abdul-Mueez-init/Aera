import 'package:aera/core/utils/link_builder.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('LinkBuilder regression checks (Area L #2)', () {
    test('quoteApproval generates full URL', () {
      final url = LinkBuilder.quoteApproval('token_abc123');
      expect(url, contains('/quote-approval/token_abc123'));
      expect(url.startsWith('http://') || url.startsWith('https://'), isTrue);
    });

    test('invoicePayment generates full URL with token and invoiceId', () {
      final url = LinkBuilder.invoicePayment('cust_tok_99', 'inv_456');
      expect(url, contains('/invoice-payment/cust_tok_99/inv_456'));
      expect(url.startsWith('http://') || url.startsWith('https://'), isTrue);
    });

    test('customerPortal generates full URL with token', () {
      final url = LinkBuilder.customerPortal('portal_tok_777');
      expect(url, contains('/portal/portal_tok_777'));
      expect(url.startsWith('http://') || url.startsWith('https://'), isTrue);
    });

    test('technicianTracking generates full URL with token and jobId', () {
      final url = LinkBuilder.technicianTracking('track_tok_11', 'job_88');
      expect(url, contains('/technician-tracking/track_tok_11/job_88'));
      expect(url.startsWith('http://') || url.startsWith('https://'), isTrue);
    });

    test('never returns empty or partial string', () {
      final quoteUrl = LinkBuilder.quoteApproval('test');
      final invoiceUrl = LinkBuilder.invoicePayment('t', 'i');
      final portalUrl = LinkBuilder.customerPortal('p');

      expect(quoteUrl.isNotEmpty, isTrue);
      expect(invoiceUrl.isNotEmpty, isTrue);
      expect(portalUrl.isNotEmpty, isTrue);
      expect(quoteUrl.contains('undefined'), isFalse);
      expect(quoteUrl.contains('null'), isFalse);
    });
  });
}
