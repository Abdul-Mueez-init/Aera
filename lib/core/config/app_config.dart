import 'dart:io' show Platform;
import 'package:flutter/foundation.dart' show kIsWeb;

class AppConfig {
  static const String environment = String.fromEnvironment(
    'ENVIRONMENT',
    defaultValue: 'development',
  );

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
        return 'https://api.aera.com';
      case 'staging':
        return 'https://staging-api.aera.com';
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
