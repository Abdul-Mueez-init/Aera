# Aera Senior Developer Handoff Document

> **Audience:** Claude.ai acting as the senior developer and a junior developer implementing the work.  
> **Repository:** `https://github.com/Abdul-Mueez-init/Aera`  
> **Audit baseline:** commit `b92d2dd1d8de865ddc24051015bbc6514227ffe4` (`Phase 11 (Slice E): AI Screen Wiring`)  
> **Prepared:** 23 September 2026

## 1. Mission

You are taking over Aera, a Flutter mobile-first field-service operations platform for HVAC and home-service businesses. The project contains a real Flutter client and a Node.js/TypeScript/Express backend using Prisma and PostgreSQL/Supabase.

Your mission is **not** to rewrite the application or make the UI look complete through hardcoded data. Your mission is to turn the current Phase 11 prototype into a trustworthy, tested, secure, maintainable product by:

1. Restoring a deterministic and green development/CI workflow.
2. Closing authorization, tenancy, transaction, concurrency, and data-integrity gaps.
3. Completing the real customer-to-cash workflow end to end.
4. Replacing static or in-memory Flutter screens with real API-backed state.
5. Fixing navigation and API contract mismatches.
6. Completing release hardening and producing evidence for every claim.

The implementation must remain incremental. Do not combine unrelated phases into a giant generated change. Every phase must end with code, tests, documentation updates where needed, and a verification record.

## 2. Current truth about the project

Aera is a **substantial Phase 11 prototype**, not a finished product. Phases 0–11 contain meaningful implementation, but the product is not currently safe to describe as error-free, completely end to end, production-ready, or pixel-identical to the design specification.

### 2.1 What is genuinely implemented

The repository contains the following real implementation:

- Flutter application shell with Riverpod, go_router, repositories, API client, design tokens, and feature screens.
- Express 5 and TypeScript backend with versioned `/api/v1` routes.
- Prisma schema and migrations for users, companies, memberships, refresh sessions, customers, service addresses, jobs, job history, notes, photos, parts, quotes, invoices, payments, customer portal, reviews, notifications, device tokens, and AI conversations.
- Password hashing, access tokens, refresh sessions, logout/revocation primitives, memberships, roles, and invitations.
- Tenant-scoped service queries in many backend modules.
- Customer CRUD/archive/search and service addresses.
- Job CRUD, assignment, status transitions, history, notes, photos, parts, and completion summary.
- Scheduling, rescheduling, technician workload, conflict calculation, and notification publication.
- Quote creation, line items, server-side totals, sharing, customer response, and approval events.
- Invoice generation, issue, payment records, balance calculation, and payment idempotency-key requirement.
- Tokenized customer portal, customer quote response, invoice/history views, and reviews.
- Notification persistence, provider adapters, device tokens, queue abstraction, and reminder service.
- AI conversations, typed tools, role-gated access, bounded tool iterations, Gemini gateway, and AI Flutter wiring.
- CI definition, backend tests, focused integration tests, migration history, README, and engineering documentation.

### 2.2 What is not proven or is incomplete

The following claims must not be made until the relevant work is completed and verified:

- All phases are complete.
- The app is error-free.
- The customer-to-cash workflow is fully atomic and end to end.
- All authorization is current and database-backed.
- The UI is pixel-identical to the design specification.
- CI is green from a clean checkout.
- Flutter analyzer/tests pass.
- Offline synchronization is implemented.
- Notifications, SMS, email, push, and Gemini work without external configuration.
- Phase 12 hardening is complete.
- Phase 13 pilot readiness is complete.

## 3. Non-negotiable engineering rules

Claude and the junior developer must follow these rules for every change.

### 3.1 Before coding

1. Read the relevant files, tests, schema, migration history, API contract, and design requirements.
2. State assumptions explicitly.
3. Identify database, API, authorization, UI, migration, and test side effects.
4. Define the smallest coherent change.
5. Define the acceptance criteria before implementation.
6. Determine whether a migration is required.

### 3.2 During coding

- Do not rewrite unrelated files.
- Do not delete or weaken tests to make the suite pass.
- Do not replace real backend behavior with mocks unless the mock is explicitly marked as test-only.
- Do not introduce hardcoded production data into screens.
- Do not trust client-provided `companyId`, role, ownership, storage keys, invoice totals, or status permissions.
- Do not put business logic in Flutter widgets or Express controllers.
- Do not use `any` unless the exception is isolated, justified, and documented.
- Do not store money in floating-point values.
- Do not perform external financial side effects inside a database transaction without an idempotent design.
- Do not add a migration that is not committed with the code that depends on it.
- Do not expose secrets, refresh tokens, service-role keys, password values, or stack traces.

### 3.3 After coding

Every completed slice must run the relevant commands and report:

- Files changed.
- Database migrations added.
- Authorization implications.
- Tests added or updated.
- Commands executed.
- Exact pass/fail output.
- Remaining risks.

A feature is not complete because it compiles. It is complete only when requirements, API, persistence, authorization, UI states, tests, and verification are aligned.

## 4. Phase status baseline

| Phase | Baseline status | Required interpretation |
|---|---|---|
| 0 — Product foundation | Implemented | Documentation and design foundation exist. Preserve these documents as the source of truth. |
| 1 — Monorepo/backend skeleton | Substantial but not green | Backend/app skeleton exists, but formatting, database-backed tests, clean-checkout generation, and CI reproducibility require repair. |
| 2 — Identity and tenancy | Backend substantial; UI partial | Auth and membership backend exists. Onboarding UI is not genuinely integrated with company/team creation. |
| 3 — Customers/service locations | Substantial | Backend and Flutter customer work exists; contact preferences and Flutter execution evidence need review. |
| 4 — Jobs/status machine | Substantial but unsafe in places | Job operations exist, but authorization and tenant referential integrity require hardening. |
| 5 — Scheduling/dispatch | Substantial but concurrent writes unsafe | Scheduling exists; conflict detection needs transactional protection. Dashboard APIs are missing. |
| 6 — Technician execution | Substantial but incomplete | Execution, notes, parts, and photos exist. Offline sync and two required technician states are missing. |
| 7 — Quotes | Substantial but incomplete | Quote lifecycle exists; expiry and approval-to-job activation are incomplete. |
| 8 — Invoicing/payments | Substantial but not release-safe | Payments and invoices exist; placeholder invoices, concurrency, and completion integration require work. |
| 9 — Customer experience | Substantial | Portal and reviews exist; full approval-to-payment handoff needs proof. |
| 10 — Notifications/background jobs | Infrastructure substantial | Adapters and queue exist, but providers are conditional and the in-process queue is not durable. |
| 11 — AI assistant | Substantial but conditional | AI tools and UI exist; live provider configuration, response guarantees, and streaming/progress remain conditional. |
| 12 — Hardening/portfolio polish | Largely absent | Must be completed with executable evidence, not checklist claims. |
| 13 — Sales-ready pilot | Absent | Optional later phase; do not begin until P0/P1 reliability work is complete. |

## 5. How to work across multiple Claude sessions

Each Claude session should take **one small phase or one tightly bounded slice**. At the beginning of a new session, paste this handoff and add the current phase instruction. The developer must first inspect the repository state instead of assuming that an earlier session completed its work.

At the end of each session, create a short handoff note containing:

```text
Completed:
- ...

Files changed:
- ...

Migrations:
- ... or none

Verification:
- command: result

Known remaining risks:
- ...

Next recommended slice:
- ...
```

Do not start the next slice until the previous slice has a reproducible verification result or an explicitly documented blocker.

## 6. Recommended implementation sequence

The work is divided into small sessions below. Each session has a bounded goal, root-cause targets, debugging guidance, implementation requirements, and acceptance criteria.

---

# Phase A — Establish a clean baseline

## A1. Repository and toolchain inventory

### Goal
Confirm the actual checked-out commit, dependency versions, generated-artifact behavior, environment variables, and available local tools.

### Tasks

- Confirm `git status`, current commit, branch, and recent phase commits.
- Inspect root `pnpm-workspace.yaml`, root lockfile, `backend/package.json`, `pubspec.yaml`, `.gitignore`, `README.md`, and CI.
- Confirm Node, pnpm, TypeScript, Prisma, Flutter, and Dart versions.
- Check whether generated Prisma output exists and where the schema expects it.
- Never commit generated Prisma output if the repository deliberately ignores it; instead enforce generation in setup/build/test scripts.

### Debugging guide
If imports fail with `Cannot find module '../generated/prisma/index.js'`, inspect `backend/prisma/schema.prisma` generator output and compare it with `backend/src/db/prisma.ts`. Then run `pnpm --filter backend prisma:generate` and verify the generated path. The durable fix is to make every relevant command generate the client automatically or make CI/setup enforce the prerequisite.

### Acceptance criteria

- A clean checkout can install dependencies with the documented command.
- The generated Prisma client path is documented and automatically prepared.
- The environment prerequisites are explicit.
- No code changes are made merely to hide a missing setup step.

## A2. Make formatting and static checks green

### Root cause
`format:check` reports 61 files. A green lint result is not sufficient because formatting is a separate CI gate.

### Tasks

- Run the exact repository format check.
- Apply Prettier only to the backend files reported by the check.
- Review the diff for semantic changes.
- Run Prisma validation, generation, lint, format check, typecheck, and build again.
- If typecheck errors appear after generation, fix them at their source rather than suppressing them.

### Acceptance criteria

```text
pnpm --filter backend prisma:generate
pnpm --filter backend prisma:validate
pnpm --filter backend lint
pnpm --filter backend format:check
pnpm --filter backend typecheck
pnpm --filter backend build
```

All commands pass from a clean checkout with documented environment values.

## A3. Repair test discovery and CI database setup

### Root cause
The package test script attempts to exclude `dist/**`, but when `backend/dist` exists, Vitest still collects compiled tests. Separately, tests target localhost PostgreSQL while CI does not provide a PostgreSQL service, wait for readiness, or apply migrations.

### Tasks

- Configure Vitest with a clear project root and an explicit source-test include pattern, or otherwise guarantee that `dist` cannot be collected.
- Remove stale `dist` and rerun the test command to confirm collection behavior.
- Add a PostgreSQL service to GitHub Actions or use a controlled test database service.
- Add readiness checking.
- Apply migrations before tests.
- Use a deterministic test database lifecycle.
- Ensure tests do not silently connect to a developer’s unrelated local database.

### Debugging guide
If tests report `ECONNREFUSED ::1:5432` or `127.0.0.1:5432`, the application code may not be the root cause. First verify whether PostgreSQL is running, whether the connection URL resolves to the intended host, and whether migrations were applied. If compiled `dist/tests` appear in output, inspect Vitest’s root, include, exclude, and `tsconfig` settings.

### Acceptance criteria

- Fresh CI runner starts PostgreSQL or connects to an explicitly managed test database.
- Migrations run before database-backed tests.
- No compiled tests are collected.
- Backend tests pass from a clean checkout.
- CI and README commands match reality.

## A4. Establish the Flutter verification baseline

### Goal
Make Flutter analyzer and widget tests executable in a supported environment.

### Tasks

- Use the Flutter version declared by CI or document the required stable version.
- Run `flutter pub get`, `flutter analyze`, and `flutter test`.
- Record all analyzer/test failures before making product changes.
- Add a route smoke-test harness if practical.

### Debugging guide
If `flutter` is not found, this is an environment blocker, not proof that the Flutter code passes. Install/use the declared Flutter toolchain, then rerun. Do not mark the UI verified based only on source inspection.

### Acceptance criteria

- Flutter analyzer passes.
- Existing widget tests pass.
- The exact Flutter version is documented.
- A repeatable local/CI Flutter command exists.

---

# Phase B — Authentication and tenancy hardening

## B1. Fix access-token freshness and membership authorization

### Root cause
The current middleware validates the JWT but does not reliably consult the current refresh session, user active state, or current company membership/status. A token can therefore outlive logout, suspension, removal, or role changes until expiry.

### Tasks

- Decide on the authoritative revocation design.
- For high-risk routes, load the current session/user/membership state and reject revoked, expired, inactive, suspended, or removed principals.
- Do not trust role/company claims alone for sensitive authorization.
- Keep access-token claims minimal.
- Add tests for logout, suspension, membership removal, role downgrade, expired sessions, and cross-company access.

### Debugging guide
Start at `common/auth/auth.middleware.ts`, token creation/verification, refresh-session lookup, and membership service code. Create a test that logs in, obtains an access token, logs out or suspends membership, then calls a protected endpoint using the old access token. The expected result must be rejection according to the chosen policy.

### Acceptance criteria

- Revoked/suspended/removed identities cannot use protected operations.
- Current membership and role are evaluated for sensitive mutations.
- Tests cover tampered IDs and stale tokens.

## B2. Build a route authorization matrix

### Root cause
Several routes use `requireAuth` without sufficient function-level or assignment-level policies.

### Tasks

Create a table covering every route and principal:

| Resource/action | Owner | Dispatcher | Assigned technician | Unassigned technician | Customer/public token |
|---|---:|---:|---:|---:|---:|
| View job | yes | yes | assigned only | no | limited portal only |
| Change job status | yes | policy-defined | assigned workflow only | no | no |
| Cancel job | yes | policy-defined | no unless explicitly allowed | no | no |
| Add customer-visible note | yes | policy-defined | explicit permission | no | no |
| Invite/remove member | yes | no by default | no | no | no |
| View invoices/payments | policy-defined | policy-defined | limited | no | customer portal only |

Then implement route-specific policy functions.

### Debugging guide
Inspect `company.routes.ts`, `job.routes.ts`, route middleware order, and service authorization checks. Use direct HTTP tests with a valid token and a guessed object ID. UI visibility is not authorization.

### Acceptance criteria

- Every sensitive route has a tested policy.
- A technician cannot perform owner/dispatcher-only actions.
- A user cannot use a client-supplied company ID to bypass membership.
- Direct route access is tested without the Flutter UI.

## B3. Fix refresh rotation and invitation races

### Root cause
Refresh and invitation flows use check-then-update logic without a compare-and-set condition.

### Tasks

- Update sessions only when `revokedAt IS NULL` and the token is still valid.
- Ensure exactly one concurrent refresh request wins.
- Treat the losing request as token reuse or already-consumed session according to policy.
- Make invitation acceptance conditional on the membership still being `INVITED`.
- Add concurrent tests.

### Debugging guide
Use two concurrent requests with the same refresh token or invitation token. Inspect the number of replacement sessions/memberships created. Review Prisma update `where` clauses and transaction isolation.

### Acceptance criteria

- One refresh token produces at most one valid replacement session.
- One invitation token creates at most one accepted membership.
- Replay and concurrent-use tests pass.

---

# Phase C — Data integrity and concurrency

## C1. Enforce public quote expiry

### Root cause
Public quote lookup and response use `shareToken` but do not enforce `expiresAt`.

### Tasks

- Reject expired quotes on read and response.
- Decide whether to persist `EXPIRED` lazily or through a scheduled process.
- Do not reveal internal quote data after expiry.
- Add tests around exact expiry boundaries and timezone behavior.

### Debugging guide
Inspect `quote.service.ts` public lookup and response methods. Create a quote with an expiry in the past and call both public endpoints. The correct result must be a stable public error.

### Acceptance criteria

- Expired links cannot expose, approve, or decline quotes.
- Valid links work before expiry.
- Tests cover timezone and boundary cases.

## C2. Make quote approval advance the linked job

### Root cause
Approval records the quote decision but does not update the linked job or activate the next workflow state.

### Tasks

- Define the state transition: for example, `QUOTING → SCHEDULED` only when a schedule exists, or `QUOTING → NEW/approved-ready` when scheduling is a later action.
- Keep quote update, approval event, and job transition in one transaction when they must succeed together.
- Prevent duplicate approval events and repeated transitions.
- Add authorization for public and staff approval paths.

### Debugging guide
Inspect `quote.service.ts` approval transaction and the job status machine. Trace a quote with `jobId` through approval and confirm whether the job is still `QUOTING`.

### Acceptance criteria

- An approved quote remains attached to the same job.
- No duplicate job is created.
- The documented scheduling workflow is reflected in persisted state.
- Approval is idempotent and audited.

## C3. Make completion-to-invoice behavior explicit and safe

### Root cause
Job completion writes job status, completion timestamp, and history, but invoice generation is a separate operation. The documented happy path and transaction rules expect a coherent completion/invoice workflow.

### Tasks

- Decide whether completion automatically creates/updates an invoice or whether invoice creation is a separate explicit command.
- If automatic, perform dependent database writes in one transaction.
- If separate, make the state transition and invoice command idempotent and visibly connected in the UI.
- Record activity/audit events.
- Do not create a misleading `$0` invoice silently.

### Debugging guide
Inspect `job.service.ts` completion transaction and `invoice.service.ts` generation. Run completion, interrupt or fail invoice creation, and inspect whether the data is left in an ambiguous state.

### Acceptance criteria

- The customer-to-cash workflow has a defined, tested state model.
- Repeating completion or invoice commands does not duplicate financial records.
- Invoice totals are server-calculated.
- Empty/zero-value invoice cases are rejected or explicitly confirmed with a safe business rule.

## C4. Fix job and invoice number allocation

### Root cause
The application reads the latest number and adds one. Concurrent requests can generate duplicates.

### Tasks

- Prefer PostgreSQL sequences or a tenant-safe counter table with row locking.
- Preserve tenant-scoped uniqueness.
- Add retry handling for serialization/unique conflicts where appropriate.
- Add concurrent creation tests.

### Debugging guide
Search for `MAX(jobNumber)` and the invoice-number helper. Fire concurrent create requests and inspect duplicate-key errors.

### Acceptance criteria

- Concurrent job/invoice creation produces unique numbers.
- No request fails merely because another request created a record concurrently.
- Number allocation is covered by integration tests.

## C5. Make scheduling conflict detection transactional

### Root cause
Conflict detection runs before the write transaction and has no database-level protection.

### Tasks

- Decide the supported overlap rules.
- Use a transaction with appropriate locking or a PostgreSQL exclusion constraint for time ranges.
- Keep warning-only conflicts distinct from hard conflicts.
- Add concurrent schedule/reschedule tests.

### Debugging guide
Inspect `scheduling.service.ts` conflict lookup and write path. Run two overlapping schedule writes concurrently for the same technician.

### Acceptance criteria

- Hard conflicts cannot be created concurrently.
- Warnings remain visible when the business rule allows an override.
- The result is deterministic.

## C6. Strengthen tenant referential integrity

### Root cause
Many child tables store both `companyId` and a parent ID but do not use composite company-parent foreign keys. Application scoping alone is vulnerable to future mistakes.

### Tasks

- Identify all tenant-scoped parent/child relationships.
- Add composite unique keys and composite foreign keys where Prisma/PostgreSQL support is appropriate.
- Review migration impact and existing data.
- Add database-level cross-company insertion tests where possible.

### Acceptance criteria

- A child row cannot point to a parent in another company.
- The application still scopes every query by company.
- Migration and rollback impact are documented.

---

# Phase D — Financial and storage safety

## D1. Replace floating-point money calculations

### Root cause
Quote totals and related calculations use JavaScript `number` arithmetic before conversion to integer minor units.

### Tasks

- Use integer minor units for monetary values.
- Use a decimal library or exact integer/rational calculations for tax rates and fractional quantities.
- Define rounding rules in one domain module.
- Test tax, discounts, fractional quantities, large values, zero values, and currency behavior.

### Debugging guide
Inspect quote and invoice total helpers. Test values such as `0.1`, `0.2`, fractional quantities, and tax rates that produce half-cent results. Compare expected domain rounding with persisted values.

### Acceptance criteria

- No money calculation depends on IEEE-754 floating-point behavior.
- Server totals cannot be overridden by client totals.
- Invoice and quote totals are consistent.

## D2. Harden photo upload confirmation

### Root cause
Photo confirmation trusts client-supplied object key, MIME type, and size metadata.

### Tasks

- Bind presigned upload records to company, job, user, intended object key, and expiry.
- Enforce a server-generated storage prefix.
- Verify the object exists and inspect actual MIME/size where the provider supports it.
- Reject metadata for unrelated objects.
- Limit file size and accepted types.

### Debugging guide
Inspect the presign and confirm endpoints plus the Supabase storage adapter. Try confirming a different object key, wrong MIME type, and oversized metadata.

### Acceptance criteria

- A user cannot attach another company’s object.
- Object metadata is validated server-side.
- Failed/expired uploads have safe cleanup behavior.

## D3. Move external payment effects out of database transactions

### Root cause
Provider calls happen before local transaction commit. Database rollback can cause a provider action to be repeated.

### Tasks

- Define the provider contract around idempotency keys.
- Persist an operation record/outbox before invoking the provider, or use provider-first idempotent semantics with a reconciliation state machine.
- Never assume a database rollback reverses an external payment.
- Add failure/retry/reconciliation tests.

### Acceptance criteria

- Repeated requests with the same idempotency key do not create duplicate external payment operations.
- Provider failure and database failure produce recoverable states.
- Payment audit records explain the outcome.

---

# Phase E — Complete the real Flutter integration

## E1. Replace static Dashboard data

### Root cause
`DashboardScreen` contains fixed dates, KPIs, jobs, technicians, and telemetry instead of consuming dashboard APIs.

### Tasks

- Implement or mount the documented backend endpoints:
  - `GET /api/v1/dashboard/summary`
  - `GET /api/v1/dashboard/today`
  - `GET /api/v1/dashboard/alerts`
- Create typed response models and a repository/provider.
- Add loading, empty, error, retry, permission, and stale-data states.
- Select only the data required by the screen.

### Debugging guide
Search `backend/src` for dashboard routes and inspect `DashboardScreen`. If no provider/API call exists, the screen is static regardless of how polished it looks.

### Acceptance criteria

- Dashboard values come from the authenticated company.
- A second company cannot see the first company’s metrics.
- Screen states are tested without relying on hardcoded demo data.

## E2. Replace static Notifications data

### Root cause
The notifications screen displays a hardcoded list and has no complete API/provider lifecycle.

### Tasks

- Connect notification list/read/unread operations to the backend.
- Add pagination or a bounded list.
- Add loading, empty, error, retry, and unread states.
- Make notification actions navigate only to valid routes with valid IDs.

### Acceptance criteria

- Notifications reflect the current authenticated user and company.
- Mark-read behavior persists.
- Invalid or stale notification targets fail gracefully.

## E3. Make onboarding real

### Root cause
Business Basics contains hardcoded Northstar Climate Solutions data, while Team Setup stores members in memory.

### Tasks

- Use empty fields by default outside an explicit development seed mode.
- Connect company creation to the backend.
- Persist service area and services according to the chosen schema.
- Connect team invitations to the invitation API.
- Make the onboarding completion state reflect persisted records.

### Acceptance criteria

- A new user can complete onboarding from a clean account without database intervention.
- Refreshing or reopening the app does not lose onboarding progress.
- Invited members are created through the backend, not only in local state.

## E4. Fix required technician states

### Root cause
The design inventory requires Job Brief and En Route/Navigation Context, but the current implementation jumps from Technician Home into other job screens and uses customer-facing Technician Tracking for a different purpose.

### Tasks

- Decide whether these states should be separate routes or explicit states within a job flow.
- Implement the documented technician journey:
  `Technician Home → Job Brief → En Route → Work In Progress → Job Evidence → Complete Job`.
- Keep navigation context, customer address, and job status semantics clear.

### Acceptance criteria

- Every required state has a deterministic route/state transition.
- Back navigation and deep links work.
- Technician permissions are enforced server-side.

## E5. Fix route and API mismatches

### Root cause
Several callers use routes that do not match router registrations or architecture documentation.

### Known bugs

- Router registers `/technician-tracking/:token/:jobId`, but callers navigate to `/technician-tracking` without parameters.
- Job Detail directions action targets the invalid route.
- Notifications and More actions use invalid or static targets.
- Flutter scheduling repository paths differ from the architecture contract.
- Notifications calls `openEndDrawer` with a context that may not have a Scaffold ancestor and no clear drawer is present.

### Tasks

- Create one route inventory from `app_router.dart`.
- Create one API inventory from backend route mounts.
- Compare every repository call and every navigation action against those inventories.
- Add route smoke tests and repository contract tests.

### Debugging guide
For each failing navigation, print/log the exact route string and compare it to `GoRoute` declarations. For API paths, compare the repository URL with the backend router declaration and test with an HTTP request.

### Acceptance criteria

- Every primary button resolves to a valid route.
- Required route parameters are supplied by typed navigation helpers.
- Repository paths match backend paths.
- No static fake IDs are used for production actions.

## E6. Add production API configuration

### Root cause
The API client defaults to loopback HTTP addresses.

### Tasks

- Add build-time or environment-driven API base URL configuration.
- Use HTTPS for non-local environments.
- Document emulator, physical-device, web, staging, and production configuration.
- Do not put production secrets in Flutter.

### Acceptance criteria

- A physical device can connect to the configured staging API.
- Local development still works without editing source code.
- Production builds do not default to loopback HTTP.

---

# Phase F — Supabase and database hardening

## F1. Decide the database access boundary

### Current finding
The live Supabase Aera project has 24 public tables with RLS enabled but no policies. This means RLS is present but there is no explicit tenant-policy layer.

### Decision required
Choose one of these documented models:

1. **Backend-only database access:** all client access goes through the API, public database access is not part of the product boundary, and credentials/storage rules are tightly controlled.
2. **Supabase client access:** create and test tenant-aware RLS policies for every exposed table and storage bucket.

Do not leave the system in an ambiguous state.

### Acceptance criteria

- The chosen boundary is documented.
- No client can bypass the intended authorization layer.
- RLS/policy tests exist if direct access is supported.

## F2. Review unindexed foreign keys

Supabase reports 31 unindexed foreign keys. Review each against actual query patterns and add indexes where required, especially for job histories, notes, photos, parts, invoices, payments, quotes, portal tokens, notifications, and AI records.

Do not blindly add or remove indexes. Use query plans and expected access patterns.

## F3. Review storage and provider configuration

The project has no deployed Edge Functions. Storage, email, SMS, push, and Gemini are conditional on environment variables. Document which integrations are required for local development, staging, demo, and production.

A missing provider key must result in a visible, controlled status rather than a silently blank feature.

---

# Phase G — Testing and end-to-end proof

## G1. Add critical backend authorization tests

Required cases:

- Cross-company guessed customer/job/invoice ID.
- Suspended membership.
- Removed membership.
- Role downgrade while a token exists.
- Technician modifying an unassigned job.
- Technician attempting cancellation.
- Public quote after expiry.
- Replayed refresh token.
- Concurrent invitation acceptance.
- Payment above balance.
- Duplicate payment idempotency key.
- Duplicate job/invoice creation under concurrency.
- Overlapping schedule requests.

## G2. Add critical customer-to-cash integration test

The main end-to-end test must cover:

```text
Register
→ create company
→ create/invite users
→ create customer
→ add service address
→ create job
→ create quote
→ approve quote
→ schedule job
→ assign technician
→ technician starts
→ add note/photo metadata
→ complete job
→ create/issue invoice
→ record payment
→ view activity/audit
```

The test must use a deterministic database and clean up or isolate its data.

## G3. Add Flutter route and state tests

At minimum test:

- Auth return path.
- Owner onboarding path.
- Owner creates job path.
- Technician execution path.
- Customer quote approval/payment path.
- AI assistant path.
- Invalid/missing route parameters.
- Loading, empty, error, offline, and permission-denied states for API-backed screens.

## G4. Add API contract tests

For each repository endpoint, assert:

- HTTP method.
- URL path.
- Required headers.
- Request body shape.
- Response envelope handling.
- Error code handling.
- Authentication refresh behavior.

## G5. Add security and performance evidence

Before Phase 12 is marked complete, produce:

- Authorization test report.
- Dependency audit.
- API load smoke results.
- Query-plan review for important list/dashboard endpoints.
- Flutter profile-mode smoke results.
- Crash/error reporting verification.
- Accessibility checklist.
- Clean-checkout setup result.

---

# Phase H — Release hardening and pilot readiness

## H1. Phase 12 hardening

Implement and verify:

- Performance profiling.
- API load smoke tests.
- Security review.
- Crash/error reporting.
- Loading, empty, error, offline, and permission states.
- Accessibility pass.
- Animation and interaction polish.
- Deterministic demo seed data.
- Polished README.
- Architecture diagram.
- Short demo video.
- API documentation snapshot.
- Authorization/security proof.
- Performance proof.

Each item must have an artifact, test, screenshot, log, or committed document.

## H2. Phase 13 pilot features

Only after Phase 12 is genuinely green, consider:

- Company branding.
- Plan/feature flags.
- Persistent onboarding checklist.
- Export/reporting.
- Support/contact flow.
- Customer-specific deployment configuration.

## 7. Suggested session order

Use one Claude account session per item below. A session may be shorter, but it should not silently combine separate items.

| Session | Scope | Main output |
|---|---|---|
| 1 | A1 repository/toolchain inventory | Baseline note and setup corrections |
| 2 | A2 formatting/static checks | Green formatting/type/build gate |
| 3 | A3 test discovery and CI PostgreSQL | Reproducible backend test pipeline |
| 4 | A4 Flutter toolchain/analyzer baseline | Verified Flutter baseline |
| 5 | B1 access-token freshness | Current-session authorization and tests |
| 6 | B2 function-level authorization | Route policy matrix and tests |
| 7 | B3 refresh/invitation races | Compare-and-set logic and concurrency tests |
| 8 | C1 quote expiry and approval flow | Safe quote lifecycle |
| 9 | C2 completion/invoice workflow | Defined atomic/idempotent customer-to-cash path |
| 10 | C3 numbering and scheduling concurrency | Safe allocators and overlap protection |
| 11 | C4 tenant referential integrity | Composite constraints/migration/tests |
| 12 | D1 money calculations | Exact financial arithmetic |
| 13 | D2 photo/storage security | Validated upload lifecycle |
| 14 | D3 payment provider safety | Idempotent external payment workflow |
| 15 | E1 dashboard integration | Real dashboard APIs/providers/states |
| 16 | E2 notifications integration | Real notification screen and actions |
| 17 | E3 onboarding integration | Real company/team onboarding |
| 18 | E4 technician journey | Job Brief and En Route flow |
| 19 | E5 route/API contract repair | Route matrix and smoke tests |
| 20 | E6 production API configuration | Environment-driven deployment config |
| 21 | F1 Supabase access boundary | Documented backend-only or RLS model |
| 22 | F2 indexes/provider review | Database/performance cleanup |
| 23 | G1 authorization tests | Security regression suite |
| 24 | G2 customer-to-cash test | Critical end-to-end proof |
| 25 | G3/G4 Flutter/API contract tests | Client integration proof |
| 26 | G5 Phase 12 evidence | Security/performance/release artifacts |
| 27 | H1 hardening completion | Release candidate checklist |
| 28 | H2 optional pilot work | Phase 13 features only if justified |

## 8. Definition of done for every session

A session is complete only when all applicable conditions are true:

- The code follows the documented architecture.
- Business logic is server-side.
- Authorization is explicit and tested.
- Tenant scoping is preserved.
- Database changes have migrations.
- API contracts are consistent with Flutter callers.
- UI has loading, empty, error, and permission behavior where applicable.
- Tests cover the new behavior and important failure cases.
- Formatting, lint, typecheck, and relevant tests pass.
- No secrets or production credentials were added.
- The final response states changed files, commands, results, and remaining risks.

## 9. Final release gate

Do not call Aera release-ready until the following are all true:

```text
[ ] Clean checkout setup succeeds.
[ ] Prisma generation is automatic and deterministic.
[ ] Format check passes.
[ ] Lint passes.
[ ] Typecheck passes.
[ ] Backend build passes.
[ ] PostgreSQL-backed tests pass in CI.
[ ] Flutter analyze passes.
[ ] Flutter tests pass.
[ ] Critical authorization tests pass.
[ ] Cross-company access is rejected.
[ ] Current membership/revocation behavior is verified.
[ ] Quote expiry is enforced.
[ ] Refresh/invitation races are controlled.
[ ] Job/invoice numbering is concurrency-safe.
[ ] Scheduling conflicts are transactionally safe.
[ ] Money arithmetic is exact.
[ ] Completion-to-invoice behavior is explicit and tested.
[ ] Payment idempotency and provider failure recovery are tested.
[ ] Dashboard is API-backed.
[ ] Notifications are API-backed.
[ ] Onboarding persists real records.
[ ] Technician journey is complete.
[ ] All primary routes resolve.
[ ] Production API URL is environment-driven and HTTPS.
[ ] Supabase access boundary is documented and tested.
[ ] Important foreign keys/indexes are reviewed.
[ ] Loading/empty/error/offline/permission states exist.
[ ] Performance/security/accessibility evidence exists.
[ ] Demo data and clean-checkout demo are deterministic.
```

## 10. Truthful project description until completion

Until the release gate passes, use this description:

> Aera is a Flutter and Node.js/TypeScript field-service operations prototype with a Prisma/PostgreSQL backend. It contains substantial authentication, multi-tenancy, customers, jobs, scheduling, technician execution, quotes, invoicing, customer portal, notifications, and AI-assistant slices through Phase 11. Release hardening, complete end-to-end verification, and several UI/integration flows remain in progress.

Do not claim that all 13 phases are complete, that the app is error-free, that the UI is identical to the design, or that the customer-to-cash workflow is fully production-safe until the evidence above exists.

## 11. Primary reference documents

- `docs/context.md` — product vision, personas, principles, and success criteria.
- `docs/PRD.md` — functional requirements, invariants, and prioritization.
- `docs/plan.md` — phases, exit criteria, sequencing, and demo workflow.
- `docs/architecture.md` — architecture, API contract, tenancy, authorization, and transactions.
- `docs/schema.md` — proposed relational model and integrity rules.
- `docs/ERD.md` — logical entity relationships.
- `docs/design.md` — design tokens, screen inventory, journeys, and visual language.
- `docs/rules.md` — engineering rules, QA gates, security checklist, and definition of done.

## 12. Senior developer instruction to Claude

Work as a cautious senior engineer, not as a code generator. Inspect first. Make one coherent change at a time. Prefer explicit tests over assumptions. If a requirement conflicts with the existing implementation, stop and state the conflict before choosing a design. If an external provider or local tool is unavailable, report the blocker instead of simulating success. Preserve the project’s architecture and improve its evidence until a new developer can clone the repository, run the documented commands, execute the critical workflow, and trust the result.
