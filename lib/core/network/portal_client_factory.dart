/// Platform-specific HTTP client for portal API calls (handoff 6.2).
///
/// - Web: `BrowserClient` with credentials enabled, so the HttpOnly
///   `__Host-aera_portal` session cookie is sent/stored by the browser.
/// - Mobile/desktop (IO): a plain `http.Client`; the session token is kept
///   in secure storage and attached as `Authorization: Bearer` by
///   `PortalRepository` instead.
///
/// The conditional export below is resolved at compile time on
/// `dart.library.js_interop` (true only for web builds).
library;

export 'portal_client_io.dart'
    if (dart.library.js_interop) 'portal_client_web.dart';
