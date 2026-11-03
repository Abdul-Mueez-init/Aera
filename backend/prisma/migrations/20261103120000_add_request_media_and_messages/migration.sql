CREATE TYPE "ServiceRequestUploaderType" AS ENUM ('STAFF', 'PORTAL');
CREATE TYPE "ServiceRequestAttachmentKind" AS ENUM ('PHOTO', 'VIDEO', 'DOCUMENT');
CREATE TYPE "ServiceRequestMessageAuthorType" AS ENUM ('STAFF', 'CUSTOMER');

ALTER TABLE "service_requests" ADD COLUMN "submissionKey" TEXT;
CREATE UNIQUE INDEX "service_requests_companyId_customerId_submissionKey_key"
  ON "service_requests" ("companyId", "customerId", "submissionKey");

CREATE TABLE "service_request_uploads" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "requestId" UUID NOT NULL,
  "uploaderType" "ServiceRequestUploaderType" NOT NULL,
  "uploaderUserId" UUID,
  "portalSessionId" UUID,
  "objectKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_request_uploads_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_request_uploads_uploader_check" CHECK (
    ("uploaderType" = 'STAFF' AND "uploaderUserId" IS NOT NULL AND "portalSessionId" IS NULL)
    OR ("uploaderType" = 'PORTAL' AND "uploaderUserId" IS NULL AND "portalSessionId" IS NOT NULL)
  )
);

CREATE TABLE "service_request_attachments" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "requestId" UUID NOT NULL,
  "uploaderType" "ServiceRequestUploaderType" NOT NULL,
  "uploaderUserId" UUID,
  "portalSessionId" UUID,
  "objectKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" BIGINT NOT NULL,
  "kind" "ServiceRequestAttachmentKind" NOT NULL,
  "caption" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_request_attachments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_request_attachments_uploader_check" CHECK (
    ("uploaderType" = 'STAFF' AND "uploaderUserId" IS NOT NULL AND "portalSessionId" IS NULL)
    OR ("uploaderType" = 'PORTAL' AND "uploaderUserId" IS NULL AND "portalSessionId" IS NOT NULL)
  )
);

CREATE TABLE "service_request_messages" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "requestId" UUID NOT NULL,
  "authorType" "ServiceRequestMessageAuthorType" NOT NULL,
  "authorUserId" UUID,
  "portalSessionId" UUID,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_request_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "service_request_messages_author_check" CHECK (
    ("authorType" = 'STAFF' AND "authorUserId" IS NOT NULL AND "portalSessionId" IS NULL)
    OR ("authorType" = 'CUSTOMER' AND "authorUserId" IS NULL AND "portalSessionId" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "service_request_uploads_objectKey_key" ON "service_request_uploads" ("objectKey");
CREATE UNIQUE INDEX "service_request_uploads_id_companyId_key" ON "service_request_uploads" ("id", "companyId");
CREATE UNIQUE INDEX "service_request_attachments_companyId_objectKey_key" ON "service_request_attachments" ("companyId", "objectKey");
CREATE INDEX "service_request_uploads_companyId_requestId_idx" ON "service_request_uploads" ("companyId", "requestId");
CREATE INDEX "service_request_uploads_expiresAt_confirmedAt_idx" ON "service_request_uploads" ("expiresAt", "confirmedAt");
CREATE INDEX "service_request_attachments_companyId_requestId_createdAt_idx" ON "service_request_attachments" ("companyId", "requestId", "createdAt" DESC);
CREATE INDEX "service_request_messages_companyId_requestId_createdAt_idx" ON "service_request_messages" ("companyId", "requestId", "createdAt" DESC);

ALTER TABLE "service_request_uploads"
  ADD CONSTRAINT "service_request_uploads_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "service_request_uploads_request_company_fkey" FOREIGN KEY ("requestId", "companyId") REFERENCES "service_requests" ("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "service_request_uploads_user_fkey" FOREIGN KEY ("uploaderUserId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "service_request_uploads_session_fkey" FOREIGN KEY ("portalSessionId") REFERENCES "portal_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_request_attachments"
  ADD CONSTRAINT "service_request_attachments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "service_request_attachments_request_company_fkey" FOREIGN KEY ("requestId", "companyId") REFERENCES "service_requests" ("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "service_request_attachments_user_fkey" FOREIGN KEY ("uploaderUserId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "service_request_attachments_session_fkey" FOREIGN KEY ("portalSessionId") REFERENCES "portal_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_request_messages"
  ADD CONSTRAINT "service_request_messages_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "service_request_messages_request_company_fkey" FOREIGN KEY ("requestId", "companyId") REFERENCES "service_requests" ("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "service_request_messages_user_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "service_request_messages_session_fkey" FOREIGN KEY ("portalSessionId") REFERENCES "portal_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "service_request_uploads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "service_request_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "service_request_messages" ENABLE ROW LEVEL SECURITY;
