-- DropForeignKey
ALTER TABLE "device_tokens" DROP CONSTRAINT "device_tokens_companyId_fkey";

-- DropForeignKey
ALTER TABLE "device_tokens" DROP CONSTRAINT "device_tokens_userId_fkey";

-- AlterTable
ALTER TABLE "company_counters" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "device_tokens" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "lastSeenAt" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "presigned_uploads" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "presigned_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "presigned_uploads_companyId_jobId_expiresAt_idx" ON "presigned_uploads"("companyId", "jobId", "expiresAt");

-- CreateIndex
CREATE INDEX "presigned_uploads_expiresAt_idx" ON "presigned_uploads"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "presigned_uploads_objectKey_key" ON "presigned_uploads"("objectKey");

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presigned_uploads" ADD CONSTRAINT "presigned_uploads_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presigned_uploads" ADD CONSTRAINT "presigned_uploads_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "presigned_uploads" ADD CONSTRAINT "presigned_uploads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
