-- CreateIndex
CREATE INDEX "customer_portal_tokens_companyId_createdBy_idx" ON "customer_portal_tokens"("companyId", "createdBy");

-- CreateIndex
CREATE INDEX "invoices_companyId_createdBy_idx" ON "invoices"("companyId", "createdBy");

-- CreateIndex
CREATE INDEX "job_notes_companyId_authorUserId_idx" ON "job_notes"("companyId", "authorUserId");

-- CreateIndex
CREATE INDEX "job_photos_companyId_uploadedBy_idx" ON "job_photos"("companyId", "uploadedBy");

-- CreateIndex
CREATE INDEX "job_status_history_companyId_actorUserId_idx" ON "job_status_history"("companyId", "actorUserId");

-- CreateIndex
CREATE INDEX "jobs_companyId_customerId_idx" ON "jobs"("companyId", "customerId");

-- CreateIndex
CREATE INDEX "jobs_companyId_serviceAddressId_idx" ON "jobs"("companyId", "serviceAddressId");

-- CreateIndex
CREATE INDEX "payments_companyId_createdBy_idx" ON "payments"("companyId", "createdBy");

-- CreateIndex
CREATE INDEX "quotes_companyId_jobId_idx" ON "quotes"("companyId", "jobId");
