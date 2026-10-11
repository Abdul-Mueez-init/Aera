-- Corrective migration: bring the committed migration history in line with
-- schema.prisma and the live database.
--
-- schema.prisma defines PaymentOperationStatus with PROVIDER_ACCEPTED, but no
-- earlier migration ever added it, so a database built purely from the
-- committed migrations rejected that value. The live database already has it
-- (ordered between PROCESSING and COMPLETED), hence IF NOT EXISTS: this is a
-- no-op there and a real change on a fresh database.
--
-- Kept in its own migration on purpose: PostgreSQL cannot use a newly added
-- enum value in the same transaction that adds it.

ALTER TYPE "PaymentOperationStatus" ADD VALUE IF NOT EXISTS 'PROVIDER_ACCEPTED' BEFORE 'COMPLETED';
