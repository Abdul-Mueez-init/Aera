# Aera — Engineering Handoff (Phase 0 → Phase 9)

**For:** the next AI coding session picking up this repository.
**Repo:** `github.com/Abdul-Mueez-init/Aera`
**Source of truth docs:** `docs/architecture.md`, `docs/plan.md`, `docs/schema.md`, `docs/PRD.md`, `docs/rules.md`, `docs/design.md`, `docs/context.md`, `docs/ERD.md` — read these before touching code. This handoff summarizes *actual repo state as verified by direct inspection* (cloned repo, ran lint/typecheck, checked the live Supabase project) as of the phase-0→9 window. It does not replace those docs — it tells you where reality currently diverges from them.

## How to use this document

For each phase: what's **done** (verified in code), what's **remaining** (verified absent), and concrete next steps. Work phases roughly in order — don't jump ahead to Phase 6+ gaps before closing out the Phase 1–3 wiring gaps, since later phases depend on the state-management/repository layer that Phase 1 hasn't finished.

Before writing any code, follow the existing project protocol in `docs/rules.md`:
1. Inspect the relevant files first — this repo already has real conventions, don't reinvent them.
2. State your plan (files touched, DB/API changes, auth implications) before implementing.
3. Change no more than 6–7 files per batch.
4. Every tenant-scoped query must filter by `companyId` — copy the existing pattern (see Phase 2 below).
5. Multi-write actions need `prisma.$transaction(...)` — copy the existing pattern (see Phase 4/8).
6. Don't add new libraries or change architecture without flagging it explicitly.

---

## Phase 0 — Product foundation

**Status: ✅ Complete.**

- All planning docs exist in `docs/`: architecture, plan, schema, ERD, context, PRD, rules, design.
- ADRs are recorded in `architecture.md`. Design tokens are recorded in `design.md`.

**Remaining:** none. Nothing to do here — just treat `docs/` as binding.

---

## Phase 1 — Monorepo + backend skeleton

**Status: ✅ Backend done. ⚠️ Flutter shell exists but has no state layer.**

Done:
- pnpm workspace, Flutter app shell (`lib/main.dart` + `go_router` config in `lib/core/router/app_router.dart`).
- Express 5 backend (`backend/src/app.ts`): strict TypeScript, Zod validation, Pino logging with request-ID + duration on every request, centralized error handler (`backend/src/common/errors.ts`), `/health`, `/api/v1/health`, `/api/v1/readiness` (checks DB with `SELECT 1`).
- Prisma schema + 10 migrations under `backend/prisma/migrations/`.
- CI (`.github/workflows/ci.yml`) runs `prisma:generate`, `prisma:validate`, `lint`, `format:check`, `typecheck`, `test`, `build` for the backend, and `flutter analyze` + `flutter test` for the app — both jobs are wired.

Remaining:
- `architecture.md` specifies **Riverpod** for app state. `pubspec.yaml` currently only has `http`, `go_router`, `google_fonts`, `intl` — no state management package at all.
- No repository/data-source layer between screens and the API. Every screen in `lib/features/**` currently renders static/hardcoded data — grep confirms zero `http.get/post` calls anywhere under `lib/features/`.
- There are four **orphaned** top-level files that already contain real API-client code but are imported nowhere: `lib/quotes.dart`, `lib/invoices.dart`, `lib/technician_execution.dart`, `lib/customer_portal.dart`. These are a head start, not dead weight — treat them as drafts for the repository layer, not code to delete.

How to proceed:
1. Add `flutter_riverpod` to `pubspec.yaml`, wrap `AeraApp` in a `ProviderScope` in `main.dart`.
2. Create `lib/core/network/api_client.dart` (a single shared HTTP client with base URL + auth header injection + token refresh handling) — don't let every feature open its own `http` client.
3. For each feature, add `lib/features/<name>/data/<name>_repository.dart` that wraps the corresponding backend routes. Reuse the models/logic already written in the four orphaned files above instead of rewriting them — move, don't duplicate.
4. Add Riverpod providers per feature exposing loading/data/error state, and wire one screen end-to-end (recommend starting with `customers_screen.dart`, it's the smallest surface) as the reference pattern before repeating it across the rest.
5. Do not invent new endpoints — match `backend/src/modules/*/*.routes.ts` exactly. If a screen needs data with no matching endpoint, flag it instead of guessing a shape.

---

## Phase 2 — Identity + tenancy

**Status: 🟡 Backend auth is solid. Team/invite management and verification tests are missing.**

Done:
- `backend/src/modules/auth`: register, login, refresh, logout, `/me`.
- Password hashing is real scrypt (salted, timing-safe compare) in `backend/src/common/auth/password.ts` — not a placeholder.
- JWT access tokens signed with `jose`; refresh sessions stored **hashed** in the `RefreshSession` table with rotation and revocation (`auth.service.ts`: `rotateRefreshSession`, `revokeRefreshSession`).
- Company creation (`POST /api/v1/companies`) creates the owner membership in the same transaction.
- `requireAuth` / `requireRole` middleware (`backend/src/common/auth/auth.middleware.ts`) is used consistently across modules.
- Verified tenant-scoping pattern: every service checked (`jobs`, `customers`, `invoices`) queries with `where: { id, companyId: context.companyId }`. This is the correct, safe pattern from `architecture.md` §5 — it's actually followed, not just documented.

Remaining:
- No member management endpoints. `architecture.md` §3 specifies `GET /companies/:companyId/members`, `POST /companies/:companyId/invitations`, `PATCH/DELETE /companies/:companyId/members/:memberId` — none exist in `company.routes.ts`. The schema (`CompanyMember`, `CompanyMemberStatus`) already supports it.
- No automated test proves the Phase 2 exit criterion ("a user cannot access another company's record using a guessed ID"). The 4 existing `auth.test.ts` cases only check hashing/token signing/unauthenticated rejection — none simulate two real companies and attempt cross-tenant access.
- No rate limiting on `/auth/login` or `/auth/register` (required by `rules.md` §6).

How to proceed:
1. Add `member.service.ts` under `backend/src/modules/companies/` (currently all logic is inline in `company.routes.ts` — extract it, following the `service.ts` pattern used by every other module).
2. Implement invite creation (generate a token, store it, expose an accept endpoint) and member list/patch/delete, all requiring `OWNER` role via `requireRole`.
3. Add `backend/tests/tenancy.test.ts`: seed two companies with users via the real registration flow, create a job/customer under company A, then attempt to fetch/mutate it as an authenticated user from company B — assert `404`/`RESOURCE_NOT_FOUND` (per the taxonomy in `architecture.md` §11, not a raw 500).
4. Add `express-rate-limit` (or equivalent) scoped only to the auth routes — don't rate-limit the whole app.

---

## Phase 3 — Customers

**Status: 🟡 Backend complete. Flutter screens are static.**

Done:
- Full CRUD + archive + search (`?search=`) + service addresses (`POST /:customerId/addresses`) in `backend/src/modules/customers/customer.routes.ts`.
- Flutter screens exist and visually match `design.md`: `customers_screen.dart`, `customer_detail_screen.dart`, `create_customer_screen.dart`.

Remaining:
- `architecture.md` §4 lists `GET /customers/:customerId/jobs` (recent jobs on the customer detail screen) — **this endpoint does not exist**. Confirmed absent from `customer.routes.ts`.
- No screen is wired to the API (see Phase 1).
- No pagination controls in `customers_screen.dart` even though the backend supports `page`/`pageSize`.

How to proceed:
1. Add `GET /customers/:customerId/jobs` to `customer.routes.ts` + `customer.service.ts`, scoped by `companyId`, paginated, reusing the job-listing query shape already in `job.service.ts`.
2. Wire `customers_screen.dart` and `customer_detail_screen.dart` to the real API using the Phase 1 repository pattern. Add loading/empty/error states — don't ship a spinner-less screen (`rules.md` Definition of Done).
3. Add infinite-scroll or page controls to the customers list once wired.

---

## Phase 4 — Jobs

**Status: 🟡 Backend state machine is strong. Photo upload flow is incomplete. Flutter is static.**

Done:
- Jobs CRUD, tenant-scoped job numbering (via `aggregate` max in `job.service.ts`), full status state machine matching `architecture.md` §8 exactly (`transitions` map in `job.service.ts`), transactional status-history writes on every transition, assignment, notes, parts, `/complete` command, `/history` endpoint.
- `jobs_screen.dart`, `job_detail_screen.dart`, `create_job_screen.dart`, `schedule_job_screen.dart` exist as static UI.

Remaining:
- `architecture.md` §5 specifies `POST /jobs/:jobId/photos/presign` (get a presigned upload URL, then upload directly to object storage). What actually exists is `POST /jobs/:jobId/photos`, which just **accepts an already-known `objectKey`** — there is no presign step and no object-storage adapter anywhere in `backend/src/` (confirmed: no storage/S3/Supabase-Storage module exists). A client has nowhere to actually get a real object key from today.
- No screens are wired to the API.

How to proceed:
1. Decide the storage backend (Supabase Storage is already provisioned for this project — simplest path, per `architecture.md` §2). Add `backend/src/common/storage/` with a small adapter that generates a signed upload URL for a given `companyId`/`jobId`/content type.
2. Add `POST /jobs/:jobId/photos/presign` returning `{ uploadUrl, objectKey }`. Keep the existing `POST /jobs/:jobId/photos` as the "confirm metadata after upload" step — don't remove it, that part is correct per `schema.md` (DB stores object keys, not binaries).
3. Wire job list/detail/create/schedule screens to the API using the Phase 1 pattern.

---

## Phase 5 — Scheduling/dispatch

**Status: 🟡 Backend complete with conflict detection. Flutter calendar is static.**

Done:
- `GET /schedule`, `GET /schedule/workload`, `POST /schedule/jobs/:jobId/schedule`, `POST /schedule/jobs/:jobId/reschedule` in `scheduling.routes.ts`/`scheduling.service.ts`, including real conflict-detection logic.
- `calendar_screen.dart` exists as static UI.

Remaining:
- Notification-on-reassign is not implemented — `notification.port.ts` is an interface only, no concrete adapter (this is really a Phase 10 dependency; see below).
- Calendar screen has no drag/reschedule interaction and isn't wired to the API.

How to proceed:
1. Don't block this phase waiting on full Phase 10 — implement a minimal concrete `notification.port.ts` adapter now (even just structured logging or an in-app notification row written to the `notifications` table) so scheduling changes have somewhere to publish to, per ADR-009 (must not block the request).
2. Wire `calendar_screen.dart` to `GET /schedule`; implement the reschedule interaction against `POST /schedule/jobs/:jobId/reschedule`.

---

## Phase 6 — Technician execution

**Status: ❌ This is the biggest real gap in the project.**

Done:
- Backend is fully built: `GET /jobs/today`, `POST /jobs/:jobId/status`, `/notes`, `/parts`, `/photos`, `/complete` all exist and work per the state machine.

Remaining (the important part):
- **Zero technician-facing screens exist anywhere** — not in the Stitch export, not in `lib/features/`. Design batch 5 (Technician Home, Job Brief, En Route, Work In Progress, Job Evidence, Complete Job) has never been generated or built.
- `lib/technician_execution.dart` is a complete, well-written API client (models + `HttpTechnicianExecutionApi`) — but it is imported **nowhere**. It's not in the router, not referenced by any screen. It's a solid starting point, not integrated code.
- No offline draft/sync-queue capability (a stated V1 requirement in `PRD.md` §E) — not expected yet, just don't forget it's still outstanding.

How to proceed:
1. This phase needs new screens designed before (or alongside) building them — generate Stitch Batch 5 (`design.md` §"Stitch batching") using the existing design system so it stays visually consistent with the rest of the app, or hand-build them directly in Flutter following `design.md`'s technician-controls guidance (large one-thumb primary actions) if you want to skip a Stitch round-trip.
2. Create `lib/features/technician/` with the 6 screens. Move `lib/technician_execution.dart` into `lib/features/technician/data/technician_repository.dart`, wrap it with Riverpod providers per the Phase 1 pattern — don't rewrite the API client from scratch, it already matches the backend contract.
3. Add routes in `lib/core/router/app_router.dart` for the technician flow, and gate them by role (technician) once role-aware navigation exists.
4. Leave the offline sync queue for a later pass — note it explicitly as deferred rather than silently skipping it.

---

## Phase 7 — Quotes

**Status: 🟡 Backend implements a public share-token flow only. Flutter is static.**

Done:
- Quote CRUD, send, and a public share-token flow: `GET /quotes/shared/:shareToken`, `POST /quotes/shared/:shareToken/respond` (action `APPROVED`/`DECLINED`), backed by a `QuoteApprovalEvent` audit table.
- `quotes_screen.dart`, `quote_detail_screen.dart`, `create_quote_screen.dart`, `quote_approval_screen.dart` exist as static UI.

Remaining:
- `architecture.md` §7 lists distinct staff-facing `POST /quotes/:quoteId/approve` / `/decline` endpoints — these do not exist. Only the customer-facing share-token path can approve/decline a quote today. If the product needs staff to record an approval taken over the phone, that path is missing.
- No test confirms that approving a quote actually activates its linked job (`quote.jobId`) as `PRD.md`/`plan.md` require ("approved quote can flow into scheduling/job execution without duplicate records").
- Screens aren't wired to the API.

How to proceed:
1. Confirm with the product docs/owner whether staff-recorded approval is actually needed for MVP — if yes, add the two endpoints reusing the existing approval-event logic in `quote.service.ts`; if the share-token flow is the intended sole channel, just note that explicitly instead of leaving it ambiguous.
2. Add an integration test: create job → quote → approve via share token → assert the linked job transitions correctly and an invoice can subsequently be generated from it.
3. Wire the quote screens to the API.

---

## Phase 8 — Invoicing/payments

**Status: ✅ Backend is strong. Flutter is static. Behavior is unverified by tests.**

Done:
- `POST /invoices/from-job/:jobId`, `POST /:invoiceId/issue`, `POST /:invoiceId/payments` (Idempotency-Key header is required and enforced, returns `422` if missing), `GET /:invoiceId/payments`. Real `prisma.$transaction` usage in `invoice.service.ts` for multi-write operations.
- `invoices_screen.dart`, `create_invoice_screen.dart`, `invoice_payment_screen.dart` exist as static UI.

Remaining:
- No test proves the idempotency key actually prevents a duplicate payment on retry — the 4 existing invoice tests only check auth boundaries, not this behavior.
- No test proves invoice totals (`subtotal - discount + tax = total`) or that overpayment is rejected, both explicit invariants in `PRD.md` §7.
- PDF/receipt generation is intentionally deferred per `plan.md` — not a real gap yet, leave it for Phase 12.
- Screens aren't wired to the API.

How to proceed:
1. Add `backend/tests/invoices.behavior.test.ts` against a real (test) database: generate an invoice, issue it, record a payment with a given `Idempotency-Key`, retry the identical request, assert the second call returns the same result rather than creating a second payment. Also assert overpayment is rejected.
2. Wire invoice screens to the API using the Phase 1 pattern.

---

## Phase 9 — Customer experience

**Status: 🟡 Backend portal exists. The core landing screen and Flutter wiring are missing.**

Done:
- `CustomerPortalToken` + `CustomerReview` models, `portal.routes.ts`: `GET /:token` (fetch a snapshot), `POST /:token/reviews` (submit a review). `portal.test.ts` confirms staff-authenticated portal-access creation is enforced.
- `lib/customer_portal.dart` is a complete, unwired API client (appointments, quotes, invoices, history models).
- `technician_tracking_screen.dart`, `quote_approval_screen.dart`, `invoice_payment_screen.dart` exist as static UI and cover 3 of the 4 planned customer screens.

Remaining:
- **"Customer Home" (design.md screen #32) doesn't exist anywhere** — no portal landing/appointment-overview screen has been designed or built. Without it, a customer has no entry point into the other three screens.
- `lib/customer_portal.dart` isn't wired to any screen or route.
- Confirm where a portal token actually gets issued to a customer in practice (e.g., automatically when a quote is sent or an invoice is issued) — `portal.test.ts` only proves the creation endpoint is auth-gated, not that anything currently calls it from the quote/invoice flow.

How to proceed:
1. Design and build the Customer Home screen (a quick Stitch generation matching the existing design system, or a direct Flutter build) as the landing point for a portal-token deep link.
2. Move `lib/customer_portal.dart` into `lib/features/customer_portal/data/`, wrap with Riverpod, and wire it plus the three existing static screens into a small token-based route group in `app_router.dart` — this flow is unauthenticated-by-login (token-based), so keep it outside the normal authenticated route tree.
3. Wire an actual trigger for portal-token issuance — most naturally when a quote is sent (`POST /quotes/:quoteId/send`) or an invoice is issued (`POST /invoices/:invoiceId/issue`) — so a real token reaches a real customer instead of only being creatable by a manual staff call.

---

## Suggested order of attack

Don't parallelize all of the above. Recommended sequence, respecting the 6–7-file batch rule in `rules.md`:

1. **Phase 1 wiring foundation** — Riverpod + shared API client + one reference screen wired end-to-end (Customers is the smallest surface).
2. **Phase 2 gaps** — member/invite endpoints + the tenancy test. Do this early: everything downstream assumes correct roles/membership.
3. **Wire remaining static screens** (Phases 3, 4, 5, 7, 8 Flutter sides) one feature at a time, reusing the Phase 1 pattern — these are mostly mechanical once the pattern exists.
4. **Phase 4 photo presign + storage adapter** — needed before Phase 6 can actually upload evidence photos.
5. **Phase 6 technician flow** — the biggest single lift; design + build + wire.
6. **Phase 9 Customer Home + portal wiring** — smaller, can slot in alongside Phase 6.

Only after Phase 0–9 are actually closed should Phase 10 (notifications), 11 (AI), and 12 (hardening) start — building on top of an unwired UI or a missing tenancy test will just mean redoing work later.
