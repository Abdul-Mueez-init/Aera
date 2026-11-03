ALTER TABLE "payment_operations"
ADD COLUMN "nextRetryAt" TIMESTAMP(3);

CREATE INDEX "payment_operations_status_nextRetryAt_idx"
ON "payment_operations"("status", "nextRetryAt");

CREATE TABLE "invoice_reminder_claims" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_reminder_claims_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invoice_reminder_claims_companyId_invoiceId_windowStart_key"
ON "invoice_reminder_claims"("companyId", "invoiceId", "windowStart");

CREATE INDEX "invoice_reminder_claims_companyId_createdAt_idx"
ON "invoice_reminder_claims"("companyId", "createdAt");

ALTER TABLE "invoice_reminder_claims"
ADD CONSTRAINT "invoice_reminder_claims_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invoice_reminder_claims"
ADD CONSTRAINT "invoice_reminder_claims_invoiceId_fkey"
FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
