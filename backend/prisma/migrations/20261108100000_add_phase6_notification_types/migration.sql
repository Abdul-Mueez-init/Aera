-- Phase 6 (tasks 6.4/6.5): change-request submission notifies staff, and a
-- CHANGES_REQUESTED review notifies the assigned technician. Separate
-- migration because new enum values cannot be used in the transaction
-- that adds them.
ALTER TYPE "NotificationType" ADD VALUE 'JOB_CHANGE_REQUEST_SUBMITTED';
ALTER TYPE "NotificationType" ADD VALUE 'JOB_REVIEW_CHANGES_REQUESTED';
