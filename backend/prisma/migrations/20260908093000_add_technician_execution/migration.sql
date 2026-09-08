-- CreateEnum
CREATE TYPE "JobPhotoKind" AS ENUM ('BEFORE', 'AFTER', 'OTHER');

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN "completionSummary" TEXT;

-- CreateTable
CREATE TABLE "job_photos" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "uploadedBy" UUID NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "kind" "JobPhotoKind" NOT NULL DEFAULT 'OTHER',
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "job_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_parts" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unitPriceMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "job_parts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_photos_companyId_jobId_createdAt_idx" ON "job_photos"("companyId", "jobId", "createdAt" DESC);
CREATE INDEX "job_parts_companyId_jobId_createdAt_idx" ON "job_parts"("companyId", "jobId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "job_photos" ADD CONSTRAINT "job_photos_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_photos" ADD CONSTRAINT "job_photos_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_photos" ADD CONSTRAINT "job_photos_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "job_parts" ADD CONSTRAINT "job_parts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "job_parts" ADD CONSTRAINT "job_parts_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
