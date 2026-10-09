import '../config/app_config.dart';

/// Helper for building customer-facing web links (quote approval, invoice payment, portal).
///
/// These links are meant to be opened in a browser without the app installed.
/// The web build is hosted on a static host (e.g., Cloudflare Pages) with SPA fallback.
class LinkBuilder {
  /// Normalize a base URL by removing trailing slashes.
  static String _normalizeBaseUrl(String baseUrl) {
    return baseUrl.trim().replaceAll(RegExp(r'/+$'), '');
  }

  /// Build a full quote approval link.
  ///
  /// Example: https://customer.example.com/quote-approval/abc123
  static String quoteApproval(String shareToken) {
    final baseUrl = AppConfig.customerWebBaseUrl;
    if (baseUrl.isEmpty) {
      throw StateError(
        'CUSTOMER_WEB_BASE_URL must be set for production builds. '
        'Use --dart-define=CUSTOMER_WEB_BASE_URL=<url> when building.',
      );
    }
    final normalizedBase = _normalizeBaseUrl(baseUrl);
    final uri = Uri.parse('$normalizedBase/quote-approval/$shareToken');
    _validateHttps(uri);
    return uri.toString();
  }

  /// Build a full invoice payment link.
  ///
  /// Example: https://customer.example.com/invoice-payment/abc123/inv-456
  static String invoicePayment(String token, String invoiceId) {
    final baseUrl = AppConfig.customerWebBaseUrl;
    if (baseUrl.isEmpty) {
      throw StateError(
        'CUSTOMER_WEB_BASE_URL must be set for production builds. '
        'Use --dart-define=CUSTOMER_WEB_BASE_URL=<url> when building.',
      );
    }
    final normalizedBase = _normalizeBaseUrl(baseUrl);
    final uri = Uri.parse('$normalizedBase/invoice-payment/$token/$invoiceId');
    _validateHttps(uri);
    return uri.toString();
  }

  /// Build a full customer portal link.
  ///
  /// Example: https://customer.example.com/portal/abc123
  static String customerPortal(String token) {
    final baseUrl = AppConfig.customerWebBaseUrl;
    if (baseUrl.isEmpty) {
      throw StateError(
        'CUSTOMER_WEB_BASE_URL must be set for production builds. '
        'Use --dart-define=CUSTOMER_WEB_BASE_URL=<url> when building.',
      );
    }
    final normalizedBase = _normalizeBaseUrl(baseUrl);
    final uri = Uri.parse('$normalizedBase/portal/$token');
    _validateHttps(uri);
    return uri.toString();
  }

  /// Build a full technician tracking link.
  ///
  /// Example: https://customer.example.com/technician-tracking/abc123/job-789
  static String technicianTracking(String token, String jobId) {
    final baseUrl = AppConfig.customerWebBaseUrl;
    if (baseUrl.isEmpty) {
      throw StateError(
        'CUSTOMER_WEB_BASE_URL must be set for production builds. '
        'Use --dart-define=CUSTOMER_WEB_BASE_URL=<url> when building.',
      );
    }
    final normalizedBase = _normalizeBaseUrl(baseUrl);
    final uri = Uri.parse('$normalizedBase/technician-tracking/$token/$jobId');
    _validateHttps(uri);
    return uri.toString();
  }

  /// Validate that the URI uses HTTPS in production/staging environments.
  static void _validateHttps(Uri uri) {
    if (AppConfig.isProduction || AppConfig.isStaging) {
      if (uri.scheme != 'https') {
        throw StateError(
          'CUSTOMER_WEB_BASE_URL must use HTTPS for ${AppConfig.environment} builds. '
          'Current scheme: ${uri.scheme}',
        );
      }
    }
  }
}
