-- Phase 1 (task 1.5): service-request lifecycle notification types.
-- Kept in its own migration because a new enum value cannot be used in the
-- same transaction that adds it (Postgres restriction).
ALTER TYPE "NotificationType" ADD VALUE 'REQUEST_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'REQUEST_INFO_PROVIDED';
ALTER TYPE "NotificationType" ADD VALUE 'REQUEST_STATUS_CHANGED';
