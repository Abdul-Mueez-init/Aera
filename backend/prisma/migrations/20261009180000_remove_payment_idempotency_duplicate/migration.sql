-- Remove duplicate unique constraint from payments table
-- PaymentOperation already enforces idempotency via (companyId, idempotencyKey)
-- Payment retains idempotencyKey for traceability but should not enforce uniqueness separately

-- Drop the duplicate unique index (original was created as CREATE UNIQUE INDEX, not a constraint)
DROP INDEX IF EXISTS "payments_companyId_idempotencyKey_key";
