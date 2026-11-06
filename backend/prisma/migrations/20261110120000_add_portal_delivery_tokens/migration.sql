-- Phase 8.1 — single-use portal link tokens minted at outbox send time.
-- The NotificationOutbox row stores only the grant reference; the
-- plaintext token exists solely in the worker's memory during the send.

CREATE TABLE "portal_delivery_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "grantId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_delivery_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "portal_delivery_tokens_tokenHash_key"
    ON "portal_delivery_tokens"("tokenHash");

CREATE INDEX "portal_delivery_tokens_grantId_idx"
    ON "portal_delivery_tokens"("grantId");

ALTER TABLE "portal_delivery_tokens"
    ADD CONSTRAINT "portal_delivery_tokens_grantId_fkey"
    FOREIGN KEY ("grantId") REFERENCES "portal_access_grants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "portal_delivery_tokens" ENABLE ROW LEVEL SECURITY;
