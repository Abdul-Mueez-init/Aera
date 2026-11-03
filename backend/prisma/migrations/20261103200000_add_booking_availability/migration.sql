CREATE TYPE "BookingMode" AS ENUM ('DISPATCHER_CONFIRMS', 'SELF_SERVE_WINDOWS');
CREATE TYPE "AppointmentProposalStatus" AS ENUM ('OPEN', 'PICKED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "AppointmentHoldStatus" AS ENUM ('HELD', 'CONFIRMED', 'RELEASED', 'EXPIRED');

ALTER TABLE "companies"
  ADD COLUMN "travelBufferMinutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "bookingMode" "BookingMode" NOT NULL DEFAULT 'DISPATCHER_CONFIRMS';

ALTER TABLE "company_services"
  ADD COLUMN "defaultDurationMinutes" INTEGER NOT NULL DEFAULT 60;

CREATE TABLE "company_business_hours" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "weekday" INTEGER NOT NULL,
  "open" TEXT NOT NULL,
  "close" TEXT NOT NULL,
  CONSTRAINT "company_business_hours_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "company_business_hours_companyId_weekday_key"
  ON "company_business_hours" ("companyId", "weekday");
CREATE INDEX "company_business_hours_companyId_weekday_idx"
  ON "company_business_hours" ("companyId", "weekday");
ALTER TABLE "company_business_hours"
  ADD CONSTRAINT "company_business_hours_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "technician_working_hours" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "technicianId" UUID NOT NULL,
  "weekday" INTEGER NOT NULL,
  "open" TEXT NOT NULL,
  "close" TEXT NOT NULL,
  CONSTRAINT "technician_working_hours_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "technician_working_hours_companyId_technicianId_weekday_key"
  ON "technician_working_hours" ("companyId", "technicianId", "weekday");
CREATE INDEX "technician_working_hours_companyId_technicianId_weekday_idx"
  ON "technician_working_hours" ("companyId", "technicianId", "weekday");
ALTER TABLE "technician_working_hours"
  ADD CONSTRAINT "technician_working_hours_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "technician_working_hours_technicianId_fkey"
  FOREIGN KEY ("technicianId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "technician_time_off" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "technicianId" UUID NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "reason" TEXT,
  CONSTRAINT "technician_time_off_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "technician_time_off_companyId_technicianId_startsAt_endsAt_idx"
  ON "technician_time_off" ("companyId", "technicianId", "startsAt", "endsAt");
ALTER TABLE "technician_time_off"
  ADD CONSTRAINT "technician_time_off_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "technician_time_off_technicianId_fkey"
  FOREIGN KEY ("technicianId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "technician_skills" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "technicianId" UUID NOT NULL,
  "serviceId" UUID NOT NULL,
  CONSTRAINT "technician_skills_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "technician_skills_companyId_technicianId_serviceId_key"
  ON "technician_skills" ("companyId", "technicianId", "serviceId");
CREATE INDEX "technician_skills_companyId_serviceId_idx"
  ON "technician_skills" ("companyId", "serviceId");
ALTER TABLE "technician_skills"
  ADD CONSTRAINT "technician_skills_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "technician_skills_technicianId_fkey"
  FOREIGN KEY ("technicianId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "technician_skills_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "company_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "appointment_proposals" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "requestId" UUID,
  "jobId" UUID,
  "quoteId" UUID,
  "windows" JSONB NOT NULL,
  "pickedWindow" JSONB,
  "status" "AppointmentProposalStatus" NOT NULL DEFAULT 'OPEN',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "pickedAt" TIMESTAMP(3),
  "pickedByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "appointment_proposals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "appointment_proposals_companyId_status_expiresAt_idx"
  ON "appointment_proposals" ("companyId", "status", "expiresAt");
CREATE INDEX "appointment_proposals_companyId_requestId_idx"
  ON "appointment_proposals" ("companyId", "requestId");
ALTER TABLE "appointment_proposals"
  ADD CONSTRAINT "appointment_proposals_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "appointment_proposals_requestId_companyId_fkey"
  FOREIGN KEY ("requestId", "companyId") REFERENCES "service_requests"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "appointment_proposals_jobId_companyId_fkey"
  FOREIGN KEY ("jobId", "companyId") REFERENCES "jobs"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "appointment_proposals_quoteId_companyId_fkey"
  FOREIGN KEY ("quoteId", "companyId") REFERENCES "quotes"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "appointment_proposals_pickedByUserId_fkey"
  FOREIGN KEY ("pickedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "appointment_holds" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "requestId" UUID,
  "jobId" UUID,
  "quoteId" UUID,
  "technicianId" UUID,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "windowEnd" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "status" "AppointmentHoldStatus" NOT NULL DEFAULT 'HELD',
  "createdByUserId" UUID,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "appointment_holds_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "appointment_holds_companyId_status_windowStart_windowEnd_idx"
  ON "appointment_holds" ("companyId", "status", "windowStart", "windowEnd");
CREATE INDEX "appointment_holds_companyId_jobId_idx"
  ON "appointment_holds" ("companyId", "jobId");
ALTER TABLE "appointment_holds"
  ADD CONSTRAINT "appointment_holds_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "appointment_holds_requestId_companyId_fkey"
  FOREIGN KEY ("requestId", "companyId") REFERENCES "service_requests"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "appointment_holds_jobId_companyId_fkey"
  FOREIGN KEY ("jobId", "companyId") REFERENCES "jobs"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "appointment_holds_quoteId_companyId_fkey"
  FOREIGN KEY ("quoteId", "companyId") REFERENCES "quotes"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "appointment_holds_technicianId_fkey"
  FOREIGN KEY ("technicianId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "appointment_holds_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "company_business_hours" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "technician_working_hours" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "technician_time_off" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "technician_skills" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "appointment_proposals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "appointment_holds" ENABLE ROW LEVEL SECURITY;
