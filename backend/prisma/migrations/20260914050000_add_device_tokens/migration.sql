CREATE TYPE "DeviceTokenPlatform" AS ENUM ('ANDROID', 'IOS', 'WEB');

CREATE TABLE "device_tokens" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "companyId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "platform" "DeviceTokenPlatform" NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "lastSeenAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "device_tokens_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE,
  CONSTRAINT "device_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX "device_tokens_userId_idx" ON "device_tokens"("userId");
CREATE INDEX "device_tokens_companyId_idx" ON "device_tokens"("companyId");

ALTER TABLE "device_tokens" ENABLE ROW LEVEL SECURITY;