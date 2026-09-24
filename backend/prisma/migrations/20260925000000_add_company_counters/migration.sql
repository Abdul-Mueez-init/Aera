-- CreateTable
CREATE TABLE "company_counters" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_counters_companyId_kind_key" ON "company_counters"("companyId", "kind");

-- CreateIndex
CREATE INDEX "company_counters_companyId_kind_idx" ON "company_counters"("companyId", "kind");

-- AddForeignKey
ALTER TABLE "company_counters" ADD CONSTRAINT "company_counters_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RowLevelSecurity
ALTER TABLE "company_counters" ENABLE ROW LEVEL SECURITY;

-- Seed existing jobs
INSERT INTO "company_counters" ("id", "companyId", "kind", "lastValue", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "companyId", 'JOB_NUMBER', COALESCE(MAX("jobNumber"), 0), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "jobs"
GROUP BY "companyId"
ON CONFLICT ("companyId", "kind") DO NOTHING;

-- Seed existing invoices
INSERT INTO "company_counters" ("id", "companyId", "kind", "lastValue", "createdAt", "updatedAt")
SELECT
    gen_random_uuid(),
    "companyId",
    'INVOICE_NUMBER',
    COALESCE(MAX(NULLIF(regexp_replace("invoiceNumber", '\D', '', 'g'), '')::integer), 0),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "invoices"
GROUP BY "companyId"
ON CONFLICT ("companyId", "kind") DO NOTHING;

-- Seed remaining companies with 0
INSERT INTO "company_counters" ("id", "companyId", "kind", "lastValue", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "id", 'JOB_NUMBER', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "companies"
ON CONFLICT ("companyId", "kind") DO NOTHING;

INSERT INTO "company_counters" ("id", "companyId", "kind", "lastValue", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "id", 'INVOICE_NUMBER', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "companies"
ON CONFLICT ("companyId", "kind") DO NOTHING;
