CREATE TABLE "customer_reviews" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customer_reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_reviews_companyId_jobId_key" ON "customer_reviews"("companyId", "jobId");
CREATE INDEX "customer_reviews_companyId_customerId_createdAt_idx" ON "customer_reviews"("companyId", "customerId", "createdAt" DESC);

ALTER TABLE "customer_reviews" ADD CONSTRAINT "customer_reviews_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_reviews" ADD CONSTRAINT "customer_reviews_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_reviews" ADD CONSTRAINT "customer_reviews_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;