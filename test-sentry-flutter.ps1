# Test Flutter Sentry integration with your DSN
# Run this to verify Sentry is working with your Flutter project

flutter run --dart-define=ENVIRONMENT=development --dart-define=SENTRY_DSN="https://45936dee3890641313ef3c2c75c73867@o4512171959975936.ingest.us.sentry.io/4512176828448768"

# For release builds with symbol upload (requires CI secret for Sentry auth token):
# flutter build apk --obfuscate --split-debug-info=./debug-info --dart-define=ENVIRONMENT=production --dart-define=SENTRY_DSN="..." --dart-define=APP_RELEASE="aera-mobile@1.0.0+1"
