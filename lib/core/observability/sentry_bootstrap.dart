import 'dart:async';
import 'package:sentry_flutter/sentry_flutter.dart';
import '../config/app_config.dart';
import '../network/api_response.dart';

/// Sentry bootstrap for Flutter crash reporting (Phase 12 hardening).
///
/// Sentry is initialised here before the app runs. Everything in this file is
/// safe to call when Sentry was never initialised (tests, local dev without a
/// DSN): the SDK turns every call into a no-op, so callers never need an
/// "is enabled" guard.
///
/// Privacy rule: Aera stores customer PII, so we never send user emails,
/// request bodies, or portal/quote capability tokens.

// Public capability tokens travel in the URL path, so the path itself is
// sensitive: anyone holding /portal/<token> can view that customer's data.
final RegExp _tokenPath = RegExp(
  r'(/portal/|/quote-approval/|/invoice-payment/|/technician-tracking/)[^/?#\s]+',
);

// Backend API paths that contain tokens
final RegExp _apiTokenPath = RegExp(
  r'(/api/v1/portal/|/api/v1/quotes/shared/)[^/?#\s]+',
);

// Secret query parameters
final RegExp _sensitiveQuery = RegExp(
  r'([?&](?:key|token|api_key|apikey|access_token)=)[^&#\s]*',
  caseSensitive: false,
);

/// Redacts capability tokens and secret query parameters from URLs.
String redactUrl(String url) {
  return url
      .replaceAllMapped(_tokenPath, (match) => '${match.group(1)}[redacted]')
      .replaceAllMapped(_apiTokenPath, (match) => '${match.group(1)}[redacted]')
      .replaceAllMapped(_sensitiveQuery, (match) => '${match.group(1)}[redacted]');
}

/// Decides which errors are worth a Sentry issue. Expected client errors
/// (validation, auth/not-found are UI states, not crashes) are normal
/// control flow and already appear in structured logs, so reporting them
/// would burn the free-plan quota and bury real bugs. Network failures and
/// 5xx are reported.
bool shouldReportError(dynamic error, dynamic stackTrace) {
  if (error is ApiException) {
    // Ignore expected client errors (4xx)
    return error.statusCode >= 500;
  }
  // Report everything else (unhandled exceptions, network failures, etc.)
  return true;
}

/// Scrubs sensitive data from outgoing Sentry events before sending.
SentryEvent? beforeSend(SentryEvent event, dynamic hint) {
  // Redact URLs in breadcrumbs - create new breadcrumb list
  final breadcrumbs = event.breadcrumbs?.map((breadcrumb) {
    if (breadcrumb.data != null && breadcrumb.data!['url'] != null) {
      final newData = Map<String, dynamic>.from(breadcrumb.data!);
      newData['url'] = redactUrl(breadcrumb.data!['url'].toString());
      return breadcrumb.copyWith(data: newData);
    }
    return breadcrumb;
  }).toList();

  // Redact URLs in request data - create new request object
  SentryRequest? scrubbedRequest;
  if (event.request != null) {
    scrubbedRequest = SentryRequest(
      url: event.request!.url != null ? redactUrl(event.request!.url!) : null,
      queryString: event.request!.queryString != null
          ? redactUrl('?${event.request!.queryString}').substring(1)
          : null,
      method: event.request!.method,
      headers: event.request!.headers,
      cookies: null, // Always remove cookies
      data: null, // Always remove request body
    );
  }

  // Never attach anything beyond the opaque user id
  SentryUser? scrubbedUser;
  if (event.user != null) {
    scrubbedUser = SentryUser(
      id: event.user!.id,
      // Intentionally omit email, username, ipAddress, etc.
    );
  }

  return event.copyWith(
    breadcrumbs: breadcrumbs,
    request: scrubbedRequest,
    user: scrubbedUser,
  );
}

/// Drops console breadcrumbs as they can carry URLs or customer data.
Breadcrumb? beforeBreadcrumb(Breadcrumb breadcrumb) {
  if (breadcrumb.category == 'console') return null;
  return breadcrumb;
}

/// Bootstraps the app with Sentry crash reporting.
///
/// If SENTRY_DSN is empty, runs the app normally without Sentry.
/// Otherwise, initializes Sentry with privacy-preserving configuration
/// and then runs the app.
Future<void> bootstrapWithSentry(FutureOr<void> Function() appRunner) async {
  if (!AppConfig.isSentryEnabled) {
    // No DSN: run app normally without Sentry
    await appRunner();
    return;
  }

  await SentryFlutter.init(
    (options) {
      options.dsn = AppConfig.sentryDsn;
      options.environment = AppConfig.environment;
      if (AppConfig.appRelease.isNotEmpty) {
        options.release = AppConfig.appRelease;
      }

      // Aera holds customer PII, so opt out of everything sensitive
      options.enableUserInteractionTracing = false;
      options.enableWatchdogTerminationTracking = true;
      options.enableAppHangTracking = true;

      // Disable screenshots and view hierarchy attachments (they can capture customer data)
      options.attachScreenshot = false;
      options.attachViewHierarchy = false;

      // Low traces sample rate for free plans
      options.tracesSampleRate = AppConfig.tracesSampleRate;

      // Filter expected errors
      options.beforeSend = beforeSend;
    },
    appRunner: appRunner,
  );
}
