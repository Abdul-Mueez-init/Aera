-- Secure Customer Portal: portal access grants, sessions, audit events, and
-- handshake fields on jobs (handoff_doc section 5.2).
--
-- This file replaces an earlier baseline-marker version that contained no DDL
-- (it assumed the tables already existed from a previous db push). That
-- assumption is false for a fresh database and for the live Supabase project,
-- so the real DDL is recorded here. Databases that already have these objects
-- must mark this migration as applied instead of running it
-- (prisma migrate resolve --applied 20261022204225_add_portal_access_grants_and_handshake).

-- CreateEnum
CREATE TYPE "PortalGrantStatus" AS ENUM ('ACTIVE', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "PortalDeactivationReason" AS ENUM ('AUTO_COMPLETED', 'AUTO_CANCELLED', 'AUTO_MAX_AGE', 'AUTO_LINK_UNUSED', 'MANUAL', 'REISSUED');

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "handshakeFailedAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "handshakeLockedUntil" TIMESTAMP(3),
ADD COLUMN     "handshakeVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "handshakeVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "portal_access_grants" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "issuedBy" UUID,
    "linkTokenHash" TEXT NOT NULL,
    "linkExpiresAt" TIMESTAMP(3) NOT NULL,
    "linkConsumedAt" TIMESTAMP(3),
    "status" "PortalGrantStatus" NOT NULL DEFAULT 'ACTIVE',
    "deactivatedAt" TIMESTAMP(3),
    "deactivatedReason" "PortalDeactivationReason",
    "deactivatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_sessions" (
    "id" UUID NOT NULL,
    "grantId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "sessionTokenHash" TEXT NOT NULL,
    "userAgentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "portal_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_audit_events" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "customerId" UUID,
    "grantId" UUID,
    "actorUserId" UUID,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "portal_access_grants_linkTokenHash_key" ON "portal_access_grants"("linkTokenHash");

-- CreateIndex
CREATE INDEX "portal_access_grants_companyId_jobId_status_idx" ON "portal_access_grants"("companyId", "jobId", "status");

-- CreateIndex
CREATE INDEX "portal_access_grants_status_linkExpiresAt_idx" ON "portal_access_grants"("status", "linkExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "portal_sessions_sessionTokenHash_key" ON "portal_sessions"("sessionTokenHash");

-- CreateIndex
CREATE INDEX "portal_sessions_grantId_revokedAt_idx" ON "portal_sessions"("grantId", "revokedAt");

-- CreateIndex
CREATE INDEX "portal_audit_events_companyId_jobId_createdAt_idx" ON "portal_audit_events"("companyId", "jobId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "portal_audit_events_companyId_customerId_createdAt_idx" ON "portal_audit_events"("companyId", "customerId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "portal_access_grants" ADD CONSTRAINT "portal_access_grants_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_access_grants" ADD CONSTRAINT "portal_access_grants_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_access_grants" ADD CONSTRAINT "portal_access_grants_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_access_grants" ADD CONSTRAINT "portal_access_grants_issuedBy_fkey" FOREIGN KEY ("issuedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_sessions" ADD CONSTRAINT "portal_sessions_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "portal_access_grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateIndex (partial, hand-appended per handoff section 5.2: Prisma cannot
-- express partial indexes). At most one ACTIVE grant per job.
CREATE UNIQUE INDEX "portal_access_grants_one_active_per_job"
  ON "portal_access_grants" ("jobId") WHERE "status" = 'ACTIVE';
