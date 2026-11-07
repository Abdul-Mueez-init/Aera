# Gate A/C staging checklist — service-request-first flow

Executable walkthrough for the four-role staging pass required before any
production flag is enabled. Run against a seeded staging environment with
the v2 demo dataset. Record evidence (screenshots, request IDs, SQL output)
against each gate; do not mark a gate passed on code presence alone.

## Seed / demo data v2

1. Apply all migrations: `pnpm --filter backend prisma:migrate:deploy`.
2. Seed the demo tenant (owner, dispatcher, technician, customer with
   workspace grant, service address, business hours, one open request).
3. Verify: `pnpm --filter backend check:phase8-integrity` → 0 violations.

## Role 1 — Owner / dispatcher (staff surface)

- [ ] Create a service request (staff-direct) → appears in Requests inbox.
- [ ] Create + send a REPAIR quote linked to the request.
- [ ] Complete a DIAGNOSTIC job with ≥1 finding → `POST
      /jobs/:id/repair-quote` returns a DRAFT REPAIR quote with
      `basisJobId`, same `serviceRequestId`, items derived from findings.
- [ ] Approve the repair quote in the customer workspace → exactly one
      REPAIR job materializes (`sourceQuoteId` set, idempotent on replay).
- [ ] Decline path: second diagnostic quote declined → diagnostic job,
      findings and request remain intact.
- [ ] `GET /invoices/from-job/:jobId/preview` shows approved items plus
      `unapprovedParts`; `POST /invoices/from-job/:jobId` excludes
      unapproved parts from the issued invoice.
- [ ] Deposit flow: quote with deposit terms → accept → DEPOSIT invoice
      issued, no job until paid → pay → job created once → final invoice
      credits the deposit exactly once.
- [ ] Deposit cancellation: `POST /invoices/:id/cancel-deposit` with
      reason + `refund:true` refunds payments then VOIDs; `refund:false`
      retains; repeat call returns `alreadyCancelled`.

## Role 2 — Technician (field surface)

- [ ] Cannot open staff Requests/quotes/invoices routes (403/redirect).
- [ ] Assigned job: record finding, change request, before/after photos.
- [ ] Completion blocked without required evidence per job type
      (DIAGNOSTIC needs finding; REPAIR/INSTALLATION need before+after).
- [ ] Live tracking: first location post requires explicit consent;
      consent timestamp recorded; non-assigned technician denied.

## Role 3 — Customer / portal (workspace surface)

- [ ] Submit request with photo upload → attachment cap enforced
      atomically at confirm.
- [ ] View/send quote responses; approve repair quote → job appears.
- [ ] Book appointment: availability respects company timezone
      (DST/midnight windows), time-off, expired holds.
- [ ] Pay invoice via checkout → webhook settles once (replay safe).
- [ ] Raise dispute → second dispute rejected (one OPEN per invoice).
- [ ] Completion summary shows before/after evidence (whitelist only).

## Role 4 — Payment / financial

- [ ] Sandbox provider rejected when `NODE_ENV=production` (boot fails).
- [ ] One OPEN checkout session per invoice (concurrent creates reuse or
      expire; partial unique index holds).
- [ ] Webhook failure leaves event retryable; stale sweep reprocesses.
- [ ] Refund uses stable idempotency key; PENDING/FAILED resumable.
- [ ] Diagnostic credit capped at amount actually paid, applied once via
      `InvoiceCreditApplication`.
- [ ] Integrity report: `check:phase8-integrity` → 0 violations after the
      full walkthrough.

## Exit criteria

Gate A (request→quote→job) and Gate C (completion→invoice→payment→closure)
are passed only when every checkbox above has recorded evidence on the
staging environment. Production flags (`REQUESTS_ENABLED`,
`PORTAL_REQUESTS_ENABLED`, `QUOTE_BEFORE_JOB_ENABLED`,
`COMPLETION_REVIEW_ENABLED`, `INVOICE_FROM_SCOPE_ENABLED`,
`ONLINE_PAYMENTS_ENABLED`, `DEPOSITS_ENABLED`, `LIVE_TRACKING_ENABLED`,
`NOTIFICATION_OUTBOX_ENABLED`) stay off until then.
