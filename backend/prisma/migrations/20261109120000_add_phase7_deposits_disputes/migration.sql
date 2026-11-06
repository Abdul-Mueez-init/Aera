-- Phase 7 (tasks 7.1/7.4/7.6): deposit terms on quotes, frozen deposit on
-- acceptance, company deposit defaults, and the invoice dispute ledger.

CREATE TYPE "DepositType" AS ENUM ('NONE', 'FIXED', 'PERCENT');
CREATE TYPE "InvoiceDisputeReason" AS ENUM ('INCORRECT_AMOUNT', 'DUPLICATE_CHARGE', 'SERVICE_NOT_RENDERED', 'GOODS_NOT_RECEIVED', 'OTHER');
CREATE TYPE "InvoiceDisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED');
CREATE TYPE "InvoiceDisputeResolution" AS ENUM ('UPHELD', 'ADJUSTED', 'REFUNDED');

ALTER TABLE "quotes"
  ADD COLUMN "depositType" "DepositType" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "depositValue" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "depositMinor" BIGINT;

ALTER TABLE "quote_acceptances"
  ADD COLUMN "depositMinor" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "companies"
  ADD COLUMN "defaultDepositType" "DepositType" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "defaultDepositValue" BIGINT NOT NULL DEFAULT 0;

CREATE TABLE "invoice_disputes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "companyId" UUID NOT NULL,
  "invoiceId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "reason" "InvoiceDisputeReason" NOT NULL,
  "message" TEXT NOT NULL,
  "status" "InvoiceDisputeStatus" NOT NULL DEFAULT 'OPEN',
  "resolution" "InvoiceDisputeResolution",
  "resolutionNote" TEXT,
  "resolvedBy" UUID,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "invoice_disputes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "invoice_dispute_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "companyId" UUID NOT NULL,
  "disputeId" UUID NOT NULL,
  "actorUserId" UUID,
  "type" TEXT NOT NULL,
  "fromStatus" "InvoiceDisputeStatus",
  "toStatus" "InvoiceDisputeStatus",
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invoice_dispute_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "invoice_disputes"
  ADD CONSTRAINT "invoice_disputes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "invoice_disputes_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "invoice_disputes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "invoice_disputes_resolvedBy_fkey" FOREIGN KEY ("resolvedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "invoice_dispute_events"
  ADD CONSTRAINT "invoice_dispute_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "invoice_dispute_events_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "invoice_disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "invoice_dispute_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "invoice_disputes_companyId_status_createdAt_idx" ON "invoice_disputes"("companyId", "status", "createdAt" DESC);
CREATE INDEX "invoice_disputes_companyId_invoiceId_idx" ON "invoice_disputes"("companyId", "invoiceId");
CREATE INDEX "invoice_dispute_events_companyId_disputeId_createdAt_idx" ON "invoice_dispute_events"("companyId", "disputeId", "createdAt");

-- Row Level Security: same posture as the other tenant tables.
ALTER TABLE "invoice_disputes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice_dispute_events" ENABLE ROW LEVEL SECURITY;
