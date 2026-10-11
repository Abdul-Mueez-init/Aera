-- Corrective migration: bring the committed migration history in line with
-- schema.prisma and the live database.
--
-- schema.prisma (model PaymentOperation) and payment-operation.service.ts use
-- "ledgerPaymentId", but no earlier migration created the column, so a database
-- built purely from the committed migrations failed on every payment write.
-- The live database already has it (nullable text, no foreign key), hence
-- IF NOT EXISTS: this is a no-op there and a real change on a fresh database.

ALTER TABLE "payment_operations" ADD COLUMN IF NOT EXISTS "ledgerPaymentId" TEXT;
