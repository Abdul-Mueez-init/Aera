# Aera — Deep Project Context

> **Status:** Reviewed and verified against the repo on 2026-10-25 (spot-checked: 32 Prisma models, 17 enums, 26 migrations, 45 backend test files, Android applicationId). Prepared by Muse (Moiz's AI agent) from a full inspection of this repo; Moiz also keeps a local master copy with his agent.
> **Still pending:** Live Supabase connection (needs Moiz's project access via secure entry — see §8 questions) and Moiz's answers on AWS deployment details. The database picture in §6 is the repo-side truth from Prisma, which is the schema the live DB was migrated from.

> **Purpose:** A single, evidence-based understanding of what Aera is, how it is built, and where it stands — so no future development decision is made blind.
> **Source:** Full inspection of repo `Abdul-Mueez-init/Aera`.
> **Commit inspected:** HEAD is `29ae8f9` ("Worked on customer portal"), authored **Sunday 2026-10-25 02:56 PKT** (2026-10-24T21:56:27Z) — verified directly from GitHub `list_commits` and a fresh `git fetch` on 2026-10-25 (local HEAD == origin/main, nothing newer). It sits one commit ahead of `708fc12` ("Fix app bar navigation and responsive onboarding layout", 2026-10-23 01:23 PKT). The extra commit is material — it adds the portal access-grant / handshake system — so this document describes `29ae8f9`. **Correction note:** Muse initially misreported this commit's date as "Oct 22" in chat by reading UTC/search timestamps as local dates; the document itself was always based on `29ae8f9`. Dates in this document are PKT unless marked Z.
> **Conventions:** Claims cite repo file paths. Statements marked **[Inference]** are reasoned conclusions, not directly documented. Statements marked **[User-provided]** come from Moiz, not from the repo. No secret values appear in this document — env vars are listed by name only (`.env.example` files contain placeholders only, verified in `.env.example` and `backend/.env.example`).

---

## 1. Product vision, promise, target customer, problem, personas

**Vision** (`docs/context.md` §1): "Build a premium, fast, mobile-first field-service operating system that lets a small HVAC/service company run the entire customer-to-cash workflow from one place." It must feel like "a polished commercial product, not a portfolio CRUD demo."

**Product promise** (`docs/context.md` §4):

> "From the first service request to the final payment, every job has one source of truth."

**What it is** (`README.md`, `docs/PRD.md` §1): Aera is a multi-tenant SaaS for field-service businesses. Flutter is the primary client; a custom Node.js/TypeScript REST API owns auth, authorization, business rules, persistence, automation and integrations — the client is never the authority.

**Primary ICP** (`docs/context.md` §2): Small-to-mid-sized HVAC, appliance repair, plumbing, electrical, cleaning, pest-control and similar service businesses with:

- 2–25 technicians
- One owner/manager or a small dispatch team
- Repeated inbound service requests
- Manual scheduling via calls, WhatsApp/SMS, spreadsheets or paper
- Quotes/invoices handled separately from scheduling

**First niche** (`docs/context.md` §2): **HVAC companies**, explicitly for portfolio/demo first. "Do not broaden the UX language to every possible trade during MVP. Build the product as an HVAC-first solution with a domain model that can generalize later."

**Problem** (`docs/context.md` §3): Service businesses lose time/money when customer info, appointments, technician status, job evidence, quoting, invoicing and follow-up live in disconnected tools. Four failure modes to reduce: (1) missed/forgotten requests, (2) scheduling/dispatch confusion, (3) poor visibility into field work, (4) slow payment collection and weak follow-up.

**Personas** (`docs/context.md` §6, `docs/PRD.md` §2):

| Persona | Wants |
|---|---|
| Owner | Revenue visibility, fewer missed jobs, faster payments, confidence technicians are doing the work; creates company, invites team, sees schedule/workload, issues invoices, asks AI operational questions |
| Dispatcher / Office Manager | Reliable day schedule, quick reassignment, customer context, clear job status; identifies overdue/unassigned jobs; reschedules without losing history |
| Technician | Frictionless mobile workflow: today's jobs, navigation, customer instructions, notes, photos, parts, completion |
| Customer | Clear appointment info, technician status, quote approval/decline, invoice/payment state, service history, leave a review after completed work |

**Success criteria** (`docs/context.md` §10): A demo user completes, with no manual DB intervention: *Create company → create users → create customer → create job → quote → approve quote → schedule → assign technician → technician starts → add note/photo → complete job → issue invoice → record payment → view activity.*

**"Wow" moments the product is designed around** (`docs/context.md` §9): request→job in a few taps; reschedule in office instantly visible to technician; technician opens job and sees customer + HVAC problem + notes + location; before/after evidence captured in-flow; completing a job generates/updates invoice workflow; owner asks AI "Which jobs are at risk today?" and gets data-backed answers; customer gets a clean appointment/status experience.

---

## 2. Core customer-to-cash workflow and job lifecycle

**Canonical workflow** (`docs/context.md` §5):

```text
Lead → Customer → Quote (optional) → Approved → Appointment → Dispatch
→ Technician starts job → Notes / parts / photos → Job completed
→ Invoice → Payment → Review / follow-up
```

**Job lifecycle / status machine** — enum `JobStatus` in `backend/prisma/schema.prisma`, diagrammed in `docs/architecture.md` §8 and `docs/architecture_diagram.md`:

```text
NEW → QUOTING → SCHEDULED → EN_ROUTE → IN_PROGRESS ⇄ WAITING_PARTS → COMPLETED
NEW → SCHEDULED (direct schedule, no quote)
Any active state → CANCELLED (subject to permission)
```

Rules evidenced in code (`backend/src/modules/jobs/job.policy.ts`):

- **Technicians** (and only their *assigned* jobs) may make field transitions only: `SCHEDULED → EN_ROUTE`, `EN_ROUTE → IN_PROGRESS`, `IN_PROGRESS → WAITING_PARTS`, `WAITING_PARTS → IN_PROGRESS`. Technicians can never cancel a job, and cannot create customer-visible notes.
- Office roles (OWNER/DISPATCHER) drive the rest of the machine **[Inference: from the technician-only restriction table in `job.policy.ts`; office transitions are validated in `job.service.ts`]**.
- Every transition writes a `JobStatusHistory` row (actor, from/to status, reason, timestamp) — `backend/prisma/schema.prisma` model `JobStatusHistory`.

**Quote lifecycle** (enum `QuoteStatus`, `backend/prisma/schema.prisma`): `DRAFT → SENT → APPROVED | DECLINED | EXPIRED`. Approval/decline is recorded as immutable `QuoteApprovalEvent` rows with actor and source. An approved quote stays attached to its existing job and scheduling continues that job — no duplicate job is created (`docs/architecture.md`, API contract §7).

**Invoice lifecycle** (enum `InvoiceStatus`): `DRAFT → ISSUED → PARTIALLY_PAID → PAID`, plus `VOID` and `OVERDUE`. Payments are recorded against invoices with an `Idempotency-Key`; invoice generation is unique per (company, job) (`@@unique([companyId, jobId])` on `Invoice`).

**Completion → invoice coupling:** Job completion and invoice creation/update are a documented transaction boundary (`docs/architecture.md` §9, `docs/rules.md` §7), and there is a dedicated test: `backend/tests/completion-invoice-lifecycle.test.ts`.

**Portal handshake (newest mechanic):** When a job is `EN_ROUTE`, the customer can verify a handshake code derived for that job (`backend/src/modules/portal/portal-handshake.service.ts`). Max 5 failed attempts (`HANDSHAKE_MAX_ATTEMPTS`), then a 15-minute lockout (`HANDSHAKE_LOCK_MINUTES`); verification state lives on the `Job` model (`handshakeVersion`, `handshakeFailedAttempts`, `handshakeLockedUntil`, `handshakeVerifiedAt`). **[Inference: this is an arrival/identity verification between customer and technician at the door.]**

---

## 3. Feature inventory — Flutter features and backend modules, with maturity

Maturity signals used: `docs/plan.md` phase list (Phases 0–12 product build, Phase 13 optional pilot), `README.md` release status ("Phase H1 / Phase 12 Hardening — 100% complete"), the later audit-remediation docs `docs/phase_1…3_*.md`, `docs/bug_fixes_implementation_report.md`, test counts (45 backend test files in `backend/tests/`, 23 Flutter test files in `test/`), and the code itself.

> ⚠️ **Two different "phase" numberings exist and must not be confused:**
> 1. `docs/plan.md` Phases 0–13 = the original product build sequence.
> 2. `docs/phase_1_baseline…`, `phase_2_release_readiness…`, `phase_3_access_control…` (all dated 2026-10-09) = a **later audit-remediation series** with its own Phases 1–6, of which only 1–3 have completion docs in the repo. Its Phases 4 (financial concurrency), 5 (storage/scalability) and 6 (Flutter lifecycle) have **no completion docs** — see §10.

### 3a. Flutter features (`lib/features/*`, `lib/core/*`)

App entry/structure: `lib/main.dart` (Sentry bootstrap, Riverpod `ProviderScope`, `MaterialApp.router`), `lib/core/router/app_router.dart` + `app_scaffold.dart` + `route_guard.dart`, `lib/core/network/api_client.dart`, `lib/core/config/app_config.dart`, design tokens in `lib/core/theme/` (colors/radii/spacing/typography/theme), shared widgets in `lib/core/widgets/`.

The app has **two build surfaces** (`lib/core/config/app_config.dart`, `APP_SURFACE` dart-define): `staff` (owner/dispatcher/technician app) and `customer` (customer-facing web portal build).

| Feature folder | What it does | Maturity evidence |
|---|---|---|
| `lib/features/auth/` | Splash, welcome, login, sign-up, forgot/reset password, accept-invitation; `auth_repository.dart`, `session_store.dart` (secure storage) | Complete screens for all 6 auth states in `docs/design.md` inventory; backend auth tests extensive |
| `lib/features/onboarding/` | Business Basics, Service Area (OSM map + zones), Services, Team Setup, Onboarding Complete; `onboarding_repository.dart` | Backed by 11 onboarding routes (`backend/src/modules/companies/onboarding.routes.ts`) and `Company` onboarding fields in Prisma; recent commits actively fixing this area (OSM migration, service-area tiles) |
| `lib/features/dashboard/` | Owner/dispatcher dashboard + "Get Started" checklist (`get_started_provider.dart`, `widgets/get_started_checklist.dart`) | Backed by `dashboard` backend module (summary/today/alerts per `docs/architecture.md`) |
| `lib/features/customers/` | Customers list, create/edit, customer detail | Full CRUD UI + repository/provider pattern |
| `lib/features/jobs/` | Jobs list, create job, schedule job, job detail (incl. technician assignment) | Core module; assignment loading-state bug fixed in `docs/bug_fixes_implementation_report.md` |
| `lib/features/calendar/` | Day schedule view (`calendar_repository.dart`, `calendar_provider.dart`) | Backed by backend `scheduling` module |
| `lib/features/technician/` | Technician Home, Job Brief, En Route, Work In Progress, Job Evidence (photos), Complete Job; `technician_repository.dart` | Full 6-screen flow per `docs/design.md`; photo upload via presigned URLs |
| `lib/features/field/` | Single screen: `technician_tracking_screen.dart` | **[Inference: thin/customer-side tracking surface — only one file, far less developed than `technician/`]** |
| `lib/features/quotes/` | Quotes list, create quote, quote detail, quote approval screen; staff `quotes_repository.dart`, public `public_quote_repository.dart` + provider for shared-link approval | Server-authoritative totals; client preview explicitly labelled "approximate" (bug-fix report) |
| `lib/features/invoices/` | Invoices list, create invoice, invoice detail, invoice payment screen | Backed by invoices + payments backend logic |
| `lib/features/portal/` | Customer home (`customer_home_screen.dart`), `portal_repository.dart`, `portal_provider.dart` | Customer surface; newest backend work (see portal module below) landed in HEAD commit `29ae8f9` |
| `lib/features/ai/` | AI Operations Assistant chat screen + AI Insight Detail screen; `ai_repository.dart`, `ai_provider.dart`, `ai_message_bubble.dart` | Backed by backend AI module with authorized tools (§3b) |
| `lib/features/settings/` | Company settings, profile settings, team management, notifications settings; company/members/notifications repositories | — |
| `lib/features/team/` | Team screen + `team_provider.dart` (overlaps settings/team management) | **[Inference: possibly legacy/parallel to `settings/team_management_screen.dart` — worth confirming before building on it]** |
| `lib/features/more/` | Single "More" screen (tab overflow/settings entry) | — |

Design target was 40 screens/states (`docs/design.md`); the folder/screen inventory above maps closely to that inventory.

### 3b. Backend modules (`backend/src/modules/*`, mounted in `backend/src/app.ts` under `/api/v1`)

| Module | Routes file(s) / key services | What it does |
|---|---|---|
| `auth` | `auth.routes.ts` (8 routes), `auth.service.ts`, `password-reset.service.ts` | Register/login/refresh/logout/me, rotating refresh sessions, single-use HMAC-hashed password-reset codes with attempt cap (`PasswordResetToken`) |
| `companies` | `company.routes.ts` (10), `onboarding.routes.ts` (11), `member.service.ts`, `osm-geo.service.ts` | Company creation, memberships/invitations, onboarding profile (services catalog `CompanyService`, service zones `CompanyServiceZone`), OSM geocoding/neighborhood discovery for service areas |
| `customers` | `customer.routes.ts` (8), `customer.service.ts` | Customer CRUD/archive, search, multiple service addresses, customer detail with history, portal-access issuance |
| `dashboard` | `dashboard.routes.ts` (3), `dashboard.service.ts` | Summary/today/alerts aggregates (today's jobs, jobs by status, unassigned, outstanding invoices, revenue this month per `docs/PRD.md` §4) |
| `jobs` | `job.routes.ts` (13), `job.service.ts`, `job.policy.ts` | Job CRUD, tenant-scoped job numbers (`CompanyCounter`), assignment, status-machine commands, notes (INTERNAL/CUSTOMER visibility), photo presign/confirm, parts, completion, status history |
| `scheduling` | `scheduling.routes.ts` (4), `scheduling.service.ts` | Day schedule, technician workload, schedule/reschedule commands |
| `quotes` | `quote.routes.ts` (5), `quote.service.ts` | Quote editor logic, line items, tax (bps)/discount, server-side totals, send/share via `shareToken`, public approve/decline with approval events |
| `invoices` | `invoice.routes.ts` (6), `invoice.service.ts`, `invoice-reminder.service.ts` | Invoice generation (unique per job), issue, payments, balance math in integer minor units (`backend/src/common/money/money.service.ts`), scheduled overdue-reminder sweep (in-process scheduler started in `backend/src/server.ts`) |
| `payments` | `payment-operation.service.ts`, `payment.port.ts` — **no routes file** | Payment provider abstraction. Only provider implemented is `manualPaymentProvider` (records a payment, returns no provider id). `PaymentOperation` model tracks PENDING → PROCESSING → PROVIDER_ACCEPTED → COMPLETED / FAILED with retry count and ledger link. **[Evidenced: no Stripe or any real gateway is integrated — payments today are manual records.]** |
| `portal` | `portal.routes.ts` (7), `portal-staff.routes.ts` (6), `portal.service.ts`, `portal.grants.ts`, `portal.session.ts`, `portal.tokens.ts`, `portal.middleware.ts`, `portal-delivery.service.ts`, `portal-handshake.service.ts`, `portal-sweep.service.ts`, `portal.contacts.ts` | Customer portal: per-job access grants (hashed link tokens, expiry, consumption), portal sessions (hashed tokens, idle/max lifetimes), handshake verification, audit events, automatic grant deactivation sweep (completed/cancelled/max-age/unused). Also legacy `CustomerPortalToken` (30-day customer-scoped token per `docs/architecture.md`). This is the **newest and largest recent change** (HEAD commit `29ae8f9`, migration `20261022204225_add_portal_access_grants_and_handshake`) |
| `notifications` | `notification.routes.ts` (6), `notification.service.ts`, `device-token.service.ts`, adapters: `resend-email.adapter.ts`, `fcm-push.adapter.ts`, `textbee-sms.adapter.ts`; ports: `email.port.ts`, `push.port.ts`, `sms.port.ts`, `notification.port.ts`; templates/messages: `email-templates.ts`, `push-messages.ts`, `sms-messages.ts` | In-app notifications (`Notification` model) + device tokens for push; three outbound channels behind adapters, each **optional** — blank API key = sends skipped with a one-time log warning (`backend/.env.example`) |
| `ai` | `ai.routes.ts` (4), `ai.service.ts`, `gateway/ai-gateway.service.ts`, `gateway/gemini.client.ts`, tools: `business-metrics.tool.ts`, `customer-history.tool.ts`, `jobs-at-risk.tool.ts`, `schedule-workload.tool.ts` | Conversational AI operations assistant. Conversations/messages persisted (`AiConversation`/`AiMessage`). The model only calls 4 typed, company-scoped, server-authorized tools: `get_business_metrics`, `get_customer_job_history`, `get_jobs_at_risk`, `get_schedule_workload`. Max tool iterations capped (`AI_MAX_TOOL_ITERATIONS`, default 4) |

**Shared backend infrastructure** (`backend/src/common/`, `config/`, `queue/`, `db/`): auth middleware + JWT/password/token helpers (`common/auth/`), company counter service for tenant-scoped numbering (`common/counters/counter.service.ts`), money service, Pino logger, Sentry observability with URL/token redaction (`common/observability.ts`, `src/instrument.ts`), rate limiting (`common/rateLimit.ts`), storage port + Supabase adapter (`common/storage/`), Zod-validated env (`config/env.ts`), Prisma client (`db/prisma.ts`), and a queue port with an **in-process, in-memory, bounded (default max 1000) FIFO adapter** (`queue/in-process-queue.adapter.ts`) — explicitly non-durable; Redis/BullMQ is the documented future swap.

**Tests:** 45 backend test files (`backend/tests/`) covering auth, tenancy, critical authorization, customer-to-cash integration, payment idempotency/reconciliation, portal security/handshake, scheduling concurrency, AI gateway/tools, production config, etc. 23 Flutter widget/unit test files (`test/`).

---

## 4. Tech stack

| Layer | Stack (evidence) |
|---|---|
| Mobile/web client | Flutter, Dart `^3.12.2` (`pubspec.yaml`); Riverpod 2.6 (`flutter_riverpod`, `riverpod_annotation`), go_router 14, `http`, `shared_preferences` + `flutter_secure_storage` (session in platform keystore), `image_picker`, `flutter_map` + `latlong2` + `geolocator`, `url_launcher`, `google_fonts`, `intl` |
| Backend | Node.js 22 LTS, TypeScript strict, Express 5 (`backend/package.json`: express ^5.2.1), Zod 4, Pino logging, Helmet, CORS, express-rate-limit, `jose` (JWT), `tsx` runtime (server runs TS directly — `backend/package.json` `start` script; no compiled-JS deploy), Vitest + Supertest |
| Database | PostgreSQL hosted by Supabase **[User-provided + repo: `README.md` prerequisites "A Supabase project with PostgreSQL enabled"]**, accessed **only** via Prisma 7.10 (`@prisma/client`, `@prisma/adapter-pg`, `pg`) with pooled `DATABASE_URL` + direct `DIRECT_URL` |
| Auth | Custom JWT access tokens (default TTL 900s) + rotating, revocable, server-side refresh sessions (30 days); password hashing in `backend/src/common/auth/password.ts`. **Not** Supabase Auth — `docs/architecture_diagram.md` shows a "Supabase Auth" box, but the code implements its own auth; the diagram is outdated on this point **[Inference from `backend/src/modules/auth/*` + `common/auth/*`]** |
| Storage | Supabase Storage, private bucket `job-photos` (JPEG/PNG/WebP, max 10 MB per `docs/supabase_rls_decision.md`), presigned upload URLs (2h TTL, `backend/src/common/storage/supabase-storage.adapter.ts`), metadata in `JobPhoto`/`PresignedUpload` tables |
| Notifications | In-app notifications + Firebase Cloud Messaging (HTTP v1, service-account env vars, hand-rolled adapter — no `firebase-admin` dep), Resend (email), TextBee (SMS via an Android phone gateway) |
| Payments | Manual recording only; provider interface (`payment.port.ts`) ready for Stripe/regional processor later (`docs/PRD.md` §F). No gateway integrated |
| AI | Google Gemini via REST (`generativelanguage.googleapis.com/v1beta`), default model `gemini-3.1-flash-lite` (`GEMINI_MODEL` in `backend/.env.example`, `backend/src/modules/ai/gateway/gemini.client.ts`) |
| Maps / geo | OpenStreetMap stack — **Google Maps was removed** (commit `f497168`): `flutter_map` tiles (OSM tile server default), Nominatim geocoding, Overpass API neighborhood discovery (`backend/src/modules/companies/osm-geo.service.ts`, `docs/onboarding_google_maps_setup.md`) |
| Monitoring | Sentry — `@sentry/node` (backend) + `sentry_flutter`/`sentry_dart_plugin` (app), org `student-cj9`, project `aera` (`pubspec.yaml`); PII/token redaction rules in `README.md` "Error Reporting" |
| CI | GitHub Actions (`.github/workflows/ci.yml`) — see §8 |

---

## 5. Architecture — how the pieces fit, and the tenancy model

**Shape:** Modular monolith (ADR-001, `docs/architecture.md`): one deployable Node backend, strict internal modules, one PostgreSQL database. No microservices.

```text
Flutter app (staff surface) ──┐
Flutter web (customer surface) ┴→ HTTPS REST /api/v1 → Express API
   → auth middleware → module routes → services (business rules + authorization)
   → Prisma → PostgreSQL (Supabase-hosted)
   → Supabase Storage (job photos, presigned URLs)
   → in-process queue → Resend (email) / FCM (push) / TextBee (SMS)
   → AI gateway → Gemini (model can only call authorized tools)
   → OSM Nominatim / Overpass (geocoding, service areas)
```

Key architectural commitments (`docs/architecture.md` ADRs 001–010):

- **Server-authoritative:** Flutter is never authoritative for money, permissions, workflow transitions or tenant scope (ADR-006). Money is integer minor units + currency code everywhere (ADR-007). Photos live in object storage, only metadata/keys in Postgres (ADR-008). Non-critical side effects are async via a queue abstraction (ADR-009). AI is a tool caller, never an authority and never gets DB credentials (ADR-010).
- **API conventions:** versioned `/api/v1`, envelope `{ data, meta }`, errors `{ error: { code, message }, requestId }` with a stable error taxonomy (`AUTH_*`, `TENANT_ACCESS_DENIED`, `JOB_INVALID_STATUS_TRANSITION`, `QUOTE_ALREADY_DECIDED`, `PAYMENT_DUPLICATE`, …), `Idempotency-Key` required for payment mutations.
- **Transactions** for multi-write actions: quote approval + job activation; job completion + invoice creation; payment + balance update; company creation + owner membership; invite acceptance + membership (`docs/architecture.md` §9).

**Multi-tenancy / company model:**

- `Company` is the tenant boundary; **every** business record carries `companyId`, even when inferable from a parent (`docs/schema.md` §4, `backend/prisma/schema.prisma` — visible on every model).
- Request flow: access token → user id → company membership → role → companyId. Services must require `companyId` explicitly; a client-supplied companyId is never trusted (`docs/architecture.md` §5).
- Users and companies are many-to-many via `CompanyMember` (role + status). Roles: `OWNER`, `DISPATCHER`, `TECHNICIAN` (enum `CompanyMemberRole`); membership status: `INVITED`, `ACTIVE`, `SUSPENDED`. RBAC plus ownership/assignment checks — e.g. technicians see only assigned jobs and get field-redacted responses (no customer email/phone, no invoice amounts) per `docs/phase_3_access_control_privacy_completion.md`.
- Tenant-scoped sequential numbering (job numbers, invoice numbers) via `CompanyCounter` (`backend/src/common/counters/counter.service.ts`), with a concurrency test (`backend/tests/number-allocation-concurrency.test.ts`).

**Supabase's actual role (important):** Supabase is used as (a) managed Postgres host and (b) Storage — **not** as an app-facing BaaS. There is no direct Supabase client access from Flutter; the backend connects with the service-role key; authorization lives entirely in the API layer. This is a deliberate, documented decision (`docs/supabase_rls_decision.md`, 2026-10-09): RLS is enabled on only 5 of 28 public tables with **zero policies**, because there is no direct client access to defend; RLS must be revisited if direct Supabase client access is ever introduced.

---

## 6. Database — the repo-side picture of the Supabase Postgres DB

Source: `backend/prisma/schema.prisma` (authoritative over the older blueprint in `docs/schema.md` and `docs/ERD.md`). 26 migrations in `backend/prisma/migrations/` (2026-09-08 `init` → 2026-10-22 portal grants/handshake). All PKs are UUIDs; money is `BigInt` minor units + `Char(3)` currency; timestamps are UTC.

**Enums (17):** `CompanyMemberRole` (OWNER/DISPATCHER/TECHNICIAN), `CompanyMemberStatus` (INVITED/ACTIVE/SUSPENDED), `CustomerStatus` (ACTIVE/ARCHIVED), `JobPriority` (LOW/NORMAL/HIGH/URGENT), `JobStatus` (NEW/QUOTING/SCHEDULED/EN_ROUTE/IN_PROGRESS/WAITING_PARTS/COMPLETED/CANCELLED), `JobNoteVisibility` (INTERNAL/CUSTOMER), `JobPhotoKind` (BEFORE/AFTER/OTHER), `QuoteStatus` (DRAFT/SENT/APPROVED/DECLINED/EXPIRED), `QuoteApprovalAction`, `InvoiceStatus` (DRAFT/ISSUED/PARTIALLY_PAID/PAID/VOID/OVERDUE), `PaymentMethod` (CASH/CARD/BANK_TRANSFER/OTHER), `NotificationType` (JOB_SCHEDULED, JOB_RESCHEDULED, JOB_ASSIGNED, QUOTE_SENT, QUOTE_APPROVED, QUOTE_DECLINED, INVOICE_ISSUED, INVOICE_PAYMENT_REMINDER), `DeviceTokenPlatform` (ANDROID/IOS/WEB), `AiMessageRole` (USER/ASSISTANT/TOOL), `PaymentOperationStatus` (PENDING/PROCESSING/PROVIDER_ACCEPTED/COMPLETED/FAILED), `PortalGrantStatus` (ACTIVE/DEACTIVATED), `PortalDeactivationReason` (AUTO_COMPLETED/AUTO_CANCELLED/AUTO_MAX_AGE/AUTO_LINK_UNUSED/MANUAL/REISSUED).

**Models (32):**

| Model (table) | Key fields | Relationships / notes |
|---|---|---|
| `User` (users) | email?/phone? unique, passwordHash?, first/lastName, avatarUrl, isActive | Global identity; joins companies via memberships; actor on history/notes/photos/payments |
| `Company` (companies) | name, slug unique, timezone (default UTC), defaultCurrency (default USD), phone, taxId, logoObjectKey, HQ address + lat/lng, serviceRadiusKm, onboardingStep, onboardingCompletedAt | Tenant root; parent of nearly everything (Cascade) |
| `CompanyService` (company_services) | serviceKey?, name, normalizedName, iconKey, isCustom | Company's service catalog (onboarding); unique (companyId, normalizedName) |
| `CompanyServiceZone` (company_service_zones) | providerPlaceId, name, lat/lng, isActive | Service-area neighborhoods (OSM place ids); unique (companyId, providerPlaceId) |
| `CompanyMember` (company_members) | role, status, invitationTokenHash unique?, invitationTokenExpiresAt? | Unique (companyId, userId); invitation token stored hashed in current schema |
| `RefreshSession` (refresh_sessions) | tokenHash unique, expiresAt, revokedAt?, replacedBySessionId?, lastUsedAt? | Rotation chain for refresh tokens |
| `PasswordResetToken` (password_reset_tokens) | codeHash (HMAC only), expiresAt, usedAt?, failedAttempts | Single-use reset codes with attempt cap |
| `Customer` (customers) | first/lastName, email?, phone?, notes?, status, deletedAt? (soft delete) | Belongs to company; has addresses, jobs, quotes, invoices, reviews, portal tokens |
| `ServiceAddress` (service_addresses) | label, line1/line2, city, region, postalCode, countryCode, lat/lng | Belongs to customer + company; jobs reference it (Restrict on delete) |
| `Job` (jobs) | jobNumber (unique per company), serviceType, problemDescription, priority, status, scheduledStart/End, startedAt, completedAt, completionSummary, handshake* fields | Center of the product. FKs: company, customer (Restrict), serviceAddress (Restrict), assignedTechnician → User (SetNull) |
| `JobStatusHistory` (job_status_history) | fromStatus?, toStatus, reason?, actorUserId | Append-only audit of transitions |
| `JobNote` (job_notes) | body, visibility, authorUserId | INTERNAL vs CUSTOMER visibility |
| `JobPhoto` (job_photos) | objectKey, mimeType, sizeBytes (BigInt), kind, caption?, uploadedBy | Storage metadata only; binary in Supabase Storage |
| `JobPart` (job_parts) | name, quantity (Decimal), unitPriceMinor, currency | Parts logged by technicians |
| `Quote` (quotes) | status, subtotal/discount/tax/total Minor (BigInt), taxRateBps, currency, expiresAt, sentAt, approvedAt, declinedAt, shareToken unique? | Optional job link (SetNull); customer (Restrict) |
| `QuoteItem` (quote_items) | description, quantity, unitPriceMinor, totalMinor, sortOrder | Lines of a quote |
| `QuoteApprovalEvent` (quote_approval_events) | action, source, actorUserId? | Immutable approve/decline record |
| `Invoice` (invoices) | invoiceNumber, status, subtotal/discount/tax/total/amountPaid/balanceDue Minor, currency, dueAt, issuedAt, paidAt, createdBy? | Unique (companyId, invoiceNumber) **and** (companyId, jobId) — one invoice per job |
| `InvoiceItem` (invoice_items) | description, quantity, unitPriceMinor, totalMinor, sortOrder | Lines of an invoice |
| `Payment` (payments) | amountMinor, currency, method, provider?, providerPaymentId?, reference?, idempotencyKey, receivedAt, createdBy? | Ledger of money received. Idempotency **not** unique here — enforced by `PaymentOperation` (schema comment) |
| `PaymentOperation` (payment_operations) | amountMinor, method, provider, idempotencyKey, status, providerPaymentId?, ledgerPaymentId?, errorMessage?, retryCount, completedAt? | Unique (companyId, idempotencyKey); the idempotency + provider-processing state machine |
| `CustomerPortalToken` (customer_portal_tokens) | token unique, expiresAt, revokedAt?, createdBy? | Legacy/simple portal access (30-day, customer-scoped) |
| `PortalAccessGrant` (portal_access_grants) | customerId, jobId, issuedBy?, linkTokenHash unique, linkExpiresAt, linkConsumedAt?, status, deactivatedAt/Reason/By | New per-job portal grants (migration 2026-10-22) |
| `PortalSession` (portal_sessions) | grantId, sessionTokenHash unique, userAgentHash?, lastSeenAt, expiresAt, revokedAt? | Sessions minted from grants |
| `PortalAuditEvent` (portal_audit_events) | jobId, customerId?, grantId?, actorUserId?, action, metadata Json? | Portal-specific audit trail |
| `CustomerReview` (customer_reviews) | rating, comment?, customerId, jobId | Unique (companyId, jobId) — one review per job |
| `Notification` (notifications) | recipientUserId, type, payload Json, readAt? | In-app notifications |
| `DeviceToken` (device_tokens) | token unique, platform, lastSeenAt | FCM device registration |
| `AiConversation` (ai_conversations) | userId, title? | Unique composite (id, companyId) — used by AiMessage FK |
| `AiMessage` (ai_messages) | role, content, metadata Json? | FK (conversationId, companyId) → AiConversation — a composite-FK tenant-consistency pattern used here but not everywhere (see §10) |
| `CompanyCounter` (company_counters) | kind, lastValue | Unique (companyId, kind); tenant-scoped sequences |
| `PresignedUpload` (presigned_uploads) | jobId, userId, objectKey unique, mimeType, expiresAt, confirmedAt? | Tracks issued upload URLs until confirmation |

**Blueprint vs. actual discrepancy:** `docs/schema.md`/`docs/ERD.md` describe an `ActivityEvent` table — **no such Prisma model exists**. Audit is instead spread across `JobStatusHistory`, `QuoteApprovalEvent`, `PortalAuditEvent` and `PaymentOperation`. Treat the Prisma schema as truth.

---

## 7. Integrations and environment variables (names only)

**External integrations evidenced in code/env:**

| Integration | Purpose | Env vars (names) |
|---|---|---|
| Supabase Postgres | Primary DB via Prisma (pooled + direct URLs) | `DATABASE_URL`, `DIRECT_URL` |
| Supabase Storage | Job-photo bucket (service-role, server-side only) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JOB_PHOTOS_BUCKET` |
| Google Gemini | AI assistant model gateway | `GEMINI_API_KEY`, `GEMINI_MODEL`, `AI_MAX_TOOL_ITERATIONS` |
| Resend | Transactional email / notifications | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| Firebase Cloud Messaging | Push notifications | `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` |
| TextBee | SMS via a real Android phone/SIM gateway | `TEXTBEE_API_KEY` |
| OpenStreetMap Nominatim | Geocoding | `NOMINATIM_BASE_URL`, `OSM_USER_AGENT` |
| OpenStreetMap Overpass API | Neighborhood/service-area discovery | `OVERPASS_BASE_URL` |
| OSM tile server (default) | Flutter map tiles | Flutter dart-define `MAP_TILE_URL` |
| Sentry | Crash/error reporting, both tiers | Backend: `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `SENTRY_TRACES_SAMPLE_RATE`. Flutter dart-defines: `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`/`APP_RELEASE`, `SENTRY_TRACES_SAMPLE_RATE`; CI-only `SENTRY_ORG_AUTH_TOKEN` |

**Backend config (names, `backend/.env.example` + `backend/src/config/env.ts`):** `NODE_ENV`, `HOST`, `PORT`, `TRUST_PROXY`, `LOG_LEVEL`, `JWT_SECRET`, `JWT_ISSUER`, `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_DAYS`, `CORS_ORIGINS`, `QUEUE_MAX_SIZE`, `INVOICE_REMINDERS_ENABLED`, `INVOICE_REMINDER_SWEEP_MINUTES`, `INVOICE_REMINDER_INTERVAL_DAYS`, `INVOICE_PAYMENT_TERMS_DAYS`, and the portal/handshake group: `PORTAL_PUBLIC_BASE_URL`, `PORTAL_CODE_SECRET`, `PORTAL_LINK_UNUSED_TTL_HOURS`, `PORTAL_SESSION_IDLE_DAYS`, `PORTAL_SESSION_MAX_DAYS`, `PORTAL_POST_COMPLETION_MAX_DAYS`, `PORTAL_SWEEP_ENABLED`, `PORTAL_SWEEP_MINUTES`, `HANDSHAKE_MAX_ATTEMPTS`, `HANDSHAKE_LOCK_MINUTES`. All validated with Zod at boot; production/staging fail closed on missing CORS allowlist and insecure config (`backend/tests/production-config.test.ts`).

**Flutter config (dart-defines, `.env.example`, `lib/core/config/app_config.dart`):** `ENVIRONMENT` (development/staging/production), `API_BASE_URL` (required + HTTPS-only in staging/production, fails loudly otherwise), `APP_SURFACE` (staff/customer), `CUSTOMER_WEB_BASE_URL` (required for staging/production web), `MAP_TILE_URL`, Sentry defines above. Android flavors: development/staging/production (`README.md`).

**Not integrated (despite being mentioned as future options):** Stripe or any payment gateway; Redis/BullMQ; Google Maps (removed); any accounting/CRM integration.

---

## 8. Deployment picture — what the repo proves, and what it does not

**Evidenced in the repo:**

- Backend is a plain Node process: `pnpm --filter backend start` runs `tsx --import ./src/instrument.ts src/server.ts` on `HOST:PORT` (default `127.0.0.1:4000`), with graceful SIGTERM/SIGINT shutdown and in-process interval schedulers (invoice reminders, portal sweep) started in `backend/src/server.ts`. **[Inference: this is a single long-lived process deployment — the in-process queue, in-memory OSM caches/throttles and interval schedulers all assume exactly one instance; `docs/onboarding_google_maps_setup.md` says this explicitly: "works for one systemd service instance."]**
- `backend/.env.example` anticipates a reverse proxy in front: "Behind a reverse proxy (Render/Railway/Fly/nginx) set `HOST=0.0.0.0` and `TRUST_PROXY=1`". These platform names are generic examples, not evidence of use.
- Real-looking public domains in config defaults: `PORTAL_PUBLIC_BASE_URL=https://portal.quantixlabs.live` and the OSM user-agent identity `https://quantixlabs.live` (`backend/.env.example`, `backend/src/config/env.ts`). **[Inference: "quantixlabs.live" is the project's real public brand/domain; the customer portal web build is served from its `portal.` subdomain.]**
- Customer web build is designed for static hosting with SPA fallback — `lib/main.dart` comment names **Cloudflare Pages** as the example host.
- `README.md` lists production `https://api.aera.com` and staging `https://staging-api.aera.com`. **[Inference: these are aspirational/placeholder names, not the real deployment domains — they conflict with the `quantixlabs.live` defaults in env config, and no DNS/hosting config for them exists in the repo.]**
- CI is GitHub Actions (`.github/workflows/ci.yml`): a `backend` job (ephemeral Postgres 16 service, pnpm install, Prisma generate/validate, lint, format check, typecheck, migrate deploy, tests, build) and a `flutter` job (stable channel, pub get, analyze, test) on push/PR to `main`. **CI only — there is no CD/deploy job, no Dockerfile, no docker-compose, no Terraform, no Procfile/render.yaml/fly.toml/serverless config anywhere in the repo (searched).**

**User-provided (not repo-evidenced):**

- **[User-provided, 2026-10-25]** The backend is deployed on **AWS EC2**. Moiz accesses it over **SSH with a .pem key file**. There is **no Docker** or container setup. Deploys are manual: SSH into the server, fetch/pull the latest repo, then restart the service. (Consistent with the repo's single-instance assumptions and the "one systemd service instance" hint in `docs/onboarding_google_maps_setup.md`; the exact service name/manager is not yet confirmed.)
- **[User-provided, 2026-10-25]** The database is PostgreSQL provisioned/hosted by **Supabase**. Project URL: `https://bagrszakjvgmkyvanjce.supabase.co` (project ref: `bagrszakjvgmkyvanjce`). Live connection from Claude is not yet set up — it needs secure access (never keys in chat).

**NOT evidenced — gaps to ask Moiz about:**

1. ~~Which AWS service?~~ **Resolved 2026-10-25: EC2, SSH (.pem), no Docker, manual git-fetch + service restart deploy.**
2. ~~AWS region?~~ **Resolved 2026-10-25: Singapore** — chosen because the Supabase project is also hosted in Singapore. Instance sizing still unknown. The exact service name/restart command on EC2 is still unknown (Moiz runs a restart command but hasn't yet identified its name for this doc).
2b. ~~Production API domain?~~ **Resolved 2026-10-25: `api.quantixlabs.live`**, pointed at the EC2 server's IP address. (This confirms the `quantixlabs.live` brand inferred from env defaults, and confirms `api.aera.com` in the README is aspirational.)
3. What terminates HTTPS in production — nginx on the box, an ALB, Cloudflare? ~~Which domain does the production API actually use~~ **Resolved 2026-10-25: `api.quantixlabs.live` → EC2 IP.** The HTTPS termination part is still unknown.
4. Is the production DB the same Supabase project as dev/staging, or separate projects per environment? Who holds the production `DATABASE_URL`, `JWT_SECRET`, `PORTAL_CODE_SECRET` and service-role key, and where are they stored on the host?
5. Are invoice reminders / portal sweep / in-process queue safe there — i.e., is production really a single backend instance today?
6. Where is the customer web build actually hosted (Cloudflare Pages per the code comment, or elsewhere), and what is `CUSTOMER_WEB_BASE_URL` in production?
7. Which optional integrations are actually switched on in production — Resend, FCM, TextBee, Gemini, Sentry — vs. present in code but keyless (silent no-op)?
8. Backups/point-in-time recovery for the Supabase project, and who gets Sentry alerts.

---

## 9. Non-goals, product principles, and engineering rules

**MVP non-goals** (`docs/context.md` §7): full accounting suite; payroll; inventory/warehouse management; complex route optimization; multi-currency accounting; marketplace for technicians; arbitrary plugin marketplace; full web admin portal. (Phase 13 pilot items — custom branding, plan/feature flags, exports/reporting — are explicitly optional/future in `docs/plan.md`.)

**Product principles** (`docs/context.md` §8): fast by default; low cognitive load (dispatcher understands today's workload in seconds); evidence over decoration; backend is the source of truth; safe multi-tenancy (a company must never read/mutate another's data, even with a tampered ID); recoverable operations (money/schedule/customer-state changes idempotent or transaction-safe).

**Design principles** (`docs/design.md`): "quiet luxury" — premium, calm, fast, operational. Warm-neutral canvas, one deep-teal accent, Inter, border-and-surface depth (not shadows/glassmorphism), motion 120–300ms and purposeful only, no neon AI aesthetics. Technician screens thumb-friendly with one dominant CTA; AI surfaces read like a senior operations analyst (question, data-backed answer, evidence, action), not a chatbot toy.

**Engineering rules that bind future work** (`docs/rules.md` — read before any coding session):

- Golden rule: "The AI may write code; the project still follows engineering rules." Never accept generated code merely because it compiles.
- Backend: TS strict, ESLint/formatter, Zod at API boundaries, centralized error taxonomy, structured logs with request IDs, explicit authorization, Prisma parameterized access, transactions for multi-write ops. Forbidden: unjustified `any`, domain logic in controllers, trusting client-provided role/companyId, returning internal exception messages, logging secrets/PII, N+1 queries, unbounded lists.
- Flutter: widgets render state and don't own business rules; network only in repositories; immutable state; lazy lists; no expensive work in `build()`.
- API: `/api/v1`, nouns, correct status codes, stable machine-readable errors, pagination, validated filter allowlists, idempotency keys on financial/retry-sensitive mutations.
- DB: UUIDs, never float money, deliberate indexes, FKs, migrations only (never hand-edit prod schema), immutable audit/history.
- Security: OWASP API focus — object-level + function-level authorization on every tenant resource, rate limits, short-lived access tokens, refresh rotation/revocation, upload type/size validation, signed object URLs, CORS allowlist, no stack traces to clients.
- **AI/vibe-coding protocol** (`docs/rules.md` §11 + the chat protocol at the end of that file): before changing code — inspect relevant files, state assumptions, identify dependencies/side-effects, make the smallest coherent change, run format/lint/tests, report files changed + verification. **Six-to-seven-file batch rule:** a single implementation request should normally touch ≤6–7 files; larger features must be split into vertical slices that each compile and pass tests. An agent must never silently change architecture, swap a chosen library, delete tests to hide failures, disable type checks, weaken auth, hard-code secrets, or substitute mock APIs for the real backend without labelling them.
- **Definition of Done:** documented requirements, API contract, migrated DB changes, enforced authorization, UI loading/empty/error states, tests for critical rules, lint/typecheck green, acceptable performance, no secret leakage, coherent Git history.
- Git: small coherent commits, `feat(scope):` / `fix(scope):` / `perf:` / `refactor:` format.
- Performance budgets (`docs/rules.md` performance section): tap→response <100ms target; health p95 <100ms; simple authenticated read p95 <300ms under light load; no unbounded collections.

---

## 10. Current state, known bugs/risks/gaps, and open questions

### Current state (evidenced)

- Feature-complete-looking MVP across the whole customer-to-cash chain: auth/tenancy, onboarding (with OSM service areas), customers, jobs + scheduling, technician execution with photo evidence, quotes with public approval, invoices + manual payments, customer portal (recently rebuilt around per-job grants + handshake), notifications on 3 channels, Gemini AI assistant with 4 authorized tools. 45 backend + 23 Flutter test files.
- `README.md` declares version `1.0.0+1` and "Phase H1 (Phase 12 Hardening) — 100% Complete (Documentation & Implementation)", with manual verification still outstanding (demo video, Flutter Sentry event verification "blocked by Windows toolchain", Sentry alert configuration).
- The most recent work (Oct 2026 commits) is the customer portal rebuild (`29ae8f9`), preceded by the OSM migration (Google Maps removal), service-area fixes, and a backend auto-migrate-on-start fix (PR #1) and a service-area fix (PR #2).

### Conflicting status reports — treat with care

The docs **disagree with each other** about test health, because they are snapshots from different dates:

- `README.md`: "⚠️ 2 scheduling concurrency test failures, ⚠️ 7 quote lifecycle test failures (need investigation)".
- `docs/phase_2_release_readiness_completion.md` (2026-10-09): 390 passed / 24 failed / 2 skipped, failures called pre-existing (quotes, scheduling, portal).
- `docs/bug_fixes_implementation_report.md` (2026-10-09): 416 passed / 1 failed / 2 skipped; the one failure is `payment-idempotency.test.ts` ("allows payment requests with different idempotency keys" — expected 422, got 500); also reports **pre-existing Flutter compilation errors** in `lib/features/auth/providers/auth_provider.dart` (missing `ref` getter) that break the full Flutter test suite.

**[Inference: the trend is strongly improving, but no document in the repo is a current, trustworthy test report. A fresh full run (`pnpm --filter backend test`, `flutter analyze`, `flutter test`) is the only way to know today's state.]**

### Known open risks (from `docs/phase_1_baseline_and_impact_analysis.md`, filtered by what phases 2–3 actually closed)

Closed by remediation Phases 2–3: Android debug-key signing fallback (now fails closed), Flutter CI toolchain mismatch, permissive production CORS (now fails closed), technician over-exposure of customer/financial data (field redaction added), customer PII to Gemini (email/phone removed), quote payload debug logging (removed).

**Still open / deferred according to the repo's own docs:**

1. **Payment operation vs. ledger consistency (P1, remediation Phase 4 — no completion doc):** `processPaymentOperation` was called outside the DB transaction, so an operation could be marked COMPLETED without a ledger payment; provider processing was race-prone (read-then-write claim, no conditional update/lock); concurrent partial payments could leave invoice status inconsistent (`docs/phase_1…`, §4). Later code (PaymentOperation states incl. `PROVIDER_ACCEPTED`, `ledgerPaymentId`, migrations Oct 11) suggests partial work happened **[Inference]**, but nothing in the repo certifies it closed.
2. **Upload verification (P1, Phase 5):** signed-URL creation was treated as an existence check; actual stored object metadata (size/type/signature) was not inspected — unverified client metadata could be recorded for job photos.
3. **Composite foreign keys for tenant consistency (P2, deferred in Phase 3):** child tables hold `companyId` + parent FK separately, so cross-company references are insertable at DB level if a service check is missed. Deferred explicitly because of **schema/migration drift** requiring a migration reset. (One composite FK does exist: `AiMessage → AiConversation`.)
4. **Invitation token still returned in API responses (P2, partially fixed):** documented as a temporary workaround until email delivery; mitigations are 7-day expiry, revocation on resend, and email match on acceptance (`docs/phase_3…` Task 4). Note the Resend email adapter now exists in code **[Inference: this workaround may now be removable — verify]**.
5. **In-process queue is non-durable** (`backend/src/queue/in-process-queue.adapter.ts` header comment): jobs in flight at process exit are lost; no backpressure beyond a size cap; not cluster-safe. Accepted for notifications today; the file itself says production should move to Redis/BullMQ.
6. **Single-instance assumptions:** invoice-reminder scheduler and portal sweep run as in-process intervals (`backend/src/server.ts`); OSM throttle/cache is in-memory single-process. Running >1 backend instance risks duplicate reminders and inconsistent throttling.
7. **Unbounded queries / N+1 (P2, Phase 5):** unbounded list loading and per-technician workload counts were flagged; FK indexes were partly addressed by migration `20260927214227_add_foreign_key_indexes`.
8. **Android applicationId is still the placeholder** `com.example.aera` (`android/app/build.gradle.kts` lines 19/46) — blocks store distribution; release signing now fails closed without `key.properties`.
9. **Supabase RLS posture:** 0 policies; safe **only** while the server-mediated model holds (`docs/supabase_rls_decision.md`). Any future direct client access, Edge Function, or leaked service-role key changes that calculus immediately.
10. **Doc rot:** `README.md` links to files that do not exist in the repo (`docs/phase_H1_demo_seed_data.md`, `docs/phase_H1_api_documentation.md`, `docs/phase_H1_final_hardening_evidence.md`, `SENTRY_INTEGRATION_COMPLETE.md`, `docs/SENTRY_CI_CONFIGURATION.md` — none are in `docs/`), and the README's architecture diagram/doc still implies Supabase Auth. `docs/architecture_diagram.md` is labelled "as of Phase H1" and predates the portal-grant rebuild.
11. **OSM in production:** public tile server and public Nominatim/Overpass are documented as dev/light-use only; production needs a hosted tile provider and possibly self-hosted geocoding (`docs/onboarding_google_maps_setup.md`).
12. **No real payment gateway:** revenue collection is manual recording only — fine for a pilot, but "customer pays online" does not exist yet (invoice payment screen records payments; `PaymentMethod` includes CARD but the only provider is `manual`).

### Sensible open questions for Moiz

1. Deployment facts from §8 (AWS service/region/domain, deploy method, single instance?, which integrations are live in prod, separate Supabase projects per env?).
2. Is Aera being prepared for a real pilot customer (Phase 13), a portfolio/demo, or both — and what is the deadline pressure? This changes whether payment-gateway and durable-queue work outrank polish.
3. What is the current *actual* test state — can we run the full backend + Flutter suites and record a fresh baseline to replace the conflicting snapshots?
4. Were remediation Phases 4–6 (financial concurrency, storage/scalability, Flutter lifecycle) ever done outside these docs? If not, they are the highest-value hardening backlog, in that order.
5. Is the `lib/features/team/` folder live or legacy next to `settings/team_management_screen.dart`?
6. Is a real payment provider planned (Stripe? a Pakistan/regional option given TextBee/SIM and `quantixlabs.live` context)? The `PaymentProvider` interface is ready.
7. Has the invitation-token-in-response workaround been retired now that Resend email exists?
8. What is the plan for the Android applicationId and store release (Play Store signing, package name under which domain)?
9. Should RLS be added as defense-in-depth anyway before any real customer data lands in Supabase?

---

## 11. Live Supabase verification (added 2026-10-25, after Moiz connected Supabase)

Verified live via the Supabase Management API (read-only SELECTs only) on 2026-10-25:

- **Project:** "Aera", ref `bagrszakjvgmkyvanjce`, region **ap-southeast-1 (Singapore)**, status ACTIVE_HEALTHY, Postgres **17.6**. Created 2026-09-07. This independently confirms Moiz's EC2/Supabase Singapore pairing.
- **Tables:** 29 business tables present in `public`, matching the Prisma schema as of the Oct 16 onboarding migration (incl. `payment_operations.ledgerPaymentId` and the `PROVIDER_ACCEPTED` enum value).
- **⚠️ Live DB is behind HEAD by the newest migration:** `20261022204225_add_portal_access_grants_and_handshake` (in commit `29ae8f9`) is **not applied** — tables `portal_access_grants`, `portal_sessions`, `portal_audit_events` do not exist and `jobs` has no `handshake%` columns. Today's portal code will error against this DB wherever the new portal/handshake features run.
- **⚠️ Migration-history drift is real:** `_prisma_migrations` contains exactly **one** recorded migration (`20261009180000_remove_payment_idempotency_duplicate`). The rest of the schema clearly arrived by another route (db push/baseline), so a plain `prisma migrate deploy` would try to replay already-existing objects. The auto-migrate-on-start that briefly existed (commit `15fee9a`) was reverted in `19482a6`, and the current `start` script runs no migrations. Resolving this baseline (e.g. `prisma migrate resolve --applied` for the already-present migrations, then applying the portal migration) is a prerequisite for safely deploying HEAD to EC2 — a planned, approved operation, not yet done.
- **Storage:** bucket `job-photos` exists and is **private**, as designed.
- **RLS (live):** zero policies anywhere, and no `public` table has rowsecurity enabled. Safe only under the server-mediated model (see §5/§10).
- **Data scale (exact counts):** users 5, companies 3, customers 1, jobs 1, quotes 0, invoices 0, payments 0, job_photos 0 — dev/test-scale data only; no real customer data yet.

---

*Document prepared from repo evidence, Moiz's user-provided deployment facts (EC2/Singapore/manual deploy, api.quantixlabs.live), and the live Supabase verification in §11. The repo was not modified during the original inspection; this document itself was later pushed to the repo as `docs/AI_PROJECT_CONTEXT.md` (commit `bf106f4`).*
