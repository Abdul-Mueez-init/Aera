-- Adds a secure, hashed invitation token to company_members so an invited
-- user can accept their invitation and set a password. Without this, a
-- CompanyMember created with status = INVITED has no way to ever become
-- ACTIVE, and the underlying User row (created with no passwordHash) can
-- never log in.

ALTER TABLE "company_members"
  ADD COLUMN "invitationTokenHash" TEXT,
  ADD COLUMN "invitationTokenExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "company_members_invitationTokenHash_key"
  ON "company_members" ("invitationTokenHash");