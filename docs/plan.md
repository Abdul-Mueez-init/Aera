# Aera — Development, Demo & Release Plan

> This is the single source of truth for implementation sequencing, phase exit criteria, portfolio proof, and pilot readiness.


## Phase 0 — Product foundation

**Goal:** freeze the product direction before coding.

Deliver:
- project repository;
- this blueprint;
- design tokens;
- architectural decision record;
- environments: local/dev/staging/prod concept;
- coding/AI rules.

Exit criteria:
- no unresolved architecture decisions that affect Phase 1.

## Phase 1 — Monorepo + backend skeleton

Deliver:
- Flutter app shell;
- Node/TypeScript/Express backend;
- strict TS;
- config validation;
- logging;
- error middleware;
- route versioning;
- health/readiness endpoints;
- Prisma + PostgreSQL;
- migration workflow;
- CI checks.

Exit criteria:
- clean local startup with one command documented per service;
- CI passes lint/typecheck/test.

## Phase 2 — Identity + tenancy

Deliver:
- registration/login;
- password hashing;
- JWT access token;
- rotating refresh sessions;
- logout/revoke;
- company creation;
- memberships;
- roles;
- authorization middleware/policies.

Exit criteria:
- a user cannot access another company’s record using a guessed ID.

## Phase 3 — Customers + service locations

Deliver:
- CRUD/archive;
- search;
- customer detail;
- multiple addresses;
- Flutter caching where useful.

Exit criteria:
- owner/dispatcher can manage customers smoothly.

## Phase 4 — Jobs + status machine

Deliver:
- jobs CRUD;
- job numbers;
- status machine;
- assignment;
- status history;
- priorities;
- notes;
- job detail.

Exit criteria:
- invalid status transitions are rejected server-side.

## Phase 5 — Scheduling/dispatch

Deliver:
- day schedule;
- technician workload;
- create/reschedule;
- assign/reassign;
- conflict warnings;
- notifications abstraction.

Exit criteria:
- dispatcher can run a simulated busy workday.

## Phase 6 — Technician execution

Deliver:
- technician Today screen;
- start/arrive/in-progress/complete;
- notes;
- photos;
- parts;
- completion summary;
- upload progress.

Exit criteria:
- a complete field job can be executed from a phone.

## Phase 7 — Quotes

Deliver:
- quote editor;
- line items;
- tax/discount;
- share/send;
- customer approval;
- approval events.

Exit criteria:
- approved quote can flow into scheduling/job execution without duplicate records.

## Phase 8 — Invoicing/payments

Deliver:
- invoice generation;
- invoice states;
- payment records;
- balance calculation;
- PDF/receipt generation later;
- provider abstraction.

Exit criteria:
- invoice and payment updates are transaction-safe and idempotent.

## Phase 9 — Customer experience

Deliver:
- customer-facing quote view;
- appointment details;
- invoice view;
- review request;
- service history.

Exit criteria:
- customer can understand what is happening without staff explanation.

## Phase 10 — Notifications + background jobs

Deliver:
- push notifications;
- email adapter;
- SMS adapter interface;
- retry policy;
- queue abstraction;
- scheduled invoice reminder jobs.

Exit criteria:
- notification failure does not break the primary business transaction.

## Phase 11 — AI Job Assistant

Deliver:
- AI gateway module;
- authorized tools/query layer;
- conversation persistence;
- streaming/progress UI if provider supports it;
- analytics questions;
- job risk explanation.

AI tool layer rules:
- tool schemas are typed;
- authorization occurs before database access;
- tool results are scoped by company;
- model cannot invent database facts;
- model cannot directly mutate sensitive records without explicit command authorization.

Exit criteria:
- ask “Which jobs are at risk today?” and get an answer backed by current records.

## Phase 12 — Hardening + portfolio polish

Deliver:
- performance profiling;
- API load smoke tests;
- security review;
- crash/error reporting;
- empty/error states;
- accessibility pass;
- animation polish;
- demo seed data;
- polished README;
- architecture diagram;
- short demo video.

Exit criteria:
- the product is demoable from a clean checkout and the happy-path workflow works without developer intervention.

## Phase 13 — Sales-ready pilot

Optional.

Deliver:
- custom company branding;
- plan/feature flags;
- onboarding checklist;
- export/reporting;
- support/contact flow;
- customer-specific deployment configuration.

## Dependency map

```text
Phase 0
  ↓
Phase 1
  ↓
Phase 2
  ↓
Phase 3 ──────┐
  ↓            │
Phase 4        │
  ↓            │
Phase 5        │
  ↓            │
Phase 6        │
  ↓            │
Phase 7        │
  ↓            │
Phase 8        │
  ↓            │
Phase 9 ───────┘
  ↓
Phase 10
  ↓
Phase 11
  ↓
Phase 12
  ↓
Phase 13 optional
```

## Build discipline

Do not code 4–5 phases at once.

For each phase:

```text
Specification
→ schema/API
→ backend logic
→ tests
→ Flutter integration
→ UX polish
→ profiling
→ commit
```

This is particularly important for vibe coding because it prevents generated code from becoming an opaque ball of mutually dependent changes.

---


## Demo objective

Make the viewer understand the business value before discussing the technology.

Do not begin with code.

## 0:00 — Problem

“HVAC companies often run customer requests, scheduling, technician updates and payments across calls, texts, spreadsheets and separate tools.”

## 0:20 — Dashboard

Open the owner dashboard.

Show:
- today’s jobs;
- revenue collected;
- outstanding invoices;
- urgent jobs.

Say:

> “This is the company’s operational command center.”

## 0:45 — Customer → Job

Create/open a customer and show their service history.

Create a new AC-not-cooling job.

Assign the technician.

## 1:15 — Dispatch

Open the schedule.

Move the appointment.

Show that the job status and assignment update in the system.

## 1:40 — Technician

Switch to technician account.

Open Today.

Show:
- customer;
- problem;
- address;
- job details.

Tap Start Job.

Add a note and before photo.

## 2:15 — Completion

Add a completion summary and after photo.

Tap Complete Job.

Explain that the backend validates the transition and records the audit trail.

## 2:35 — Quote / Invoice

Show quote approval or invoice generation.

Record a payment in the demo environment.

## 2:55 — AI “wow” moment

Ask:

> “Which jobs are at risk today, and why?”

The response should cite live operational facts such as schedule pressure, technician workload, overdue jobs, or long-running work.

Then ask:

> “Give me a concise summary of Sarah Khan’s last three service visits.”

## 3:30 — Engineering credibility

Only now show:

- Flutter frontend;
- REST API;
- Express/TypeScript modules;
- Prisma;
- PostgreSQL;
- ERD;
- authorization tests;
- performance profile.

Close with:

> “The UI is the surface. The important part is that the workflow, permissions, data integrity and business rules are enforced by a real backend.”

## Portfolio assets to prepare

1. 60–120 second product video.
2. README with screenshots/GIFs.
3. Architecture diagram.
4. ERD.
5. API documentation snapshot.
6. Security/authorization test example.
7. Performance profile screenshot.
8. Demo credentials for owner, dispatcher, technician and customer roles.

## Plan ownership

This file owns implementation phases, dependencies, exit criteria, demo sequencing, hardening, and pilot readiness. It does not redefine product requirements, architecture, database schema, visual design, or coding rules.
