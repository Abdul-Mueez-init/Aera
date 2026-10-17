-- Additive onboarding persistence. Existing companies are treated as already
-- onboarded so the new router does not lock out accounts created before this
-- migration; newly registered companies retain NULL until setup is completed.
ALTER TABLE "companies"
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "taxId" TEXT,
  ADD COLUMN "logoObjectKey" TEXT,
  ADD COLUMN "headquartersAddress" TEXT,
  ADD COLUMN "headquartersLatitude" DECIMAL(10,7),
  ADD COLUMN "headquartersLongitude" DECIMAL(10,7),
  ADD COLUMN "serviceRadiusKm" INTEGER,
  ADD COLUMN "onboardingStep" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);

UPDATE "companies"
SET "onboardingCompletedAt" = "createdAt"
WHERE "onboardingCompletedAt" IS NULL;

ALTER TABLE "companies"
  ADD CONSTRAINT "companies_onboardingStep_check" CHECK ("onboardingStep" BETWEEN 1 AND 4),
  ADD CONSTRAINT "companies_serviceRadiusKm_check" CHECK ("serviceRadiusKm" IS NULL OR "serviceRadiusKm" BETWEEN 10 AND 50),
  ADD CONSTRAINT "companies_headquartersLatitude_check" CHECK ("headquartersLatitude" IS NULL OR "headquartersLatitude" BETWEEN -90 AND 90),
  ADD CONSTRAINT "companies_headquartersLongitude_check" CHECK ("headquartersLongitude" IS NULL OR "headquartersLongitude" BETWEEN -180 AND 180);

CREATE TABLE "company_services" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "serviceKey" TEXT,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "iconKey" TEXT NOT NULL,
  "isCustom" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "company_services_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "company_services_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "company_services_companyId_normalizedName_key"
  ON "company_services"("companyId", "normalizedName");
CREATE INDEX "company_services_companyId_createdAt_idx"
  ON "company_services"("companyId", "createdAt");

CREATE TABLE "company_service_zones" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "providerPlaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "latitude" DECIMAL(10,7) NOT NULL,
  "longitude" DECIMAL(10,7) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "company_service_zones_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "company_service_zones_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "company_service_zones_latitude_check" CHECK ("latitude" BETWEEN -90 AND 90),
  CONSTRAINT "company_service_zones_longitude_check" CHECK ("longitude" BETWEEN -180 AND 180)
);
CREATE UNIQUE INDEX "company_service_zones_companyId_providerPlaceId_key"
  ON "company_service_zones"("companyId", "providerPlaceId");
CREATE INDEX "company_service_zones_companyId_isActive_idx"
  ON "company_service_zones"("companyId", "isActive");
