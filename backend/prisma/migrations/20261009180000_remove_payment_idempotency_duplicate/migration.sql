-- Remove duplicate unique constraint from payments table
-- PaymentOperation already enforces idempotency via (companyId, idempotencyKey)
-- Payment retains idempotencyKey for traceability but should not enforce uniqueness separately

-- Drop the duplicate unique constraint
ALTER TABLE "payments" DROP CONSTRAINT "payments_companyId_idempotencyKey_key";
