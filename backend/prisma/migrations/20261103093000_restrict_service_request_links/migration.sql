ALTER TABLE "jobs"
  DROP CONSTRAINT "jobs_serviceRequest_company_fkey",
  DROP CONSTRAINT "jobs_sourceQuote_company_fkey",
  ADD CONSTRAINT "jobs_serviceRequest_company_fkey"
    FOREIGN KEY ("serviceRequestId", "companyId")
    REFERENCES "service_requests" ("id", "companyId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "jobs_sourceQuote_company_fkey"
    FOREIGN KEY ("sourceQuoteId", "companyId")
    REFERENCES "quotes" ("id", "companyId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "quotes"
  DROP CONSTRAINT "quotes_serviceRequest_company_fkey",
  DROP CONSTRAINT "quotes_basisJob_company_fkey",
  DROP CONSTRAINT "quotes_supersedesQuote_company_fkey",
  ADD CONSTRAINT "quotes_serviceRequest_company_fkey"
    FOREIGN KEY ("serviceRequestId", "companyId")
    REFERENCES "service_requests" ("id", "companyId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "quotes_basisJob_company_fkey"
    FOREIGN KEY ("basisJobId", "companyId")
    REFERENCES "jobs" ("id", "companyId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "quotes_supersedesQuote_company_fkey"
    FOREIGN KEY ("supersedesQuoteId", "companyId")
    REFERENCES "quotes" ("id", "companyId")
    ON DELETE RESTRICT ON UPDATE CASCADE;
