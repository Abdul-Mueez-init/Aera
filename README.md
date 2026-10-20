# Aera

Aera is a mobile-first field-service operations platform for HVAC businesses.
The repository contains the Flutter client and a versioned Node.js REST API backed by PostgreSQL.

## Project Overview

Aera helps HVAC businesses manage:
- **Customer Management:** Track customer information, service addresses, and history
- **Job Scheduling:** Schedule, assign, and track service jobs
- **Technician Dispatch:** Real-time job assignment and technician tracking
- **Quoting & Invoicing:** Generate quotes, create invoices, and track payments
- **Customer Portal:** Self-service portal for customers to view status and approve quotes
- **AI Assistant:** AI-powered insights and operational recommendations

## Architecture

The application follows a modern multi-tier architecture:

- **Frontend:** Flutter (cross-platform mobile app)
- **Backend:** Node.js/Express with TypeScript
- **Database:** PostgreSQL via Supabase
- **ORM:** Prisma for type-safe database access
- **Authentication:** JWT-based with refresh tokens
- **Multi-tenancy:** Company-scoped data isolation

For detailed architecture documentation, see [docs/architecture.md](docs/architecture.md).
For a visual architecture diagram, see [docs/architecture_diagram.md](docs/architecture_diagram.md).

## Prerequisites

- Flutter stable with Dart 3.12 or newer
- Node.js 22 LTS
- pnpm 12.3.4
- A Supabase project with PostgreSQL enabled

## Local Setup

### 1. Install Dependencies

Install all workspace dependencies from the repository root:

```powershell
pnpm install
flutter pub get
```

### 2. Configure Environment

Create the backend environment file and replace the placeholders with the Supabase connection strings from the project's Connect dialog. Use the pooled URL for `DATABASE_URL` and the direct URL for `DIRECT_URL`:

```powershell
Copy-Item backend/.env.example backend/.env
```

Set `JWT_SECRET` to a unique random value of at least 32 characters. Never commit `backend/.env` or reuse this secret across environments.

### 3. Database Migration

Apply the checked-in migration to the Supabase database:

```powershell
pnpm --filter backend prisma:migrate:deploy
pnpm --filter backend prisma:generate
```

**Note:** After pulling the latest code, apply the payment idempotency fix migration:
```powershell
pnpm --filter backend prisma:migrate deploy
```

### 4. Seed Demo Data (Optional)

For demo/testing purposes, seed the database with deterministic demo data:

```powershell
pnpm --filter backend seed:demo
```

This creates:
- 1 demo company
- 6 demo users (1 admin, 1 dispatcher, 4 technicians)
- 5 demo customers
- 15 demo jobs (various statuses)
- 8 demo quotes (various statuses)
- 6 demo invoices (various statuses)

**Demo Credentials:**
- Email: admin@aera.demo
- Password: Demo123!

**Note:** Skip this step for production deployments.

For detailed documentation on demo seed data, see [docs/phase_H1_demo_seed_data.md](docs/phase_H1_demo_seed_data.md).

## Demo Workflow

To experience the full Aera workflow with demo data:

1. **Seed demo data** (if not already done):
   ```powershell
   pnpm --filter backend seed:demo
   ```

2. **Start the backend**:
   ```powershell
   pnpm --filter backend dev
   ```

3. **Start the Flutter app**:
   ```powershell
   flutter run
   ```

4. **Login with demo credentials**:
   - Email: admin@aera.demo
   - Password: Demo123!

5. **Explore the workflow**:
   - View the Dashboard for job and schedule overview
   - Navigate to Customers to see demo customer data
   - Check Jobs to view various job statuses
   - Review Quotes and Invoices for financial data
   - Try the AI Assistant for operational insights

For a detailed breakdown of demo data structure, see [docs/phase_H1_demo_seed_data.md](docs/phase_H1_demo_seed_data.md).

## Run Locally

### Start Backend

Start the API with one command:

```powershell
pnpm --filter backend dev
```

The API listens on `http://127.0.0.1:4000`.

### Start Flutter

Start the Flutter app in a second terminal:

```powershell
flutter run
```

The app will launch on your connected device or emulator.

## Environment Configuration

The Flutter app supports three environments: development, staging, and production. API configuration is environment-aware:

**Development (default):**
- Android: `http://10.0.2.2:4000` (emulator localhost)
- iOS: `http://127.0.0.1:4000`
- Web: `http://127.0.0.1:4000`

**Staging:**
- All platforms: `https://staging-api.aera.com`

**Production:**
- All platforms: `https://api.aera.com`

### Build Commands

**Android builds:**
```powershell
# Development
flutter run --flavor development --dart-define=ENVIRONMENT=development

# Staging
flutter run --flavor staging --dart-define=ENVIRONMENT=staging

# Production
flutter run --flavor production --dart-define=ENVIRONMENT=production

# Release builds
flutter build apk --flavor production --dart-define=ENVIRONMENT=production
flutter build appbundle --flavor production --dart-define=ENVIRONMENT=production
```

**iOS builds:**
```powershell
# Development
flutter run --dart-define=ENVIRONMENT=development

# Staging
flutter run --dart-define=ENVIRONMENT=staging

# Production
flutter run --dart-define=ENVIRONMENT=production
```

**Custom API URL:**
```powershell
flutter run --dart-define=ENVIRONMENT=staging --dart-define=API_BASE_URL=https://custom-api.example.com
```

### Environment Configuration

The Flutter app supports three environments: development, staging, and production. API configuration is environment-aware:

**Development (default):**
- Android: `http://10.0.2.2:4000` (emulator localhost)
- iOS: `http://127.0.0.1:4000`
- Web: `http://127.0.0.1:4000`

**Staging:**
- All platforms: `https://staging-api.aera.com`

**Production:**
- All platforms: `https://api.aera.com`

### Build Commands

**Android builds:**
```powershell
# Development
flutter run --flavor development --dart-define=ENVIRONMENT=development

# Staging
flutter run --flavor staging --dart-define=ENVIRONMENT=staging

# Production
flutter run --flavor production --dart-define=ENVIRONMENT=production

# Release builds
flutter build apk --flavor production --dart-define=ENVIRONMENT=production
flutter build appbundle --flavor production --dart-define=ENVIRONMENT=production
```

**iOS builds:**
```powershell
# Development
flutter run --dart-define=ENVIRONMENT=development

# Staging
flutter run --dart-define=ENVIRONMENT=staging

# Production
flutter run --dart-define=ENVIRONMENT=production
```

**Custom API URL:**
```powershell
flutter run --dart-define=ENVIRONMENT=staging --dart-define=API_BASE_URL=https://custom-api.example.com
```

## Release Build

### Backend (must be running and reachable from the phone)
```powershell
cd backend
pnpm install
pnpm prisma:generate
pnpm prisma migrate deploy
pnpm start
```

### Flutter, run on a USB-connected phone
```powershell
flutter clean
flutter pub get
flutter analyze
flutter test
flutter run --release --flavor production `
  --dart-define=ENVIRONMENT=production `
  --dart-define=API_BASE_URL=http://<PC-LAN-IP>:4000
```

### Build an APK instead
```powershell
flutter build apk --release --flavor production `
  --dart-define=ENVIRONMENT=production `
  --dart-define=API_BASE_URL=https://<your-api-host>
# -> build\app\outputs\flutter-apk\app-production-release.apk
```

### Optional crash reporting
Add `--dart-define=SENTRY_DSN=<dsn>` and `--dart-define=APP_RELEASE=aera-mobile@1.0.0+1` to enable Sentry error reporting.

**Important notes:**
- Android has 3 product flavors (development, staging, production). Always use `--flavor` for release builds.
- Always provide `--dart-define=API_BASE_URL` for production/staging builds to avoid pointing at the wrong server.
- Without `API_BASE_URL`, production/staging builds will fail loudly with an error.

## API Endpoints

### Health Endpoints
- `GET /health` - Basic health check
- `GET /api/v1/health` - Versioned health check
- `GET /api/v1/readiness` - Readiness probe

### Authentication Endpoints
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/refresh` - Refresh access token
- `POST /api/v1/auth/logout` - User logout
- `GET /api/v1/auth/me` - Get current user

### Company Endpoints
- `POST /api/v1/companies` - Create company
- `GET /api/v1/companies/:companyId` - Get company details

### Customer Endpoints
- `GET /api/v1/customers` - List customers
- `POST /api/v1/customers` - Create customer
- `GET /api/v1/customers/:customerId` - Get customer details
- `PATCH /api/v1/customers/:customerId` - Update customer
- `DELETE /api/v1/customers/:customerId` - Delete customer
- `POST /api/v1/customers/:customerId/addresses` - Add service address

### Job Endpoints
- `GET /api/v1/jobs` - List jobs
- `POST /api/v1/jobs` - Create job
- `GET /api/v1/jobs/:jobId` - Get job details
- `PATCH /api/v1/jobs/:jobId` - Update job
- `POST /api/v1/jobs/:jobId/assign` - Assign technician
- `POST /api/v1/jobs/:jobId/status` - Update job status
- `POST /api/v1/jobs/:jobId/notes` - Add job note
- `GET /api/v1/jobs/:jobId/history` - Get job status history

### Schedule Endpoints
- `GET /api/v1/schedule?date=YYYY-MM-DD` - Get daily schedule
- `GET /api/v1/schedule/workload?date=YYYY-MM-DD` - Get technician workload
- `POST /api/v1/schedule/jobs/:jobId/schedule` - Schedule job
- `POST /api/v1/schedule/jobs/:jobId/reschedule` - Reschedule job

### Quote Endpoints
- `GET /api/v1/quotes` - List quotes
- `POST /api/v1/quotes` - Create quote
- `GET /api/v1/quotes/:quoteId` - Get quote details
- `PATCH /api/v1/quotes/:quoteId` - Update quote
- `POST /api/v1/quotes/:quoteId/send` - Send quote to customer

### Invoice Endpoints
- `GET /api/v1/invoices` - List invoices
- `POST /api/v1/invoices` - Create invoice
- `GET /api/v1/invoices/:invoiceId` - Get invoice details
- `PATCH /api/v1/invoices/:invoiceId` - Update invoice
- `POST /api/v1/invoices/:invoiceId/payments` - Add payment

### Portal Endpoints
- `GET /api/v1/portal/:token` - Get customer portal data
- `POST /api/v1/portal/:token/reviews` - Submit customer review

For complete API documentation, see [docs/phase_H1_api_documentation.md](docs/phase_H1_api_documentation.md).

## Error Reporting

Aera uses Sentry for crash and error reporting in both the backend and Flutter app. This helps identify and fix unexpected errors quickly.

### What is Captured

**Backend (Node.js/Express):**
- 5xx errors and unexpected exceptions
- Unhandled promise rejections
- Background job failures
- Request ID, company ID, role, and opaque user ID for context
- Performance traces (configurable sample rate)

**Flutter:**
- App crashes and unhandled errors
- Non-fatal exceptions
- Navigation breadcrumbs (with sensitive tokens redacted)
- User context (opaque user ID, company ID, role tags)
- Performance traces (configurable sample rate)

### What is NOT Captured

**Privacy and Security (both platforms):**
- ❌ Authorization headers (Bearer tokens, API keys)
- ❌ Cookies and session data
- ❌ Request/response bodies
- ❌ Personal information (email, name, phone, address)
- ❌ Portal capability tokens (URLs redacted)
- ❌ Shared quote capability tokens (URLs redacted)
- ❌ Payment tokens (URLs redacted)
- ❌ Tracking tokens (URLs redacted)
- ❌ Sensitive query parameters (key, token, api_key, access_token)
- ❌ Screenshots (Flutter)
- ❌ View hierarchy (Flutter)
- ❌ Session replay (Flutter)

**Expected errors are not reported:**
- ❌ 4xx client errors (400, 401, 403, 404, 409, 422)
- ❌ Validation errors
- ❌ Authentication failures (wrong password, expired token)
- ❌ Expected business logic errors

### Configuration

**Backend Environment Variables** (in `backend/.env`):
```bash
# Sentry DSN for Express/Node.js project
SENTRY_DSN="https://your-dsn@sentry.io/project-id"

# Environment: development, staging, or production
SENTRY_ENVIRONMENT="development"

# Release identifier: git commit SHA or aera-api@<sha>
SENTRY_RELEASE=""

# Performance tracing sample rate (0 to 1)
SENTRY_TRACES_SAMPLE_RATE=0.1
```

**Flutter Build-Time Defines**:
```bash
# Sentry DSN for Flutter project
--dart-define=SENTRY_DSN="https://your-dsn@sentry.io/project-id"

# Environment: development, staging, or production
--dart-define=ENVIRONMENT="development"

# Release identifier: aera-mobile@<version>+<build>
--dart-define=APP_RELEASE="aera-mobile@1.0.0+1"
```

### No DSN Behavior

When `SENTRY_DSN` is not set (empty string), Sentry is completely disabled and has zero performance impact. The application behaves identically to before Sentry integration.

### Symbol Upload (Release Builds)

For Flutter release builds, debug symbols are uploaded to Sentry for better stack traces:

```bash
flutter build apk --obfuscate --split-debug-info=./debug-info \
  --dart-define=ENVIRONMENT=production \
  --dart-define=SENTRY_DSN="..." \
  --dart-define=APP_RELEASE="aera-mobile@1.0.0+1"
```

The `sentry_dart_plugin` is configured in `pubspec.yaml` and requires the `SENTRY_ORG_AUTH_TOKEN` environment variable (CI secret only) for symbol upload.

**Note:** Backend source maps are not currently uploaded since the server runs TypeScript directly via `tsx`. If deployment switches to compiled JavaScript with `tsc`, source map upload should be revisited.

### Alerts

Alerts are configured in the Sentry UI for:
- New production issues
- Issue regressions
- Recommended for `production` and `staging` environments only

## Quality Checks

Run the same checks used by CI:

```powershell
# Backend checks
pnpm --filter backend prisma:validate
pnpm --filter backend lint
pnpm --filter backend format:check
pnpm --filter backend typecheck
pnpm --filter backend test
pnpm --filter backend build

# Flutter checks
flutter analyze
flutter test
```

## Troubleshooting

### Common Issues

**Issue:** "Prisma Client generation failed"
- **Solution:** Ensure `DATABASE_URL` and `DIRECT_URL` are set correctly in `backend/.env`
- **Solution:** Run `pnpm --filter backend prisma:generate` after migration

**Issue:** "Flutter pub get fails"
- **Solution:** Ensure Flutter is installed and in PATH
- **Solution:** Run `flutter doctor` to check Flutter installation
- **Solution:** Try `flutter clean` then `flutter pub get`

**Issue:** "Database connection error"
- **Solution:** Verify Supabase project is active
- **Solution:** Check connection strings in `backend/.env`
- **Solution:** Ensure Supabase project has PostgreSQL enabled

**Issue:** "Module not found" errors
- **Solution:** Run `pnpm install` from repository root
- **Solution:** Delete `node_modules` and reinstall
- **Solution:** Ensure pnpm version is 12.3.4

**Issue:** "Flutter device not found"
- **Solution:** Run `flutter devices` to list available devices
- **Solution:** Start an emulator with `flutter emulators`
- **Solution:** Connect a physical device with USB debugging enabled

### Getting Help

If you encounter issues not covered here:

1. Check the documentation in the `docs/` folder
2. Review the architecture and implementation plans
3. Check existing test files for usage examples
4. Verify your environment matches the prerequisites
5. Review the troubleshooting section below

## Screenshots and Media

*Note: Screenshots and demo media will be added in a future update.*

For now, refer to the demo workflow section to experience the application locally with seeded data.

## Release Status

### Current Version: 1.0.0+1

**Release Readiness:** Phase H1 (Phase 12 Hardening) - 100% Complete (Documentation & Implementation)

**Completed Hardening Items:**
- ✅ Performance profiling and load testing
- ✅ Security review and authorization testing
- ✅ State verification (loading, empty, error states)
- ✅ Animation and interaction polish
- ✅ Deterministic demo seed data
- ✅ Architecture diagram
- ✅ API documentation snapshot
- ✅ Crash/error reporting (Sentry integration)
- ✅ Polished README with demo workflow
- ✅ Accessibility documentation and implementation guidance
- ✅ Final release gate checklist verification
- ✅ Demo video recording guide

**Manual Verification Remaining:**
- ⏳ Demo video recording (guide provided)
- ⏳ Flutter Sentry event verification (blocked by Windows toolchain)
- ⏳ Sentry UI alerts configuration (guide provided)

**Critical Issues:**
- ⚠️ 2 scheduling concurrency test failures (need investigation)
- ⚠️ 7 quote lifecycle test failures (need investigation)

## Documentation

### Core Documentation
- **[docs/plan.md](docs/plan.md)** - Implementation phases and sequencing
- **[docs/architecture.md](docs/architecture.md)** - System architecture and API contract
- **[docs/architecture_diagram.md](docs/architecture_diagram.md)** - Visual system architecture diagram
- **[docs/rules.md](docs/rules.md)** - Engineering rules and quality standards
- **[docs/PRD.md](docs/PRD.md)** - Product requirements and invariants
- **[docs/schema.md](docs/schema.md)** - Database schema and integrity rules
- **[docs/design.md](docs/design.md)** - Design tokens and visual language

### Phase Documentation
- **[docs/phase_1_baseline_and_impact_analysis.md](docs/phase_1_baseline_and_impact_analysis.md)** - Phase 1 baseline and impact analysis
- **[docs/phase_2_release_readiness_completion.md](docs/phase_2_release_readiness_completion.md)** - Phase 2 release readiness completion
- **[docs/phase_3_access_control_privacy_completion.md](docs/phase_3_access_control_privacy_completion.md)** - Phase 3 access control and privacy completion

### Integration Documentation
- **[SENTRY_INTEGRATION_COMPLETE.md](SENTRY_INTEGRATION_COMPLETE.md)** - Sentry crash/error reporting integration
- **[docs/SENTRY_CI_CONFIGURATION.md](docs/SENTRY_CI_CONFIGURATION.md)** - CI/CD configuration for Sentry



## License

[Add your license here]

## Contributing

[Add contribution guidelines here]

## Support

For support, questions, or issues, please [add contact information or issue tracker link here].
