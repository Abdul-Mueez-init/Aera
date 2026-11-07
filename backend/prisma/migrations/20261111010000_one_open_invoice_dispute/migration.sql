-- Phase 7.6 hardening: at most one open dispute per invoice.
--
-- The service checked for an existing open dispute with a read-then-create
-- that raced under parallel portal requests. This partial unique index
-- makes the second concurrent insert fail instead of silently duplicating.
CREATE UNIQUE INDEX "invoice_disputes_one_open_per_invoice"
  ON "invoice_disputes" ("invoiceId")
  WHERE "status" IN ('OPEN', 'UNDER_REVIEW');
