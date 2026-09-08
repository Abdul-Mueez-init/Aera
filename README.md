# Aera

Aera is a mobile-first field-service operations platform for HVAC businesses.
The repository contains the Flutter client and a versioned Node.js REST API backed by PostgreSQL.

## Prerequisites

- Flutter stable with Dart 3.12 or newer.
- Node.js 22 LTS.
- pnpm 12.3.4.
- A Supabase project with PostgreSQL enabled.

## Local setup

Install all workspace dependencies from the repository root:

```powershell
pnpm install
flutter pub get
```

Create the backend environment file and replace the placeholders with the Supabase connection strings from the project's Connect dialog. Use the pooled URL for `DATABASE_URL` and the direct URL for `DIRECT_URL`:

```powershell
Copy-Item backend/.env.example backend/.env
```

Set `JWT_SECRET` to a unique random value of at least 32 characters. Never commit `backend/.env` or reuse this secret across environments.

Apply the checked-in migration to the Supabase database:

```powershell
pnpm --filter backend prisma:migrate:deploy
pnpm --filter backend prisma:generate
```

## Run locally

Start the API with one command:

```powershell
pnpm --filter backend dev
```

The API listens on `http://127.0.0.1:4000`.

Start the Flutter shell in a second terminal:

```powershell
flutter run
```

Health endpoints:

- `GET /health`
- `GET /api/v1/health`
- `GET /api/v1/readiness`

Phase 2 authentication endpoints:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `POST /api/v1/companies`
- `GET /api/v1/companies/:companyId`
- `GET /api/v1/customers`
- `POST /api/v1/customers`
- `GET /api/v1/customers/:customerId`
- `PATCH /api/v1/customers/:customerId`
- `DELETE /api/v1/customers/:customerId`
- `POST /api/v1/customers/:customerId/addresses`
- `GET /api/v1/jobs`
- `POST /api/v1/jobs`
- `GET /api/v1/jobs/:jobId`
- `PATCH /api/v1/jobs/:jobId`
- `POST /api/v1/jobs/:jobId/assign`
- `POST /api/v1/jobs/:jobId/status`
- `POST /api/v1/jobs/:jobId/notes`
- `GET /api/v1/jobs/:jobId/history`
- `GET /api/v1/schedule?date=YYYY-MM-DD`
- `GET /api/v1/schedule/workload?date=YYYY-MM-DD`
- `POST /api/v1/schedule/jobs/:jobId/schedule`
- `POST /api/v1/schedule/jobs/:jobId/reschedule`

## Quality checks

Run the same checks used by CI:

```powershell
pnpm --filter backend prisma:validate
pnpm --filter backend lint
pnpm --filter backend format:check
pnpm --filter backend typecheck
pnpm --filter backend test
pnpm --filter backend build
flutter analyze
flutter test
```

The implementation sequence and product boundaries are defined in [docs/plan.md](docs/plan.md), [docs/architecture.md](docs/architecture.md), and [docs/rules.md](docs/rules.md).
