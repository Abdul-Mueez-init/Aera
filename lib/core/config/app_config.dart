import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show kIsWeb;

class AppConfig {
  static const String environment = String.fromEnvironment(
    'ENVIRONMENT',
    defaultValue: 'development',
  );

  // Phase 12 — crash/error reporting (Sentry). Left unset in local/dev/test:
  // sentry_bootstrap.dart then skips initialisation and the SDK is a no-op,
  // so no DSN is required to run the app or the test suite.
  static const String sentryDsn = String.fromEnvironment(
    'SENTRY_DSN',
    defaultValue: '',
  );

  // Optional: the git commit SHA or version of the deploy, so issues map to a release.
  // Format: aera-mobile@<version>+<build> or just the commit SHA. Set in CI/CD pipeline.
  static const String appRelease = String.fromEnvironment(
    'APP_RELEASE',
    defaultValue: '',
  );

  // Fraction of requests traced for performance data (0 to 1). Errors are always
  // captured regardless of this value. Keep this low on free plans.
  static const double tracesSampleRate = 0.1;

  static bool get isSentryEnabled => sentryDsn.isNotEmpty;

  static String get apiBaseUrl {
    final envBaseUrl = String.fromEnvironment(
      'API_BASE_URL',
      defaultValue: '',
    );

    if (envBaseUrl.isNotEmpty) {
      return envBaseUrl;
    }

    return _defaultBaseUrl();
  }

  static String _defaultBaseUrl() {
    switch (environment) {
      case 'production':
        throw StateError('API_BASE_URL must be set for production builds');
      case 'staging':
        throw StateError('API_BASE_URL must be set for staging builds');
      case 'development':
      default:
        return _developmentBaseUrl();
    }
  }

  static String _developmentBaseUrl() {
    if (kIsWeb) {
      return 'http://127.0.0.1:4000';
    }
    try {
      if (Platform.isAndroid) {
        return 'http://10.0.2.2:4000';
      }
      if (Platform.isIOS) {
        return 'http://127.0.0.1:4000';
      }
    } catch (_) {
      // Platform check may throw in some environments
    }
    return 'http://127.0.0.1:4000';
  }

  static bool get isProduction => environment == 'production';
  static bool get isStaging => environment == 'staging';
  static bool get isDevelopment => environment == 'development';
}
