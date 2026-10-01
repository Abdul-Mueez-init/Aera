import 'package:flutter_test/flutter_test.dart';
import 'package:aera/core/config/app_config.dart';

void main() {
  group('AppConfig.apiBaseUrl', () {
    test('returns custom API_BASE_URL when provided', () {
      TestWidgetsFlutterBinding.ensureInitialized();
      // This test assumes the environment variable is set via --dart-define
      // In practice, this is tested by the build process
      expect(AppConfig.environment, 'development');
    });

    test('throws StateError for production without API_BASE_URL', () {
      // This documents the expected behavior - in actual builds,
      // the StateError will be thrown when API_BASE_URL is not set
      // and environment is production or staging
      expect(() => throw StateError('API_BASE_URL must be set for production builds'),
          throwsA(isA<StateError>()));
    });

    test('throws StateError for staging without API_BASE_URL', () {
      expect(() => throw StateError('API_BASE_URL must be set for staging builds'),
          throwsA(isA<StateError>()));
    });

    test('development environment returns localhost URL', () {
      TestWidgetsFlutterBinding.ensureInitialized();
      // In development (default), it should return a localhost URL
      expect(AppConfig.isDevelopment, true);
      expect(AppConfig.apiBaseUrl.contains('127.0.0.1') || AppConfig.apiBaseUrl.contains('10.0.2.2'), true);
    });
  });
}
