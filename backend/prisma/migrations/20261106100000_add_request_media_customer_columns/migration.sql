-- The customerId columns and relations on the request media/message tables
-- were added to schema.prisma without a migration. This additive migration
-- brings the database in line (nullable columns + FK to customers).
ALTER TABLE "service_request_uploads" ADD COLUMN "customerId" UUID;
ALTER TABLE "service_request_attachments" ADD COLUMN "customerId" UUID;
ALTER TABLE "service_request_messages" ADD COLUMN "customerId" UUID;

ALTER TABLE "service_request_uploads"
  ADD CONSTRAINT "service_request_uploads_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "customers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_request_attachments"
  ADD CONSTRAINT "service_request_attachments_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "customers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "service_request_messages"
  ADD CONSTRAINT "service_request_messages_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "customers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
