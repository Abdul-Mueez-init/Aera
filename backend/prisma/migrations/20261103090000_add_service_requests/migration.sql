CREATE TYPE "JobType" AS ENUM ('DIAGNOSTIC', 'REPAIR', 'INSTALLATION', 'MAINTENANCE', 'OTHER');
CREATE TYPE "ServiceRequestStatus" AS ENUM ('SUBMITTED', 'NEEDS_INFO', 'QUOTING', 'QUOTED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED', 'CLOSED');
CREATE TYPE "ServiceRequestSource" AS ENUM ('PHONE', 'WALK_IN', 'WEB_PORTAL', 'STAFF_DIRECT');
CREATE TYPE "ServiceRequestEventType" AS ENUM ('CREATED', 'STATUS_CHANGED', 'INSPECTION_MARKED', 'CLOSED', 'CANCELLED', 'REOPENED');
CREATE TYPE "QuoteKind" AS ENUM ('INSPECTION', 'REPAIR', 'INSTALLATION', 'CHANGE_ORDER', 'GENERAL');

ALTER TABLE "jobs"
  ADD COLUMN "serviceRequestId" UUID,
  ADD COLUMN "type" "JobType" NOT NULL DEFAULT 'OTHER',
  ADD COLUMN "sourceQuoteId" UUID;

ALTER TABLE "quotes"
  ADD COLUMN "serviceRequestId" UUID,
  ADD COLUMN "kind" "QuoteKind" NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN "basisJobId" UUID,
  ADD COLUMN "supersedesQuoteId" UUID;

CREATE TABLE "service_requests" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "serviceAddressId" UUID NOT NULL,
  "requestNumber" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "serviceCategory" TEXT NOT NULL,
  "priority" "JobPriority" NOT NULL DEFAULT 'NORMAL',
  "status" "ServiceRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
  "requiresInspection" BOOLEAN NOT NULL DEFAULT false,
  "source" "ServiceRequestSource" NOT NULL,
  "preferredWindows" JSONB,
  "budgetMinMinor" BIGINT,
  "budgetMaxMinor" BIGINT,
  "budgetCurrency" CHAR(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "service_request_events" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "requestId" UUID NOT NULL,
  "actorUserId" UUID,
  "type" "ServiceRequestEventType" NOT NULL,
  "fromStatus" "ServiceRequestStatus",
  "toStatus" "ServiceRequestStatus",
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_request_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customers_id_companyId_key" ON "customers" ("id", "companyId");
CREATE UNIQUE INDEX "service_addresses_id_companyId_key" ON "service_addresses" ("id", "companyId");
CREATE UNIQUE INDEX "jobs_id_companyId_key" ON "jobs" ("id", "companyId");
CREATE UNIQUE INDEX "quotes_id_companyId_key" ON "quotes" ("id", "companyId");
CREATE UNIQUE INDEX "jobs_sourceQuoteId_key" ON "jobs" ("sourceQuoteId");
CREATE UNIQUE INDEX "service_requests_id_companyId_key" ON "service_requests" ("id", "companyId");
CREATE UNIQUE INDEX "service_requests_companyId_requestNumber_key" ON "service_requests" ("companyId", "requestNumber");
CREATE INDEX "service_requests_companyId_status_createdAt_idx" ON "service_requests" ("companyId", "status", "createdAt" DESC);
CREATE INDEX "service_requests_companyId_customerId_idx" ON "service_requests" ("companyId", "customerId");
CREATE INDEX "service_request_events_companyId_requestId_createdAt_idx" ON "service_request_events" ("companyId", "requestId", "createdAt" DESC);
CREATE INDEX "quotes_companyId_serviceRequestId_idx" ON "quotes" ("companyId", "serviceRequestId");

ALTER TABLE "service_requests"
  ADD CONSTRAINT "service_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "service_requests_customer_company_fkey" FOREIGN KEY ("customerId", "companyId") REFERENCES "customers" ("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "service_requests_address_company_fkey" FOREIGN KEY ("serviceAddressId", "companyId") REFERENCES "service_addresses" ("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "service_request_events"
  ADD CONSTRAINT "service_request_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "service_request_events_request_company_fkey" FOREIGN KEY ("requestId", "companyId") REFERENCES "service_requests" ("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "service_request_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "jobs"
  ADD CONSTRAINT "jobs_serviceRequest_company_fkey" FOREIGN KEY ("serviceRequestId", "companyId") REFERENCES "service_requests" ("id", "companyId") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "jobs_sourceQuote_company_fkey" FOREIGN KEY ("sourceQuoteId", "companyId") REFERENCES "quotes" ("id", "companyId") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "quotes"
  ADD CONSTRAINT "quotes_serviceRequest_company_fkey" FOREIGN KEY ("serviceRequestId", "companyId") REFERENCES "service_requests" ("id", "companyId") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "quotes_basisJob_company_fkey" FOREIGN KEY ("basisJobId", "companyId") REFERENCES "jobs" ("id", "companyId") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "quotes_supersedesQuote_company_fkey" FOREIGN KEY ("supersedesQuoteId", "companyId") REFERENCES "quotes" ("id", "companyId") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "service_request_events" ENABLE ROW LEVEL SECURITY;
