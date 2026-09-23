# Aera Repository Audit Report

**Repository:** [Abdul-Mueez-init/Aera][1]  
**Audited commit:** `b92d2dd1d8de865ddc24051015bbc6514227ffe4` (`Phase 11 (Slice E): AI Screen Wiring`)  
**Audit date:** 23 September 2026  
**Scope:** `/docs` specifications, Flutter client, Node.js/TypeScript backend, Prisma migrations, tests, CI, and the connected Supabase project named **Aera**.

## Executive conclusion

Aera is a **genuine, substantial backend-backed prototype through Phase 11**. The repository is not merely a static UI mock: it contains real Express modules, Prisma schema and migrations, tenant-scoped services, authentication primitives, job state transitions, quotes, invoices, customer portal behavior, notification abstractions, AI tools, and focused backend tests. The commit history corroborates incremental phase-labelled implementation through Phase 11.

However, the project cannot currently be described as **error-free, completely end to end, production-ready, or pixel-identical to the design specification**. The highest-impact blockers are:

1. **The backend quality gate is not reproducibly green.** The format check fails across 61 files. Tests require PostgreSQL, but CI does not provision PostgreSQL or apply migrations. A stale `backend/dist` directory also causes Vitest to collect compiled tests despite the configured exclusion.
2. **Several security and correctness invariants are incomplete.** Access-token authorization does not re-check current session or membership state. Public quote expiry is not enforced. Multiple sensitive job operations lack function-level authorization. Refresh rotation and invitation acceptance have race conditions.
3. **The core workflow is not fully atomic.** Completing a job does not create or update an invoice in the same transaction, and quote approval does not advance the linked job into the scheduling workflow.
4. **Important Flutter screens are hardcoded or partially wired.** The dashboard, notifications, and parts of onboarding are static or in-memory. Two required technician states are not distinct screens. Several navigation targets are invalid or missing required parameters.
5. **Phase 12 and Phase 13 evidence is largely absent.** There is no committed proof of performance profiling, load smoke tests, crash reporting, accessibility review, deterministic demo data, portfolio proof, branding/feature flags, exports, or pilot-readiness work.
6. **The live Supabase project is structurally present but not fully hardened.** It has the expected business tables and migrations, but all 24 public tables have RLS enabled without policies, and Supabase reports 31 unindexed foreign keys.

The appropriate status is therefore: **substantial implementation, high-risk pre-release prototype; do not claim complete end-to-end readiness until the blockers below are resolved and independently demonstrated.**

## Phase status matrix

| Phase | Status | Finding |
|---|---|---|
| 0 — Product foundation | **Implemented** | The repository contains the product context, PRD, architecture, schema, ERD, design system, rules, plan, environment template, and CI definition. |
| 1 — Monorepo/backend skeleton | **Substantial but not verified green** | Flutter shell, Express/TypeScript, strict configuration, Zod request validation, Pino logging, error handling, versioned routes, Prisma, migrations, health/readiness, and CI exist. The format gate fails, tests need an undeclared PostgreSQL service, and clean-checkout verification is incomplete. |
| 2 — Identity and tenancy | **Backend substantial; UI onboarding partial** | Registration, password hashing, JWTs, refresh sessions, logout/revocation, companies, memberships, roles, invitations, and tenancy tests exist. Onboarding screens use hardcoded business data and an in-memory team list instead of completing the backend workflow. |
| 3 — Customers and service locations | **Substantial** | CRUD/archive, search, addresses, customer detail/history, Flutter repositories/providers/screens, migrations, and tests exist. Contact-preference coverage and executable Flutter verification remain incomplete. |
| 4 — Jobs and status machine | **Substantial but not fully safe** | CRUD, job numbers, assignment, status validation, history, notes, photos, parts, completion, screens, and tests exist. Function-level authorization and cross-tenant referential integrity need strengthening. |
| 5 — Scheduling/dispatch | **Substantial** | Schedule, workload, schedule/reschedule, reassignment, conflict calculation, notification publication, and Flutter calendar integration exist. Conflict detection is vulnerable to concurrent writes, and the documented dashboard APIs are absent. |
| 6 — Technician execution | **Substantial but incomplete** | Today view, execution states, notes, parts, photo presign/confirmation, completion summary, image picker, and UI/tests exist. Offline draft/sync is not evidenced, photo confirmation trusts client metadata, and the required Job Brief and En Route states are not separate screens. |
| 7 — Quotes | **Substantial but incomplete** | Server-side totals, lifecycle, share/respond, approval events, existing-job linkage, UI, and tests exist. Expired public quote links remain usable, and approval does not activate or advance the linked job. |
| 8 — Invoicing/payments | **Substantial but not release-safe** | Invoice generation, states, integer minor-unit fields, payment records, balance updates, idempotency key requirement, uniqueness constraints, UI, and tests exist. A `$0` placeholder invoice path remains exposed, invoice numbering is concurrency-sensitive, and completion does not atomically create/update an invoice. |
| 9 — Customer experience | **Substantial** | Tokenized portal, appointment/quote/invoice/history views, public quote response, reviews, migrations, screens, and tests exist. The approval-to-payment handoff is not fully demonstrated. |
| 10 — Notifications/background jobs | **Infrastructure substantial; live delivery conditional** | Persistence, queue abstraction, retry behavior, provider adapters, device tokens, reminders, migrations, and tests exist. The in-process queue is not durable across restarts or multiple instances, and provider delivery is skipped when credentials are absent. |
| 11 — AI assistant | **Substantial but conditional** | Conversations, messages, typed authorized tools, company/role gating, bounded iterations, Gemini gateway, graceful failure handling, UI, migrations, and tests exist. Without `GEMINI_API_KEY`, the feature can return no assistant answer; streaming/progress and live-provider verification are not demonstrated. |
| 12 — Hardening and portfolio polish | **Largely absent** | No committed evidence of performance/load testing, security review report, crash reporting, accessibility pass, systematic state QA, deterministic seed data, demo video, API documentation snapshot, or portfolio proof. |
| 13 — Sales-ready pilot | **Absent** | No evidence of branding, plan/feature flags, persistent onboarding checklist, export/reporting, support flow, or customer-specific deployment configuration. |

## Documentation-to-code assessment

The `/docs` folder is coherent and unusually detailed. The PRD, architecture, schema, design system, ERD, rules, and phase plan establish clear ownership and define the intended customer-to-cash lifecycle. The implementation follows the intended stack and has a credible phase-labelled Git history through Phase 11.

The principal documentation problem is not that the specifications are missing. It is that several documents describe **target behavior that the current code has not yet reached**. Examples include dashboard endpoints, atomic completion-to-invoice behavior, approved-quote workflow activation, offline synchronization, current-membership authorization, and Phase 12 release evidence. These should be labelled as “planned” or “partially implemented” until verified by executable tests and a clean demo workflow.

## Backend and security findings

### Release-blocking findings

**Stale access tokens remain authorized.** The authentication middleware verifies the JWT but does not re-check the refresh session, `User.isActive`, or current `CompanyMember.status`. A logged-out, suspended, removed, or role-demoted user may continue using an access token until it expires. This conflicts with the architecture requirement that each request resolve current membership and evaluate authorization against the database record.

**Function-level authorization is incomplete.** Several routes require authentication but not the more specific policy expected for the operation. The members list is available to any authenticated role. Job status, photo presign/confirm, parts, notes, and completion operations do not consistently enforce assignment or role rules. A technician may be able to perform operations such as cancellation or choose customer-visible note visibility without the required policy check.

**Expired public quotes remain usable.** Public quote lookup and response use the share token but do not reject an expired `expiresAt` value. An expired quote link can therefore disclose or approve/decline a quote after its intended lifetime.

**Refresh rotation has a race condition.** Two concurrent requests can both read an unrevoked session before either update commits, producing multiple replacement sessions. Invitation acceptance has a similar check-then-update race.

**Payment provider work occurs inside the database transaction.** If a real provider succeeds and the database transaction later rolls back, a retry may repeat the external payment action. Provider calls should be coordinated through an idempotent external operation or an outbox/workflow design rather than being treated as an ordinary transaction-local write.

**Job and invoice numbering are concurrency-sensitive.** Both use “read the latest value, then add one” application logic. Concurrent requests can calculate the same number and fail on the unique constraint instead of retrying through a safe sequence or serialized allocator.

**Scheduling conflict detection is check-then-write.** Conflict checks occur before the write transaction and are not protected by a database exclusion constraint or lock. Two concurrent scheduling requests can both pass the warning check and create an overlap.

**Tenant referential integrity is incomplete.** Many child tables contain both `companyId` and a parent ID but do not use composite foreign keys tying the parent to the same company. Application filtering is helpful, but database constraints should prevent cross-company parent references even if a future code path or privileged writer is faulty.

### Important medium-risk findings

Photo confirmation trusts client-supplied `objectKey`, MIME type, and size metadata after checking job access. It does not prove that the object was uploaded through the server-issued signed URL or that its storage prefix and actual object properties match the request.

Money calculations use JavaScript `number` arithmetic before conversion to `BigInt`/integer database fields. Fractional quantities, tax calculations, and rounding should use a decimal or integer-safe strategy throughout the calculation path.

Invitation creation returns the raw invitation token in the authenticated API response as a temporary stand-in. This should be replaced with a notification/outbox flow before real use.

CORS is configured without an allowlist. The documented security rules require an explicit allowlist for production deployments.

Several collection paths are not bounded or violate the intended N+1 discipline. Day schedule and job detail relationship collections need explicit limits or a deliberate pagination strategy, and technician workload currently performs one count query per technician.

There is no clear activity/audit module covering all critical mutations such as assignment, member role changes, customer edits, invoice issuance, and payments, despite the rules requiring immutable audit events.

## Flutter/UI findings

### Coverage

The app contains broad screen coverage and 41 files matching the `*screen.dart`/`*page.dart` naming patterns. The design specification targets 40 inventory screens. Source inspection maps approximately 38 inventory entries to implemented screens, with `Edit Customer` and `More` as extras.

The design tokens are broadly aligned by code evidence: warm off-white canvas, white surfaces, deep teal accent, semantic colors, Inter typography, a 4px spacing rhythm, and the documented corner radii are present. However, **pixel identity cannot be certified from source inspection**. No reference screenshots, running Flutter environment, or image comparison was available in this audit.

### Missing or incomplete journeys

The required technician journey is incomplete because there is no distinct Job Brief screen and no distinct En Route/Navigation Context screen. Technician Home moves directly into a job detail flow, while Technician Tracking is a customer-facing tokenized route rather than the technician’s navigation state.

The owner onboarding flow is visually present but not end to end. Business Basics contains hardcoded Northstar Climate Solutions data, and Team Setup maintains an in-memory member list. These screens can look complete without creating the company, service area, services, or invitations in the backend.

The Dashboard is static: its date, greeting, KPIs, jobs, technicians, and telemetry are embedded in the widget rather than loaded from the documented dashboard endpoints. The Notifications screen similarly contains a hardcoded list and has no provider, refresh, loading, error, or empty state.

The invoices UI explicitly exposes a `$0` placeholder invoice when there is no approved quote or logged parts. The UI warns that manual review is required, but a production-safe workflow should prevent or require explicit confirmation before creating a financially misleading invoice.

### Navigation and integration bugs

The router registers `/technician-tracking/:token/:jobId`, but several screens navigate to `/technician-tracking` without the required parameters. This affects the job-detail directions action and notification/more navigation and will produce an unmatched route.

The notifications screen calls `Scaffold.of(context).openEndDrawer()` using an outer context and has no clearly evidenced end drawer. The action may throw a Scaffold-ancestor error or open nothing.

The Flutter repository calls scheduling paths under `/api/v1/schedule/jobs/:jobId/...`, while the architecture document lists `/api/v1/jobs/:jobId/schedule` and `/api/v1/jobs/:jobId/reschedule`. The code and contract need one authoritative path, with integration tests covering it.

The API client defaults to loopback HTTP addresses: `127.0.0.1:4000` for web/desktop/iOS-like environments and `10.0.2.2:4000` for an Android emulator. No production HTTPS configuration or build-time environment override is evidenced, so a deployed device will not reach a remote API by default.

Authentication forms contain prefilled demo-looking credentials and password values. These should be removed from production form defaults and replaced with an explicit development-only seed/demo mode.

## Supabase audit

The connected Supabase project is **Aera**, project reference `bagrszakjvgmkyvanjce`, status `ACTIVE_HEALTHY`, region `ap-southeast-1`.

The live database contains the expected relational surface, including users, companies, memberships, refresh sessions, customers, service addresses, jobs, status history, notes, photos, parts, quotes, quote items, approval events, invoices, invoice items, payments, portal tokens, customer reviews, notifications, device tokens, and AI conversation/message tables. The live project reports 9 applied migrations through the AI conversation migration and no deployed Edge Functions.

Supabase security advisors report **24 tables with RLS enabled but no policies**. This has two important interpretations:

- The app’s server-side Prisma path may still function because it uses server credentials and application-level authorization.
- Direct access through a publishable/anonymous Supabase client is not explicitly protected by tenant-aware policies. If any client, storage path, future Edge Function, or accidental credential exposure uses the public database API, the intended authorization model is not represented at the database policy layer.

This should be resolved deliberately. Either keep the database private behind the backend and document that boundary, or add tested RLS policies for every exposed table and storage bucket. Do not treat “RLS enabled” alone as a complete security implementation.

Supabase performance advisors report **31 unindexed foreign keys**. Many are relationship columns used by job history, notes, photos, parts, quotes, invoices, payments, portal tokens, notifications, and AI records. The project is currently empty, so unused-index findings are not meaningful evidence of a problem yet; the unindexed-FK findings are actionable schema hygiene and should be reviewed alongside real query plans.

## Reproducible verification results

| Check | Result | Interpretation |
|---|---|---|
| `prisma generate` | Passed | The generated client can be created, but it is ignored and not enforced by a pre-test/pre-build hook. |
| `prisma validate` | Passed with supplied placeholder environment | The initial documented invocation needs the required `DIRECT_URL`; without it, validation fails. |
| ESLint | Passed | Static linting is currently green. |
| TypeScript typecheck/build | Passed after client generation in the clean quality run | Static compilation is not the main remaining blocker after generation; it must be rerun from a clean checkout as part of CI. |
| Prettier `format:check` | Failed | 61 files were reported with formatting issues. This violates the documented Phase 1 gate. |
| Backend tests with stale `dist` present | Failed: 17 suites, 1 passed | Vitest collected compiled `dist/tests` despite `--exclude dist/**`; imports failed because the compiled output referenced a missing generated module. |
| Backend tests after removing `dist` | Failed: 12 suites failed, 6 passed; 73 tests failed, 48 passed | Tests attempted PostgreSQL at localhost but no database service was running. The failures included connection refusals and resulting HTTP 500 responses. |
| Flutter analyze/test | Not runnable in audit environment | `flutter` was not installed. CI has a Flutter job, but its success was not independently verified here. |
| Secret grep | No committed production secret found | The matches were placeholders, test values, or ordinary variable names; `.env` is not tracked. |

The CI workflow itself is incomplete as an end-to-end quality gate. It sets `DATABASE_URL` and `DIRECT_URL` to localhost but does not declare a PostgreSQL service, start a container, apply migrations, or wait for readiness. A green CI definition is not evidence of a green CI run.

## Priority remediation plan

### P0 — Before calling the app complete or demo-safe

1. **Make CI reproducible.** Add a PostgreSQL service/container, health/readiness wait, migration deployment, deterministic test database lifecycle, and explicit cleanup. Fix Vitest root/exclude behavior so `dist` cannot be collected.
2. **Make the quality gate green.** Run `format:check`, correct the reported files, add a pretest/prebuild Prisma generation step, and verify the full sequence from a clean checkout.
3. **Fix authorization freshness.** Re-check session revocation, user activity, membership status, and current role for sensitive operations, or use a short-lived access-token model with an explicit revocation strategy and tests.
4. **Add policy-level authorization.** Create a route-by-route matrix for owner, dispatcher, technician, and customer/public-token access. Enforce assignment and mutation permissions server-side.
5. **Enforce quote expiry and concurrency safety.** Reject expired quote links; use compare-and-set updates for refresh/invitation flows; use database sequences or serialized allocators for job/invoice numbers; protect scheduling conflicts transactionally.
6. **Correct the core workflow.** Decide whether completion creates an invoice or calls a separate idempotent command, then test the full sequence: company → customer → quote → approval → schedule → technician execution → completion → invoice → payment → activity.
7. **Remove invalid routes and reconcile API paths.** Add route-matrix tests covering every `go_router` destination and every repository endpoint.

### P1 — Before pilot or portfolio claims

1. Replace dashboard, notifications, and onboarding hardcoded data with real repositories/providers and complete loading, empty, error, offline, and permission states.
2. Add distinct Job Brief and En Route states or explicitly revise the design inventory and journey documentation.
3. Replace placeholder `$0` invoice creation with server-side validation and an explicit, safe business rule.
4. Add offline draft/sync behavior or mark it clearly as future scope.
5. Add image upload validation, storage-prefix enforcement, signed-upload confirmation, and object inspection.
6. Add audit events for critical mutations and review composite tenant-parent foreign keys.
7. Add RLS policies if direct Supabase access is intended; otherwise document and enforce the backend-only database boundary. Add the missing FK indexes after reviewing query plans.
8. Add environment-driven API base URLs with HTTPS production defaults and a documented physical-device setup.

### P2 — Phase 12/13 completion

Add performance profiling, API load smoke tests, crash/error reporting, accessibility review, deterministic demo seed data, API documentation, screenshots/video, custom branding, feature flags, exports, support flow, and a clean-checkout demo script. Each item should have a committed artifact or executable check rather than only a checklist entry.

## What should be stated publicly or in a portfolio description

A truthful description would be:

> “Aera is a Flutter and Node.js/TypeScript field-service operations prototype with a Prisma/PostgreSQL backend. The implementation covers substantial authentication, multi-tenancy, customers, jobs, scheduling, technician execution, quotes, invoicing, customer portal, notifications, and AI-assistant slices through Phase 11. Release hardening, complete end-to-end verification, and several UI/integration flows remain in progress.”

Avoid claiming that all 13 phases are complete, that the product is error-free, that the UI is identical to the design, or that the customer-to-cash workflow is fully production-safe. The codebase is credible and worth continuing, but the remaining issues are architectural and security-relevant rather than cosmetic.

## References

[1]: https://github.com/Abdul-Mueez-init/Aera "Aera GitHub repository"
[2]: https://github.com/Abdul-Mueez-init/Aera/blob/main/docs/plan.md "Aera development, demo, and release plan"
[3]: https://github.com/Abdul-Mueez-init/Aera/blob/main/docs/architecture.md "Aera architecture and API contract"
[4]: https://github.com/Abdul-Mueez-init/Aera/blob/main/docs/design.md "Aera design system and screen inventory"
[5]: https://github.com/Abdul-Mueez-init/Aera/blob/main/docs/rules.md "Aera engineering rules and QA gates"
[6]: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy "Supabase RLS enabled without policies advisory"
[7]: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys "Supabase unindexed foreign keys advisory"
