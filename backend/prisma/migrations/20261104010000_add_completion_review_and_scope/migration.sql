CREATE TYPE "JobReviewState" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'CHANGES_REQUESTED');
CREATE TYPE "JobChangeRequestStatus" AS ENUM ('OPEN', 'QUOTED', 'DECLINED', 'WITHDRAWN');
CREATE TYPE "InvoiceItemSourceType" AS ENUM ('QUOTE_ITEM', 'JOB_PART', 'AUTHORIZATION', 'MANUAL');

ALTER TABLE "companies"
  ADD COLUMN "requireCompletionReview" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "emergencyAuthorizationAllowed" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "jobs"
  ADD COLUMN "reviewState" "JobReviewState" NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "reviewedBy" UUID,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewNote" TEXT;

CREATE TABLE "job_findings" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "jobId" UUID NOT NULL,
  "authorUserId" UUID NOT NULL,
  "summary" TEXT NOT NULL,
  "recommendedWork" TEXT,
  "equipmentInfo" JSONB,
  "likelyParts" JSONB,
  "estimatedLaborMinutes" INTEGER,
  "customerVisible" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "job_findings_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "job_findings_companyId_jobId_createdAt_idx"
  ON "job_findings" ("companyId", "jobId", "createdAt" DESC);
ALTER TABLE "job_findings"
  ADD CONSTRAINT "job_findings_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "job_findings_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "job_findings_authorUserId_fkey"
    FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "job_change_requests" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "jobId" UUID NOT NULL,
  "technicianId" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "estimatedPriceMinor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "status" "JobChangeRequestStatus" NOT NULL DEFAULT 'OPEN',
  "evidencePhotoIds" JSONB,
  "authorizationReason" TEXT,
  "authorizedBy" UUID,
  "authorizedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "job_change_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "job_change_requests_companyId_jobId_status_createdAt_idx"
  ON "job_change_requests" ("companyId", "jobId", "status", "createdAt" DESC);
ALTER TABLE "job_change_requests"
  ADD CONSTRAINT "job_change_requests_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "job_change_requests_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "job_change_requests_technicianId_fkey"
    FOREIGN KEY ("technicianId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "job_change_requests_authorizedBy_fkey"
    FOREIGN KEY ("authorizedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "invoice_items"
  ADD COLUMN "sourceType" "InvoiceItemSourceType",
  ADD COLUMN "sourceId" UUID;

ALTER TABLE "jobs"
  ADD CONSTRAINT "jobs_reviewedBy_fkey"
    FOREIGN KEY ("reviewedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "job_findings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "job_change_requests" ENABLE ROW LEVEL SECURITY;
