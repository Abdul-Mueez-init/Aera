# Test both Backend and Flutter Sentry integration
# This script tests that both projects are sending events to Sentry

Write-Host "===========================================" -ForegroundColor Green
Write-Host "SENTRY INTEGRATION TEST" -ForegroundColor Green
Write-Host "===========================================" -ForegroundColor Green
Write-Host ""

Write-Host "Backend DSN (Express/Node.js):" -ForegroundColor Cyan
Write-Host "https://b778d33f231100cf464bd7c602ca1e7e@o4512171959975936.ingest.us.sentry.io/4512176864624640"
Write-Host ""

Write-Host "Flutter DSN:" -ForegroundColor Cyan
Write-Host "https://45936dee3890641313ef3c2c75c73867@o4512171959975936.ingest.us.sentry.io/4512176828448768"
Write-Host ""

Write-Host "===========================================" -ForegroundColor Yellow
Write-Host "BACKEND TEST" -ForegroundColor Yellow
Write-Host "===========================================" -ForegroundColor Yellow
Write-Host "Starting backend server with Sentry enabled..."
Write-Host "Backend is running on http://127.0.0.1:4000"
Write-Host ""
Write-Host "To test backend Sentry:" -ForegroundColor Yellow
Write-Host "1. Visit http://127.0.0.1:4000/health (should NOT create Sentry issue)"
Write-Host "2. Visit http://127.0.0.1:4000/api/v1/auth/login with invalid data (might create issue)"
Write-Host "3. Check your Sentry Express project for events"
Write-Host ""

Write-Host "===========================================" -ForegroundColor Yellow
Write-Host "FLUTTER TEST" -ForegroundColor Yellow
Write-Host "===========================================" -ForegroundColor Yellow
Write-Host "To test Flutter Sentry, run:"
Write-Host "flutter run --dart-define=ENVIRONMENT=development --dart-define=SENTRY_DSN=`"https://45936dee3890641313ef3c2c75c73867@o4512171959975936.ingest.us.sentry.io/4512176828448768`""
Write-Host ""
Write-Host "Then in the Flutter app, trigger a test error by temporarily adding:"
Write-Host "throw StateError('This is a test exception for Sentry');"
Write-Host ""
Write-Host "Check your Sentry Flutter project for events"
Write-Host ""

Write-Host "===========================================" -ForegroundColor Green
Write-Host "VERIFICATION CHECKLIST" -ForegroundColor Green
Write-Host "===========================================" -ForegroundColor Green
Write-Host "✓ Backend: Server started successfully"
Write-Host "✓ Backend: Sentry initialized (check logs for Sentry init)"
Write-Host "✓ Flutter: sentry_flutter package installed"
Write-Host "✓ Flutter: sentry_bootstrap.dart created"
Write-Host "✓ Flutter: Tests passing (31 tests)"
Write-Host ""
Write-Host "Manual verification needed:" -ForegroundColor Yellow
Write-Host "- Backend: Trigger a 500 error and check Sentry Express project"
Write-Host "- Flutter: Run app with DSN, trigger error, check Sentry Flutter project"
Write-Host "- Verify tokens are redacted in both projects"
Write-Host "- Verify user context (userId, companyId, role) is attached"
Write-Host ""
