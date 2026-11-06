-- Phase 7.5 follow-up: the Refund model gained an optional invoiceId
-- back-reference (denormalized for reporting) after the financial
-- foundations migration already ran. Add the missing column + FK.

ALTER TABLE "refunds" ADD COLUMN "invoiceId" UUID;

ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
