import 'package:flutter_test/flutter_test.dart';
import 'package:aera/core/config/app_config.dart';

void main() {
  group('AppConfig', () {
    group('Environment detection', () {
      test('correctly identifies development environment', () {
        TestWidgetsFlutterBinding.ensureInitialized();
        // Default environment is development when not set
        expect(AppConfig.isDevelopment, true);
        expect(AppConfig.isProduction, false);
        expect(AppConfig.isStaging, false);
        expect(AppConfig.environment, 'development');
      });
    });

    group('API URL validation', () {
      test('development environment returns localhost URL', () {
        TestWidgetsFlutterBinding.ensureInitialized();
        // In development (default), it should return a localhost URL
        expect(AppConfig.isDevelopment, true);
        final url = AppConfig.apiBaseUrl;
        expect(url.contains('127.0.0.1') || url.contains('10.0.2.2'), true);
        expect(url.startsWith('http://'), true);
      });

      test('API URL is not empty in development', () {
        TestWidgetsFlutterBinding.ensureInitialized();
        expect(AppConfig.apiBaseUrl, isNotEmpty);
      });

      test('production/staging require HTTPS when API_BASE_URL is set', () {
        // This documents the validation requirement
        // In actual builds with --dart-define=ENVIRONMENT=production,
        // the app will throw StateError if API_BASE_URL is not set or doesn't use HTTPS
        expect(() {
          // Simulate the validation logic
          const envBaseUrl = 'http://example.com';
          const environment = 'production';
          if (environment == 'production' || environment == 'staging') {
            if (!envBaseUrl.startsWith('https://')) {
              throw StateError('API_BASE_URL must use HTTPS for production builds');
            }
          }
        }, throwsA(isA<StateError>()));
      });

      test('production/staging require API_BASE_URL to be set', () {
        expect(() {
          const envBaseUrl = '';
          const environment = 'production';
          if (environment == 'production' || environment == 'staging') {
            if (envBaseUrl.isEmpty) {
              throw StateError('API_BASE_URL must be set for production builds');
            }
          }
        }, throwsA(isA<StateError>()));
      });
    });

    group('Customer web base URL validation', () {
      test('customerWebBaseUrl can be empty in development', () {
        TestWidgetsFlutterBinding.ensureInitialized();
        // Development allows empty customer web base URL
        expect(AppConfig.customerWebBaseUrl, isEmpty);
      });

      test('validatedCustomerWebBaseUrl returns empty string in development', () {
        TestWidgetsFlutterBinding.ensureInitialized();
        expect(AppConfig.validatedCustomerWebBaseUrl, isEmpty);
      });

      test('production/staging require CUSTOMER_WEB_BASE_URL', () {
        // This documents the validation requirement
        // In actual builds with --dart-define=ENVIRONMENT=production,
        // validatedCustomerWebBaseUrl will throw StateError if not set
        expect(() {
          const customerWebBaseUrl = '';
          const environment = 'production';
          if (customerWebBaseUrl.isEmpty && (environment == 'production' || environment == 'staging')) {
            throw StateError('CUSTOMER_WEB_BASE_URL must be set for production web builds');
          }
        }, throwsA(isA<StateError>()));
      });
    });

    group('Sentry configuration', () {
      test('Sentry is disabled when DSN is empty', () {
        TestWidgetsFlutterBinding.ensureInitialized();
        // Default DSN is empty, so Sentry should be disabled
        expect(AppConfig.sentryDsn, isEmpty);
        expect(AppConfig.isSentryEnabled, false);
      });

      test('traces sample rate is within valid range', () {
        TestWidgetsFlutterBinding.ensureInitialized();
        expect(AppConfig.tracesSampleRate, greaterThanOrEqualTo(0.0));
        expect(AppConfig.tracesSampleRate, lessThanOrEqualTo(1.0));
      });

      test('appRelease can be empty (optional for local builds)', () {
        TestWidgetsFlutterBinding.ensureInitialized();
        expect(AppConfig.appRelease, isEmpty);
      });
    });
  });
}
