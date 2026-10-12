import '../config/app_config.dart';

/// Helper for building customer-facing web links (quote approval, invoice payment, portal).
///
/// Links are built from `CUSTOMER_WEB_BASE_URL` when it is set (the hosted
/// customer web build). When it is not set, they fall back to the origin of
/// `API_BASE_URL`, so owners always get a real, copyable link. The fallback
/// host does not render the customer pages itself; set
/// `CUSTOMER_WEB_BASE_URL` once the customer web build is hosted.
class LinkBuilder {
  /// Normalize a base URL by removing trailing slashes.
  static String _normalizeBaseUrl(String baseUrl) {
    return baseUrl.trim().replaceAll(RegExp(r'/+$'), '');
  }

  /// The base every customer link starts with.
  static String _resolveBaseUrl() {
    final configured = AppConfig.customerWebBaseUrl.trim();
    if (configured.isNotEmpty) {
      return _normalizeBaseUrl(configured);
    }
    return _normalizeBaseUrl(Uri.parse(AppConfig.apiBaseUrl).origin);
  }

  static String _build(String path) {
    final uri = Uri.parse('${_resolveBaseUrl()}$path');
    _validateHttps(uri);
    return uri.toString();
  }

  /// Build a full quote approval link.
  ///
  /// Example: https://customer.example.com/quote-approval/abc123
  static String quoteApproval(String shareToken) =>
      _build('/quote-approval/$shareToken');

  /// Build a full invoice payment link.
  ///
  /// Example: https://customer.example.com/invoice-payment/abc123/inv-456
  static String invoicePayment(String token, String invoiceId) =>
      _build('/invoice-payment/$token/$invoiceId');

  /// Build a full customer portal link.
  ///
  /// Example: https://customer.example.com/portal/abc123
  static String customerPortal(String token) => _build('/portal/$token');

  /// Build a full technician tracking link.
  ///
  /// Example: https://customer.example.com/technician-tracking/abc123/job-789
  static String technicianTracking(String token, String jobId) =>
      _build('/technician-tracking/$token/$jobId');

  /// Validate that the URI uses HTTPS in production/staging environments.
  static void _validateHttps(Uri uri) {
    if (AppConfig.isProduction || AppConfig.isStaging) {
      if (uri.scheme != 'https') {
        throw StateError(
          'Customer links must use HTTPS for ${AppConfig.environment} builds. '
          'Current scheme: ${uri.scheme}',
        );
      }
    }
  }
}
