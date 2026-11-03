ALTER TABLE "quotes"
ADD COLUMN "assumptions" TEXT,
ADD COLUMN "exclusions" TEXT,
ADD COLUMN "supersededByQuoteId" UUID;

CREATE TYPE "QuoteAcceptanceActorType" AS ENUM ('STAFF', 'PORTAL');

CREATE INDEX "quotes_companyId_supersededByQuoteId_idx"
ON "quotes"("companyId", "supersededByQuoteId");

CREATE TABLE "quote_acceptances" (
    "id" UUID NOT NULL,
    "quoteId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "acceptedByType" "QuoteAcceptanceActorType" NOT NULL,
    "actorUserId" UUID,
    "portalSessionId" UUID,
    "subtotalMinor" BIGINT NOT NULL,
    "discountMinor" BIGINT NOT NULL,
    "taxMinor" BIGINT NOT NULL,
    "totalMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "itemsSnapshot" JSONB NOT NULL,
    "termsSnapshot" JSONB NOT NULL,
    "userAgentHash" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "quote_acceptances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "quote_acceptances_quoteId_key"
ON "quote_acceptances"("quoteId");
CREATE UNIQUE INDEX "quote_acceptances_quoteId_companyId_key"
ON "quote_acceptances"("quoteId", "companyId");
CREATE INDEX "quote_acceptances_companyId_acceptedAt_idx"
ON "quote_acceptances"("companyId", "acceptedAt");

ALTER TABLE "quote_acceptances"
ADD CONSTRAINT "quote_acceptances_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "quote_acceptances_quoteId_companyId_fkey"
FOREIGN KEY ("quoteId", "companyId") REFERENCES "quotes"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "quote_acceptances_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "quote_acceptances_portalSessionId_fkey"
FOREIGN KEY ("portalSessionId") REFERENCES "portal_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "quotes"
ADD CONSTRAINT "quotes_supersededByQuoteId_companyId_fkey"
FOREIGN KEY ("supersededByQuoteId", "companyId") REFERENCES "quotes"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
