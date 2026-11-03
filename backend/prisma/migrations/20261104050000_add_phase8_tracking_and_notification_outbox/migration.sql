CREATE TYPE "NotificationOutboxChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS', 'PUSH');
CREATE TYPE "NotificationOutboxStatus" AS ENUM ('QUEUED', 'PROVIDER_ACCEPTED', 'DELIVERED', 'FAILED', 'DEAD');

CREATE TABLE "notification_outbox" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "recipientUserId" UUID,
  "channel" "NotificationOutboxChannel" NOT NULL,
  "template" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "status" "NotificationOutboxStatus" NOT NULL DEFAULT 'QUEUED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "providerMessageId" TEXT,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notification_outbox_dedupeKey_key" ON "notification_outbox"("dedupeKey");
CREATE INDEX "notification_outbox_companyId_status_nextAttemptAt_idx"
  ON "notification_outbox"("companyId", "status", "nextAttemptAt");
CREATE INDEX "notification_outbox_companyId_recipientUserId_createdAt_idx"
  ON "notification_outbox"("companyId", "recipientUserId", "createdAt" DESC);
ALTER TABLE "notification_outbox"
  ADD CONSTRAINT "notification_outbox_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "notification_outbox_recipientUserId_fkey"
  FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "job_tracking_states" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "jobId" UUID NOT NULL,
  "lastLat" DOUBLE PRECISION NOT NULL,
  "lastLng" DOUBLE PRECISION NOT NULL,
  "accuracy" DOUBLE PRECISION,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "etaMinutes" INTEGER,
  "sharingActive" BOOLEAN NOT NULL DEFAULT true,
  "consentAt" TIMESTAMP(3),
  CONSTRAINT "job_tracking_states_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "job_tracking_states_jobId_key" ON "job_tracking_states"("jobId");
CREATE UNIQUE INDEX "job_tracking_states_jobId_companyId_key"
  ON "job_tracking_states"("jobId", "companyId");
CREATE INDEX "job_tracking_states_companyId_updatedAt_idx"
  ON "job_tracking_states"("companyId", "updatedAt");
ALTER TABLE "job_tracking_states"
  ADD CONSTRAINT "job_tracking_states_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "job_tracking_states_jobId_companyId_fkey"
  FOREIGN KEY ("jobId", "companyId") REFERENCES "jobs"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_outbox" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "job_tracking_states" ENABLE ROW LEVEL SECURITY;
