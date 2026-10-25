import 'package:sentry_flutter/sentry_flutter.dart';

/// Privacy scrubbing for Sentry payloads.
///
/// Portal magic links carry a single-use secret in the URL fragment
/// (`https://portal.quantixlabs.live/open#t=<token>`). Fragments must never
/// reach Sentry, so these helpers strip everything from the first `#` in
/// URL-like strings. They are wired into `SentryOptions.beforeSend` and
/// `SentryOptions.beforeBreadcrumb` in `main.dart`. When no DSN is
/// configured Sentry is disabled and none of this runs.

/// Returns [value] with any URL fragment removed — everything from the
/// first `#` onwards. Strings without a `#` are returned unchanged.
String scrubUrlFragment(String value) {
  final hash = value.indexOf('#');
  return hash == -1 ? value : value.substring(0, hash);
}

Map<String, dynamic>? _scrubBreadcrumbData(Map<String, dynamic>? data) {
  if (data == null) return null;
  var changed = false;
  final result = <String, dynamic>{};
  for (final entry in data.entries) {
    final value = entry.value;
    if (value is String) {
      final scrubbed = scrubUrlFragment(value);
      changed = changed || scrubbed != value;
      result[entry.key] = scrubbed;
    } else {
      result[entry.key] = value;
    }
  }
  return changed ? result : data;
}

/// Returns [breadcrumb] with URL fragments stripped from its message and
/// from any string values in its data (navigation breadcrumbs embed the
/// full URL, which for `/open` includes the `#t=` portal token). Sentry's
/// protocol types have mutable fields, so the crumb is updated in place.
Breadcrumb scrubSentryBreadcrumb(Breadcrumb breadcrumb) {
  final message = breadcrumb.message;
  if (message != null) {
    breadcrumb.message = scrubUrlFragment(message);
  }
  breadcrumb.data = _scrubBreadcrumbData(breadcrumb.data);
  return breadcrumb;
}

/// Returns [event] with the request URL de-fragmented, the request fragment
/// cleared, and all attached breadcrumbs scrubbed, updated in place.
SentryEvent scrubSentryEvent(SentryEvent event) {
  final request = event.request;
  if (request != null) {
    final url = request.url;
    if (url != null) {
      request.url = scrubUrlFragment(url);
    }
    request.fragment = null;
  }
  final breadcrumbs = event.breadcrumbs;
  if (breadcrumbs != null) {
    for (final breadcrumb in breadcrumbs) {
      scrubSentryBreadcrumb(breadcrumb);
    }
  }
  return event;
}
