-- CreateEnum
CREATE TYPE "PaymentOperationStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "payment_operations" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "provider" TEXT NOT NULL,
    "reference" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" "PaymentOperationStatus" NOT NULL DEFAULT 'PENDING',
    "providerPaymentId" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_operations_companyId_invoiceId_status_idx" ON "payment_operations"("companyId", "invoiceId", "status");

-- CreateIndex
CREATE INDEX "payment_operations_status_createdAt_idx" ON "payment_operations"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payment_operations_companyId_idempotencyKey_key" ON "payment_operations"("companyId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "payment_operations" ADD CONSTRAINT "payment_operations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_operations" ADD CONSTRAINT "payment_operations_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_operations" ADD CONSTRAINT "payment_operations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
