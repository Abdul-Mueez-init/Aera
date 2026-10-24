import 'package:http/http.dart' as http;

/// Mobile (IO) specific HTTP client for portal API calls.
///
/// Uses plain http.Client - bearer token will be added manually
/// from secure storage via Authorization header.
http.Client createPortalClient() {
  return http.Client();
}
