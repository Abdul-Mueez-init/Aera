import 'package:flutter/foundation.dart' show kIsWeb;

/// The URL fragment (`t=<token>`) the page was opened with.
///
/// Flutter web uses the path URL strategy, which drops the `#fragment` from
/// the route the router sees, and the router rewrites the address bar as soon
/// as it settles on `/open`. By the time `PortalOpenScreen` runs, the token
/// can already be gone from `Uri.base`, so the portal link would be treated
/// as "no token" and never exchanged. [captureLaunchFragment] therefore runs
/// first thing in `main()`, before the router exists, and keeps the fragment
/// in memory only (never in a provider, route, or log).
String _launchFragment = '';

/// Call once, as early as possible in `main()`.
void captureLaunchFragment() {
  if (!kIsWeb) return;
  _launchFragment = Uri.base.fragment;
}

/// The fragment captured at launch ('' when none, or not on web).
String get launchFragment => _launchFragment;

/// Forget the captured fragment once the link has been used (or found
/// invalid), so it cannot be replayed from memory.
void clearLaunchFragment() {
  _launchFragment = '';
}
