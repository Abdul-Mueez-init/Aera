-- Phase 7 hardening: at most one OPEN checkout session per invoice.
--
-- Without this, two checkout sessions created with different
-- Idempotency-Keys could both be captured by the provider; the second
-- settlement then fails the guarded balance update, leaving the customer
-- charged with no ledger payment and no automated refund path.
--
-- Partial unique index: only OPEN sessions conflict. COMPLETED, EXPIRED
-- and FAILED rows keep their history and free the slot.
CREATE UNIQUE INDEX "payment_sessions_one_open_per_invoice"
  ON "payment_sessions" ("invoiceId")
  WHERE "status" = 'OPEN';

-- Webhook events that fail processing keep processedAt NULL and are
-- retried (provider replay or the reconciliation sweep) instead of being
-- durably deduped as if they had succeeded. `attempts` bounds retries;
-- past the cap the event is dead-lettered with its error outcome.
ALTER TABLE "provider_webhook_events"
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
