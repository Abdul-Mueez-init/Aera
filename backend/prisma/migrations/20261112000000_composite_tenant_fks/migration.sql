-- DropForeignKey
ALTER TABLE "invoice_credit_applications" DROP CONSTRAINT "invoice_credit_applications_sourceInvoiceId_fkey";

-- DropForeignKey
ALTER TABLE "invoice_credit_applications" DROP CONSTRAINT "invoice_credit_applications_targetInvoiceId_fkey";

-- DropForeignKey
ALTER TABLE "invoice_dispute_events" DROP CONSTRAINT "invoice_dispute_events_disputeId_fkey";

-- DropForeignKey
ALTER TABLE "invoice_disputes" DROP CONSTRAINT "invoice_disputes_customerId_fkey";

-- DropForeignKey
ALTER TABLE "invoice_disputes" DROP CONSTRAINT "invoice_disputes_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "payment_sessions" DROP CONSTRAINT "payment_sessions_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "payment_sessions" DROP CONSTRAINT "payment_sessions_portalSessionId_fkey";

-- DropForeignKey
ALTER TABLE "portal_audit_events" DROP CONSTRAINT "portal_audit_events_customerId_fkey";

-- DropForeignKey
ALTER TABLE "portal_audit_events" DROP CONSTRAINT "portal_audit_events_jobId_fkey";

-- DropForeignKey
ALTER TABLE "portal_sessions" DROP CONSTRAINT "portal_sessions_customerId_fkey";

-- DropForeignKey
ALTER TABLE "portal_sessions" DROP CONSTRAINT "portal_sessions_grantId_fkey";

-- DropForeignKey
ALTER TABLE "portal_sessions" DROP CONSTRAINT "portal_sessions_jobId_fkey";

-- DropForeignKey
ALTER TABLE "quote_acceptances" DROP CONSTRAINT "quote_acceptances_portalSessionId_fkey";

-- DropForeignKey
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "refunds" DROP CONSTRAINT "refunds_paymentId_fkey";

-- DropForeignKey
ALTER TABLE "service_request_attachments" DROP CONSTRAINT "service_request_attachments_customerId_fkey";

-- DropForeignKey
ALTER TABLE "service_request_attachments" DROP CONSTRAINT "service_request_attachments_session_fkey";

-- DropForeignKey
ALTER TABLE "service_request_messages" DROP CONSTRAINT "service_request_messages_customerId_fkey";

-- DropForeignKey
ALTER TABLE "service_request_messages" DROP CONSTRAINT "service_request_messages_session_fkey";

-- DropForeignKey
ALTER TABLE "service_request_uploads" DROP CONSTRAINT "service_request_uploads_customerId_fkey";

-- DropForeignKey
ALTER TABLE "service_request_uploads" DROP CONSTRAINT "service_request_uploads_session_fkey";

-- DropIndex
DROP INDEX "quotes_companyId_supersededByQuoteId_idx";

-- AlterTable
ALTER TABLE "invoice_dispute_events" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "invoice_disputes" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "invoice_items" ALTER COLUMN "sourceId" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "portal_delivery_tokens" ALTER COLUMN "id" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "invoice_disputes_id_companyId_key" ON "invoice_disputes"("id", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_id_companyId_key" ON "invoices"("id", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_id_companyId_key" ON "payments"("id", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "portal_access_grants_id_companyId_key" ON "portal_access_grants"("id", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "portal_sessions_id_companyId_key" ON "portal_sessions"("id", "companyId");

-- RenameForeignKey
ALTER TABLE "jobs" RENAME CONSTRAINT "jobs_serviceRequest_company_fkey" TO "jobs_serviceRequestId_companyId_fkey";

-- RenameForeignKey
ALTER TABLE "jobs" RENAME CONSTRAINT "jobs_sourceQuote_company_fkey" TO "jobs_sourceQuoteId_companyId_fkey";

-- RenameForeignKey
ALTER TABLE "quotes" RENAME CONSTRAINT "quotes_basisJob_company_fkey" TO "quotes_basisJobId_companyId_fkey";

-- RenameForeignKey
ALTER TABLE "quotes" RENAME CONSTRAINT "quotes_serviceRequest_company_fkey" TO "quotes_serviceRequestId_companyId_fkey";

-- RenameForeignKey
ALTER TABLE "quotes" RENAME CONSTRAINT "quotes_supersedesQuote_company_fkey" TO "quotes_supersedesQuoteId_companyId_fkey";

-- RenameForeignKey
ALTER TABLE "service_request_attachments" RENAME CONSTRAINT "service_request_attachments_request_company_fkey" TO "service_request_attachments_requestId_companyId_fkey";

-- RenameForeignKey
ALTER TABLE "service_request_attachments" RENAME CONSTRAINT "service_request_attachments_user_fkey" TO "service_request_attachments_uploaderUserId_fkey";

-- RenameForeignKey
ALTER TABLE "service_request_events" RENAME CONSTRAINT "service_request_events_request_company_fkey" TO "service_request_events_requestId_companyId_fkey";

-- RenameForeignKey
ALTER TABLE "service_request_messages" RENAME CONSTRAINT "service_request_messages_request_company_fkey" TO "service_request_messages_requestId_companyId_fkey";

-- RenameForeignKey
ALTER TABLE "service_request_messages" RENAME CONSTRAINT "service_request_messages_user_fkey" TO "service_request_messages_authorUserId_fkey";

-- RenameForeignKey
ALTER TABLE "service_request_uploads" RENAME CONSTRAINT "service_request_uploads_request_company_fkey" TO "service_request_uploads_requestId_companyId_fkey";

-- RenameForeignKey
ALTER TABLE "service_request_uploads" RENAME CONSTRAINT "service_request_uploads_user_fkey" TO "service_request_uploads_uploaderUserId_fkey";

-- RenameForeignKey
ALTER TABLE "service_requests" RENAME CONSTRAINT "service_requests_address_company_fkey" TO "service_requests_serviceAddressId_companyId_fkey";

-- RenameForeignKey
ALTER TABLE "service_requests" RENAME CONSTRAINT "service_requests_customer_company_fkey" TO "service_requests_customerId_companyId_fkey";

-- AddForeignKey
ALTER TABLE "quote_acceptances" ADD CONSTRAINT "quote_acceptances_portalSessionId_companyId_fkey" FOREIGN KEY ("portalSessionId", "companyId") REFERENCES "portal_sessions"("id", "companyId") ON DELETE SET NULL ("portalSessionId") ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_request_uploads" ADD CONSTRAINT "service_request_uploads_portalSessionId_companyId_fkey" FOREIGN KEY ("portalSessionId", "companyId") REFERENCES "portal_sessions"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_request_uploads" ADD CONSTRAINT "service_request_uploads_customerId_companyId_fkey" FOREIGN KEY ("customerId", "companyId") REFERENCES "customers"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_request_attachments" ADD CONSTRAINT "service_request_attachments_portalSessionId_companyId_fkey" FOREIGN KEY ("portalSessionId", "companyId") REFERENCES "portal_sessions"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_request_attachments" ADD CONSTRAINT "service_request_attachments_customerId_companyId_fkey" FOREIGN KEY ("customerId", "companyId") REFERENCES "customers"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_request_messages" ADD CONSTRAINT "service_request_messages_portalSessionId_companyId_fkey" FOREIGN KEY ("portalSessionId", "companyId") REFERENCES "portal_sessions"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_request_messages" ADD CONSTRAINT "service_request_messages_customerId_companyId_fkey" FOREIGN KEY ("customerId", "companyId") REFERENCES "customers"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_credit_applications" ADD CONSTRAINT "invoice_credit_applications_sourceInvoiceId_companyId_fkey" FOREIGN KEY ("sourceInvoiceId", "companyId") REFERENCES "invoices"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_credit_applications" ADD CONSTRAINT "invoice_credit_applications_targetInvoiceId_companyId_fkey" FOREIGN KEY ("targetInvoiceId", "companyId") REFERENCES "invoices"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentId_companyId_fkey" FOREIGN KEY ("paymentId", "companyId") REFERENCES "payments"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_invoiceId_companyId_fkey" FOREIGN KEY ("invoiceId", "companyId") REFERENCES "invoices"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_sessions" ADD CONSTRAINT "payment_sessions_invoiceId_companyId_fkey" FOREIGN KEY ("invoiceId", "companyId") REFERENCES "invoices"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_sessions" ADD CONSTRAINT "payment_sessions_portalSessionId_companyId_fkey" FOREIGN KEY ("portalSessionId", "companyId") REFERENCES "portal_sessions"("id", "companyId") ON DELETE SET NULL ("portalSessionId") ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_disputes" ADD CONSTRAINT "invoice_disputes_invoiceId_companyId_fkey" FOREIGN KEY ("invoiceId", "companyId") REFERENCES "invoices"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_disputes" ADD CONSTRAINT "invoice_disputes_customerId_companyId_fkey" FOREIGN KEY ("customerId", "companyId") REFERENCES "customers"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_dispute_events" ADD CONSTRAINT "invoice_dispute_events_disputeId_companyId_fkey" FOREIGN KEY ("disputeId", "companyId") REFERENCES "invoice_disputes"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_access_grants" ADD CONSTRAINT "portal_access_grants_customerId_companyId_fkey" FOREIGN KEY ("customerId", "companyId") REFERENCES "customers"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_access_grants" ADD CONSTRAINT "portal_access_grants_jobId_companyId_fkey" FOREIGN KEY ("jobId", "companyId") REFERENCES "jobs"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_access_grants" ADD CONSTRAINT "portal_access_grants_issuedBy_fkey" FOREIGN KEY ("issuedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_sessions" ADD CONSTRAINT "portal_sessions_grantId_companyId_fkey" FOREIGN KEY ("grantId", "companyId") REFERENCES "portal_access_grants"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_sessions" ADD CONSTRAINT "portal_sessions_customerId_companyId_fkey" FOREIGN KEY ("customerId", "companyId") REFERENCES "customers"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_sessions" ADD CONSTRAINT "portal_sessions_jobId_companyId_fkey" FOREIGN KEY ("jobId", "companyId") REFERENCES "jobs"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_audit_events" ADD CONSTRAINT "portal_audit_events_customerId_companyId_fkey" FOREIGN KEY ("customerId", "companyId") REFERENCES "customers"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_audit_events" ADD CONSTRAINT "portal_audit_events_jobId_companyId_fkey" FOREIGN KEY ("jobId", "companyId") REFERENCES "jobs"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Phase 1.6/P1-6 — same JOB-scope invariant portal_access_grants already
-- enforces: a JOB-scoped session must reference a job. WORKSPACE-scoped
-- sessions may still carry a jobId for context, matching grants.
ALTER TABLE "portal_sessions"
  ADD CONSTRAINT "portal_sessions_scope_job_check"
  CHECK ("scope" = 'WORKSPACE' OR "jobId" IS NOT NULL);
