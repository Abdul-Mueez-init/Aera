# Aera — Engineering Rules, QA Gates & AI Coding Workflow

> These rules govern implementation when coding through chat-based AI agents such as ChatGPT, Claude, Codex, or similar assistants.


## 1. Golden rule

**The AI may write code; the project still follows engineering rules.**

Never accept generated code simply because it compiles.

## 2. Backend architecture rules

### Required
- TypeScript strict mode.
- ESLint + formatter.
- Zod validation at API boundaries.
- Centralized error taxonomy.
- Structured logs with request IDs.
- Explicit authorization checks.
- Parameterized database access through Prisma.
- Transactions for multi-write business operations.
- Unit tests for domain rules.
- Integration tests for important API workflows.

### Forbidden
- `any` unless justified and isolated.
- Controllers containing domain logic.
- Business logic duplicated across routes.
- Raw client-provided role/company IDs trusted without verification.
- Returning internal exception messages to clients.
- Logging passwords, tokens, sensitive personal information, or payment secrets.
- N+1 query patterns in list endpoints.
- Unbounded list endpoints.

## 3. Flutter architecture rules

Recommended layers:

```text
presentation
  ↓
application/state
  ↓
domain models / use cases
  ↓
data repositories
  ↓
remote/local data sources
```

Rules:
- Widgets render state; they do not own business rules.
- Network access stays in repositories/data sources.
- Use immutable state models where practical.
- Prefer `const` widgets.
- Localize state changes to small subtrees.
- Use lazy list builders for potentially large lists.
- Avoid expensive work inside `build()`.
- Do not decode/process large images on the UI thread unnecessarily.
- Cache where it improves UX without making correctness ambiguous.

Flutter’s official performance guidance calls out expensive build work, unnecessary rebuilds, eager large lists, intrinsic layout passes, animated opacity/clipping and related pitfalls. citehttps://docs.flutter.dev/perf/best-practices

## 4. API design rules

- Version APIs under `/api/v1`.
- Use nouns for resources.
- Use HTTP status codes correctly.
- Return stable machine-readable error codes.
- Paginate lists.
- Support filtering/sorting only through validated allowlists.
- Use idempotency keys on financial or retry-sensitive mutation endpoints where appropriate.

## 5. Database rules

- All core entities use UUIDs.
- Never store money in `float`/`double`.
- Add indexes based on actual query patterns.
- Use foreign keys.
- Use migrations; never manually edit production schema.
- Test rollback/backward compatibility before risky schema changes.
- Keep audit/history records immutable.

## 6. Security rules

Threat model against OWASP API risks including broken object-level authorization, broken authentication, unrestricted resource consumption, function-level authorization, security misconfiguration, SSRF, and unsafe external API consumption. citehttps://owasp.org/API-Security/https://owasp.org/blog/2023/07/03/owasp-api-top10-2023

Minimum controls:
- object-level authorization on every tenant resource;
- role/function-level authorization;
- input validation;
- rate limiting on sensitive endpoints;
- secure headers;
- TLS in deployment;
- secret management via environment/secret store;
- short-lived access tokens;
- refresh token rotation/revocation;
- upload type/size validation;
- signed/controlled object URLs;
- dependency auditing;
- CORS allowlist;
- no stack traces to clients.

## 7. Transaction rules

Use a transaction whenever one logical action spans dependent writes that must succeed/fail together. Prisma documents transaction support for these multi-write operations. citehttps://www.prisma.io/docs/orm/prisma-client/queries/transactions

Examples:

```text
Complete job
  = job status update
  + completion timestamp
  + invoice creation/update
  + activity event
```

Do not perform these as unrelated writes without transaction boundaries.

## 8. Logging/observability

Every API request should have:
- request ID,
- method,
- path,
- duration,
- status,
- user/company context where safe.

Every critical mutation should have an audit event.

Avoid logging raw request bodies by default.

## 9. Testing pyramid

```text
Many fast unit tests
        ↓
Focused integration tests
        ↓
Small set of critical end-to-end tests
```

Critical end-to-end flow:

```text
Register
→ create company
→ add member
→ create customer
→ create job
→ assign technician
→ technician starts
→ complete job
→ invoice
→ payment
```

## 10. Git rules

Commit by coherent change:

```text
feat(auth): add refresh-session rotation
feat(jobs): add technician assignment flow
fix(invoices): prevent duplicate payment events
perf(dashboard): reduce redundant job queries
refactor(api): extract job authorization policy
```

No giant “everything generated” commits after Phase 0.

## 11. AI/vibe-coding rules

Before changing code, the agent must:

1. Inspect relevant files.
2. State assumptions.
3. Identify dependencies and side effects.
4. Make the smallest coherent change.
5. Run format/lint/tests.
6. Report files changed and verification results.

Never allow an AI agent to:
- silently change architecture;
- replace a chosen library without approval;
- delete tests to make failures disappear;
- disable type checks;
- weaken authentication/authorization to “get it working”;
- hard-code secrets;
- create mock APIs as a substitute for the real backend without explicitly labeling them.

## 12. Definition of Done

A feature is done only when:

- requirements are documented,
- API contract exists,
- DB changes are migrated,
- authorization is enforced,
- UI handles loading/empty/error states,
- unit/integration tests exist for critical rules,
- lint/typecheck pass,
- performance is acceptable,
- no known secret leakage exists,
- Git history has a coherent commit.

---


## 1. Performance philosophy

“Fast” is measurable.

Flutter’s current performance guidance emphasizes profiling, localized rebuilds, lazy lists, minimizing expensive build/layout work, and validating real performance in profile/release-like modes. citehttps://docs.flutter.dev/perf/best-practiceshttps://docs.flutter.dev/perf/rendering-performance

## 2. Initial mobile targets

These are project budgets, not universal platform guarantees.

### Interaction
- Tap-to-visible-response for local UI: <100 ms target.
- Routine screen transition: visually responsive immediately.
- Network-backed action: show optimistic/local progress in <150 ms when safe.

### Rendering
- No sustained frame jank during routine navigation/scrolling on the target reference device.
- Aim for frame work compatible with 60 Hz and avoid designs that structurally prevent 120 Hz devices from feeling smooth.

### Startup
- Avoid blocking the first meaningful frame on non-essential API calls.
- Shell/navigation should appear before secondary dashboard data.

### Network
- Paginate lists.
- Avoid N+1 requests.
- Cache stable/reference data.
- Compress images before upload.
- Use skeletons/placeholders for secondary content.

## 3. Backend targets

Initial portfolio targets:

- Health endpoint p95 < 100 ms locally/close deployment.
- Simple authenticated read p95 target < 300 ms under light load.
- Writes that include DB transaction should remain predictably bounded; profile before optimizing.
- No endpoint returns unbounded collections.

Do not fake performance with arbitrary timeouts. Measure.

## 4. Database performance

- Index tenant + primary filter combinations.
- Use `EXPLAIN ANALYZE` for suspicious queries.
- Select only needed columns for large list views.
- Avoid eager loading huge relationship graphs.
- Use aggregates for dashboard summaries rather than transferring raw records.

## 5. Security review checklist

Before demo/release:

### Auth
- password hashing verified;
- access token expiration verified;
- refresh rotation verified;
- logout/revocation verified;
- brute-force/rate limiting present.

### Authorization
- owner vs dispatcher vs technician tested;
- cross-company access tested;
- object IDs tampered in requests;
- direct route access tested without UI restrictions.

### Input
- every body/query/path param validated;
- file size/type checked;
- HTML/script content handled appropriately;
- URL fetching features restricted to trusted destinations to reduce SSRF risk.

### Secrets
- no secrets in Git;
- `.env` files ignored;
- production secrets live in deployment secret storage;
- logs scrub secrets/tokens.

OWASP identifies broken object-level authorization, broken authentication, broken function-level authorization, unrestricted resource consumption, SSRF, security misconfiguration, and unsafe API consumption among core API security risks. citehttps://owasp.org/API-Security/

## 6. QA matrix

### Functional
- create/update/archive customers;
- assign/reassign jobs;
- valid/invalid status transitions;
- quote approve/decline;
- invoice totals;
- payment recording;
- notification failure isolation.

### Concurrency
- two users update same job;
- duplicate payment request;
- quote approved twice;
- job completed twice.

### Offline/intermittent network
- technician drafts note while disconnected;
- upload interrupted;
- retry does not duplicate mutations.

### Device
- compact Android phone;
- larger Android phone;
- tablet if supported;
- low-memory reference device.

## 7. Release checklist

```text
[ ] migrations reviewed
[ ] seed/demo data deterministic
[ ] env validation works
[ ] lint passes
[ ] typecheck passes
[ ] unit tests pass
[ ] integration tests pass
[ ] critical E2E flow passes
[ ] performance smoke test passes
[ ] authorization tests pass
[ ] no secrets committed
[ ] crash logging verified
[ ] README/setup verified from clean checkout
```

## 8. Portfolio proof

For the final demo, show:

1. Architecture diagram.
2. Database ERD.
3. Live mobile workflow.
4. Backend API docs.
5. Real authorization test.
6. AI answering a data-backed question.
7. Performance/profile evidence.

The goal is to demonstrate engineering judgment, not merely a pretty UI.

---


Paste this document into a new Claude/ChatGPT/Codex coding session after attaching the repository/spec files.

## ROLE

You are the lead engineer implementing Aera from the project blueprint.

The human owner is a vibe coder. Do not assume they will manually repair code. Produce complete, coherent changes and explain important architectural decisions in plain language.

## PRODUCT

Aera is a premium multi-tenant field-service operating system for HVAC/home-service companies.

Core lifecycle:

```text
Customer → Quote → Approval → Schedule → Dispatch → Job → Evidence → Invoice → Payment → Review
```

Primary platform: Flutter.
Backend: Node.js + TypeScript + Express 5.
Database: PostgreSQL + Prisma.
Validation: Zod.
Logging: Pino.

## NON-NEGOTIABLE ARCHITECTURE

Backend:

```text
HTTP route
  ↓
controller
  ↓
authorization policy
  ↓
service/domain logic
  ↓
repository
  ↓
Prisma/PostgreSQL
```

Flutter:

```text
screen/widgets
  ↓
Riverpod state/application layer
  ↓
repository
  ↓
API client/local storage
```

## TENANCY

All business records are scoped to `companyId`.
Never trust company IDs supplied by the client.
Every tenant-scoped query must be explicitly scoped.

## SECURITY

Follow OWASP API security principles. Pay special attention to object-level authorization and function-level authorization.

Never:
- weaken auth to make a feature work;
- bypass validation;
- expose stack traces;
- log tokens/secrets;
- add client-only authorization;
- use unbounded queries.

## PERFORMANCE

Treat performance as a feature.

Flutter:
- localize rebuilds;
- use const where practical;
- lazy-build lists;
- avoid expensive `build()` work;
- avoid unnecessary clipping/opacity animations;
- show useful UI before secondary network data.

Backend:
- paginate;
- avoid N+1 queries;
- return only needed fields;
- use indexes deliberately;
- move slow/non-critical tasks to async jobs.

## DESIGN

The UI must feel:

```text
Premium + calm + fast + operational
```

Not:

```text
neon + glassmorphism + excessive gradients + noisy animations
```

Motion is short, purposeful and localized.

## WORK METHOD

For every requested feature:

### Step 1 — Inspect
Read the existing relevant files and identify the current architecture.

### Step 2 — Plan
State:
- files to change;
- DB/API changes;
- authorization implications;
- tests needed;
- migration impact.

### Step 3 — Implement
Make the smallest complete coherent change.
Do not rewrite unrelated files.

### Step 4 — Verify
Run:
- formatter;
- lint;
- typecheck/analyzer;
- unit tests;
- relevant integration tests.

### Step 5 — Report
Give:
- what changed;
- why;
- tests run/results;
- any remaining risk.

## OUTPUT RULE

Do not provide pseudo-code when production code is expected.
Do not omit imports or supporting files.
Do not invent APIs that do not exist in the repository.

## DATABASE RULE

Any operation involving multiple dependent writes should use a database transaction.

Example:

```text
job completion
+ invoice creation/update
+ activity event
```

must not partially succeed.

## MONEY RULE

Never use floating point for monetary values.
Use integer minor units + currency.

## API RULE

Base path:

```text
/api/v1
```

Use stable machine-readable errors.
Use explicit command endpoints for state-machine transitions.

## GIT RULE

Prefer small coherent commits.
Suggested form:

```text
feat(scope): description
fix(scope): description
perf(scope): description
refactor(scope): description
```

## FINAL STANDARD

When choosing between:

- faster but messy implementation;
- slightly more work but clear, testable, secure architecture;

choose the second one, provided it does not introduce unnecessary abstraction.

The target is a real product prototype that can survive a serious client demo and can later become a small commercial SaaS.

---

# Chat-Based AI Coding Protocol

## Purpose

Aera will be implemented primarily through conversational AI coding: the developer explains a task in chat, the agent proposes or writes code in the response, and the developer applies the code to the repository. This workflow is acceptable only when the human developer remains responsible for architecture, review, testing, integration, and final acceptance.

## Context-first rule

Before requesting code, provide the agent with the relevant existing files, directory tree, types, API contracts, and current errors. Do not ask an agent to invent code against an unknown codebase. If context is incomplete, the agent must state assumptions and request the smallest missing context rather than silently creating incompatible abstractions.

## Six-to-seven-file batch rule

Each implementation request should normally change **no more than six or seven files**. A batch may contain related files such as a route, controller, service, repository, schema/type file, test, and UI integration. The agent must list the exact files it intends to create or modify before producing code.

If a feature requires more than seven files, split it into coherent vertical slices. Each slice must compile, type-check, and be testable before the next slice begins. Never generate a large repository-wide rewrite in one chat response.

The developer should paste or apply one coherent batch, run the required checks, report failures back to the agent, and only then request the next batch.

## Chat implementation loop

Every feature follows this loop:

1. **Inspect:** review the current files, architecture, requirements, and constraints.
2. **Plan:** describe the smallest vertical slice and list the exact files to change.
3. **Implement:** provide complete file contents or precise patches, never ambiguous fragments.
4. **Verify:** run formatting, lint, typecheck, unit tests, integration tests, and a relevant manual flow.
5. **Review:** compare the result against the acceptance criteria and security rules.
6. **Report:** summarize changed files, commands run, known limitations, and the next safe batch.

## Complete-file and patch discipline

When returning code in chat, the agent must identify the file path and whether the response is a complete replacement or a targeted patch. A complete replacement must include the whole file. A patch must include enough surrounding context to apply safely. The agent must not omit imports, types, error handling, loading states, or tests merely to shorten the response.

## Industry-compatible coding practice

Use established, boring, maintainable patterns over clever abstractions. Follow the official conventions of Flutter, Dart, TypeScript, Express, Prisma, PostgreSQL, and the selected deployment platform. Keep controllers thin, services explicit, repositories tenant-scoped, UI components composable, and integrations behind adapters. Prefer readable code, stable dependencies, typed boundaries, explicit error handling, and documented trade-offs.

Do not copy code blindly from generated output. Check dependency versions, security implications, licenses where relevant, and compatibility with the existing project. Do not introduce a library for a problem that can be solved clearly with the existing stack.

## Smoothness and responsiveness standard

The app should feel immediate, calm, and responsive under normal field conditions. Every screen must have explicit loading, empty, error, retry, and success states. Render useful local or cached content first when safe, then progressively load secondary data. Never block the UI on non-critical notifications, analytics, image processing, or AI work.

Avoid unnecessary rebuilds, unbounded lists, oversized widget trees, eager loading of relationship graphs, and repeated network requests. Paginate list endpoints, debounce search, compress images before upload, use thumbnails for previews, preserve scroll position where appropriate, and keep expensive work off the main UI thread.

Measure before optimizing. The quality bar includes smooth scrolling, fast navigation, predictable interaction feedback, bounded API responses, stable behavior on low-memory devices, and graceful recovery from intermittent connectivity.

## AI safety rule

AI may summarize, classify, explain, and recommend. It must not become the source of truth for authorization, money, job state, customer identity, or business records. AI answers must be grounded in server-authorized tools and current database results. Any mutation must pass through typed server-side commands with role checks, validation, confirmation, idempotency, and an audit event.

## Definition of done for every AI-generated batch

A batch is not complete when code has merely been generated. It is complete only when the code is integrated into the existing repository, formatted, type-checked, linted, tested, reviewed for tenant isolation and authorization, verified on the relevant device or API flow, and documented with any remaining limitations.
