-- Phase 2: expand job-bound portal identity into tenant-scoped workspaces.

CREATE TYPE "PortalGrantScope" AS ENUM ('JOB', 'WORKSPACE');

ALTER TABLE "portal_access_grants"
  ALTER COLUMN "jobId" DROP NOT NULL;

ALTER TABLE "portal_access_grants"
  ADD COLUMN "scope" "PortalGrantScope" NOT NULL DEFAULT 'JOB';

ALTER TABLE "portal_sessions"
  ALTER COLUMN "jobId" DROP NOT NULL;

ALTER TABLE "portal_sessions"
  ADD COLUMN "scope" "PortalGrantScope" NOT NULL DEFAULT 'JOB';

ALTER TABLE "portal_audit_events"
  ALTER COLUMN "jobId" DROP NOT NULL,
  ADD COLUMN "resourceType" TEXT,
  ADD COLUMN "resourceId" UUID;

ALTER TABLE "portal_sessions"
  ADD CONSTRAINT "portal_sessions_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE NOT VALID,
  ADD CONSTRAINT "portal_sessions_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id")
    ON DELETE CASCADE ON UPDATE CASCADE NOT VALID,
  ADD CONSTRAINT "portal_sessions_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "jobs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

ALTER TABLE "portal_audit_events"
  ADD CONSTRAINT "portal_audit_events_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE NOT VALID,
  ADD CONSTRAINT "portal_audit_events_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "customers"("id")
    ON DELETE CASCADE ON UPDATE CASCADE NOT VALID,
  ADD CONSTRAINT "portal_audit_events_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "jobs"("id")
    ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

ALTER TABLE "portal_sessions"
  VALIDATE CONSTRAINT "portal_sessions_companyId_fkey",
  VALIDATE CONSTRAINT "portal_sessions_customerId_fkey",
  VALIDATE CONSTRAINT "portal_sessions_jobId_fkey";

ALTER TABLE "portal_audit_events"
  VALIDATE CONSTRAINT "portal_audit_events_companyId_fkey",
  VALIDATE CONSTRAINT "portal_audit_events_customerId_fkey",
  VALIDATE CONSTRAINT "portal_audit_events_jobId_fkey";

ALTER TABLE "portal_access_grants"
  ADD CONSTRAINT "portal_access_grants_scope_job_check"
  CHECK ("scope" = 'WORKSPACE' OR "jobId" IS NOT NULL);

CREATE UNIQUE INDEX "portal_access_grants_one_active_workspace"
  ON "portal_access_grants" ("companyId", "customerId")
  WHERE "scope" = 'WORKSPACE' AND "status" = 'ACTIVE';

CREATE INDEX "portal_access_grants_companyId_customerId_scope_status_idx"
  ON "portal_access_grants" ("companyId", "customerId", "scope", "status");

CREATE INDEX "portal_audit_events_companyId_resourceType_resourceId_idx"
  ON "portal_audit_events" ("companyId", "resourceType", "resourceId");
