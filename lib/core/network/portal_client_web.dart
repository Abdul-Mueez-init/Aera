import 'package:http/browser_client.dart';
import 'package:http/http.dart' as http;

/// Web-specific HTTP client for portal API calls.
///
/// Uses BrowserClient with credentials enabled to support
/// HttpOnly cookies for session management.
http.Client createPortalClient() {
  final client = BrowserClient();
  client.withCredentials = true;
  return client;
}
