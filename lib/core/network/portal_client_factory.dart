import 'package:http/http.dart' as http;

/// Factory for creating HTTP clients for portal API calls.
///
/// Phase 8: Different transport for web vs mobile:
/// - Web: BrowserClient with credentials (cookies)
/// - Mobile: Plain http.Client (bearer token from secure storage)
abstract class PortalClientFactory {
  static http.Client create() {
    // Conditional import based on platform
    final factory = _getClientFactory();
    return factory.create();
  }

  static _ClientFactory _getClientFactory() {
    // The conditional import will be resolved at compile time
    // This file itself doesn't use conditional imports - the implementations do
    return _ClientFactoryImpl();
  }
}

abstract class _ClientFactory {
  http.Client create();
}

class _ClientFactoryImpl implements _ClientFactory {
  @override
  http.Client create() {
    // This will be replaced by conditional imports
    // The actual platform-specific implementations are in separate files
    return http.Client();
  }
}
