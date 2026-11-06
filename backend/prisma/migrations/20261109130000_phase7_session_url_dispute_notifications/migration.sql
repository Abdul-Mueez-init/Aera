-- Phase 7 follow-up: persist the provider checkout URL on payment
-- sessions (idempotent replay must return it) and add dispute
-- notification types. Enum values go in their own migration because
-- Postgres cannot use a new enum value in the transaction that adds it.

ALTER TABLE "payment_sessions" ADD COLUMN "checkoutUrl" TEXT;

ALTER TYPE "NotificationType" ADD VALUE 'INVOICE_DISPUTE_OPENED';
ALTER TYPE "NotificationType" ADD VALUE 'INVOICE_DISPUTE_RESOLVED';
