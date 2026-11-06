-- Phase 7 financial foundations. All changes are additive.
CREATE TYPE "InvoiceKind" AS ENUM ('STANDARD', 'DEPOSIT');
CREATE TYPE "PaymentOperationSource" AS ENUM ('STAFF', 'PORTAL', 'WEBHOOK');
CREATE TYPE "PaymentSessionStatus" AS ENUM ('OPEN', 'COMPLETED', 'EXPIRED', 'FAILED');
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

ALTER TABLE "invoices"
  ADD COLUMN "kind" "InvoiceKind" NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN "serviceRequestId" UUID;

CREATE INDEX "invoices_companyId_serviceRequestId_idx"
  ON "invoices"("companyId", "serviceRequestId");

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_serviceRequestId_companyId_fkey"
  FOREIGN KEY ("serviceRequestId", "companyId")
  REFERENCES "service_requests"("id", "companyId")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_amountPaidMinor_not_exceed_total"
  CHECK ("amountPaidMinor" <= "totalMinor"),
  ADD CONSTRAINT "invoices_balanceDueMinor_non_negative"
  CHECK ("balanceDueMinor" >= 0);

ALTER TABLE "payment_operations"
  ALTER COLUMN "userId" DROP NOT NULL,
  ADD COLUMN "source" "PaymentOperationSource" NOT NULL DEFAULT 'STAFF';

ALTER TABLE "payment_operations"
  DROP CONSTRAINT IF EXISTS "payment_operations_userId_fkey";

ALTER TABLE "payment_operations"
  ADD CONSTRAINT "payment_operations_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "invoice_credit_applications" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "sourceInvoiceId" UUID NOT NULL,
  "targetInvoiceId" UUID NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invoice_credit_applications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invoice_credit_applications_sourceInvoiceId_targetInvoiceId_key"
  ON "invoice_credit_applications"("sourceInvoiceId", "targetInvoiceId");
CREATE INDEX "invoice_credit_applications_companyId_sourceInvoiceId_idx"
  ON "invoice_credit_applications"("companyId", "sourceInvoiceId");
CREATE INDEX "invoice_credit_applications_companyId_targetInvoiceId_idx"
  ON "invoice_credit_applications"("companyId", "targetInvoiceId");
ALTER TABLE "invoice_credit_applications"
  ADD CONSTRAINT "invoice_credit_applications_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "invoice_credit_applications_sourceInvoiceId_fkey"
  FOREIGN KEY ("sourceInvoiceId") REFERENCES "invoices"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "invoice_credit_applications_targetInvoiceId_fkey"
  FOREIGN KEY ("targetInvoiceId") REFERENCES "invoices"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "invoice_credit_applications_amount_positive"
  CHECK ("amountMinor" > 0);

CREATE TABLE "refunds" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "paymentId" UUID NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "reason" TEXT NOT NULL,
  "providerRefundId" TEXT,
  "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
  "createdBy" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "refunds_companyId_paymentId_createdAt_idx"
  ON "refunds"("companyId", "paymentId", "createdAt" DESC);
ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "refunds_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "payments"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "refunds_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "refunds_amount_positive"
  CHECK ("amountMinor" > 0);

CREATE TABLE "payment_sessions" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "invoiceId" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "providerSessionId" TEXT NOT NULL,
  "amountMinor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "status" "PaymentSessionStatus" NOT NULL DEFAULT 'OPEN',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "portalSessionId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_sessions_providerSessionId_key"
  ON "payment_sessions"("providerSessionId");
CREATE UNIQUE INDEX "payment_sessions_companyId_idempotencyKey_key"
  ON "payment_sessions"("companyId", "idempotencyKey");
CREATE INDEX "payment_sessions_companyId_invoiceId_status_idx"
  ON "payment_sessions"("companyId", "invoiceId", "status");
CREATE INDEX "payment_sessions_status_expiresAt_idx"
  ON "payment_sessions"("status", "expiresAt");
ALTER TABLE "payment_sessions"
  ADD CONSTRAINT "payment_sessions_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "payment_sessions_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "payment_sessions_portalSessionId_fkey"
  FOREIGN KEY ("portalSessionId") REFERENCES "portal_sessions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "payment_sessions_amount_positive"
  CHECK ("amountMinor" > 0);

CREATE TABLE "provider_webhook_events" (
  "id" UUID NOT NULL,
  "companyId" UUID,
  "provider" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "payload" JSONB,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "outcome" TEXT,
  CONSTRAINT "provider_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "provider_webhook_events_provider_eventId_key"
  ON "provider_webhook_events"("provider", "eventId");
CREATE INDEX "provider_webhook_events_provider_receivedAt_idx"
  ON "provider_webhook_events"("provider", "receivedAt");
ALTER TABLE "provider_webhook_events"
  ADD CONSTRAINT "provider_webhook_events_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "companies"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
