CREATE TABLE "customer_portal_tokens" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "createdBy" UUID,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_portal_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_portal_tokens_token_key" ON "customer_portal_tokens"("token");
CREATE INDEX "customer_portal_tokens_companyId_customerId_revokedAt_expiresAt_idx" ON "customer_portal_tokens"("companyId", "customerId", "revokedAt", "expiresAt");

ALTER TABLE "customer_portal_tokens" ADD CONSTRAINT "customer_portal_tokens_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_portal_tokens" ADD CONSTRAINT "customer_portal_tokens_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_portal_tokens" ADD CONSTRAINT "customer_portal_tokens_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;