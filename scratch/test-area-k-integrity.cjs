const { createRequire } = require('module');
const backendRequire = createRequire('c:/development/aera/backend/package.json');
const { PrismaPg } = backendRequire('@prisma/adapter-pg');
const { PrismaClient } = backendRequire('./src/generated/prisma');

const connectionString = "postgresql://postgres:Mueezy20%40@localhost:5432/aera_test";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function runIntegrityChecks() {
  console.log('=== AREA K: DATA INTEGRITY SQL CHECKS ===\n');
  let passCount = 0;
  let failCount = 0;

  function report(name, violations) {
    if (violations === 0) {
      console.log(`[PASS] ${name}: 0 violations`);
      passCount++;
    } else {
      console.log(`[FAIL] ${name}: ${violations} VIOLATIONS FOUND`);
      failCount++;
    }
  }

  try {
    // 1. Orphan Checks
    const orphanJobs = await prisma.$queryRawUnsafe(`
      SELECT count(*)::int AS count FROM jobs j
      LEFT JOIN companies c ON j."companyId" = c.id
      LEFT JOIN customers cust ON j."customerId" = cust.id
      WHERE c.id IS NULL OR cust.id IS NULL;
    `);
    report('Orphan jobs (missing company or customer)', orphanJobs[0].count);

    const orphanQuotes = await prisma.$queryRawUnsafe(`
      SELECT count(*)::int AS count FROM quotes q
      LEFT JOIN companies c ON q."companyId" = c.id
      LEFT JOIN customers cust ON q."customerId" = cust.id
      LEFT JOIN jobs j ON q."jobId" = j.id
      WHERE c.id IS NULL OR cust.id IS NULL OR (q."jobId" IS NOT NULL AND j.id IS NULL);
    `);
    report('Orphan quotes (missing company, customer, or job)', orphanQuotes[0].count);

    const orphanInvoices = await prisma.$queryRawUnsafe(`
      SELECT count(*)::int AS count FROM invoices i
      LEFT JOIN companies c ON i."companyId" = c.id
      LEFT JOIN customers cust ON i."customerId" = cust.id
      LEFT JOIN jobs j ON i."jobId" = j.id
      WHERE c.id IS NULL OR cust.id IS NULL OR (i."jobId" IS NOT NULL AND j.id IS NULL);
    `);
    report('Orphan invoices (missing company, customer, or job)', orphanInvoices[0].count);

    const orphanPayments = await prisma.$queryRawUnsafe(`
      SELECT count(*)::int AS count FROM payments p
      LEFT JOIN companies c ON p."companyId" = c.id
      LEFT JOIN invoices i ON p."invoiceId" = i.id
      WHERE c.id IS NULL OR i.id IS NULL;
    `);
    report('Orphan payments (missing company or invoice)', orphanPayments[0].count);

    const orphanJobPhotos = await prisma.$queryRawUnsafe(`
      SELECT count(*)::int AS count FROM job_photos jp
      LEFT JOIN jobs j ON jp."jobId" = j.id
      WHERE j.id IS NULL;
    `);
    report('Orphan job photos (missing job)', orphanJobPhotos[0].count);

    const orphanJobNotes = await prisma.$queryRawUnsafe(`
      SELECT count(*)::int AS count FROM job_notes jn
      LEFT JOIN jobs j ON jn."jobId" = j.id
      WHERE j.id IS NULL;
    `);
    report('Orphan job notes (missing job)', orphanJobNotes[0].count);

    const orphanJobParts = await prisma.$queryRawUnsafe(`
      SELECT count(*)::int AS count FROM job_parts jp
      LEFT JOIN jobs j ON jp."jobId" = j.id
      WHERE j.id IS NULL;
    `);
    report('Orphan job parts (missing job)', orphanJobParts[0].count);

    const orphanQuoteItems = await prisma.$queryRawUnsafe(`
      SELECT count(*)::int AS count FROM quote_items qi
      LEFT JOIN quotes q ON qi."quoteId" = q.id
      WHERE q.id IS NULL;
    `);
    report('Orphan quote line items (missing quote)', orphanQuoteItems[0].count);

    const orphanInvoiceItems = await prisma.$queryRawUnsafe(`
      SELECT count(*)::int AS count FROM invoice_items ii
      LEFT JOIN invoices i ON ii."invoiceId" = i.id
      WHERE i.id IS NULL;
    `);
    report('Orphan invoice line items (missing invoice)', orphanInvoiceItems[0].count);

    // 2. Cross-Company Reference Checks
    const crossCompanyJobs = await prisma.$queryRawUnsafe(`
      SELECT count(*)::int AS count FROM jobs j
      JOIN customers cust ON j."customerId" = cust.id
      WHERE j."companyId" != cust."companyId";
    `);
    report('Cross-company jobs (job company != customer company)', crossCompanyJobs[0].count);

    const crossCompanyQuotes = await prisma.$queryRawUnsafe(`
      SELECT count(*)::int AS count FROM quotes q
      JOIN customers cust ON q."customerId" = cust.id
      WHERE q."companyId" != cust."companyId";
    `);
    report('Cross-company quotes (quote company != customer company)', crossCompanyQuotes[0].count);

    const crossCompanyQuotesJob = await prisma.$queryRawUnsafe(`
      SELECT count(*)::int AS count FROM quotes q
      JOIN jobs j ON q."jobId" = j.id
      WHERE q."companyId" != j."companyId";
    `);
    report('Cross-company quotes to job (quote company != job company)', crossCompanyQuotesJob[0].count);

    const crossCompanyInvoices = await prisma.$queryRawUnsafe(`
      SELECT count(*)::int AS count FROM invoices i
      JOIN customers cust ON i."customerId" = cust.id
      WHERE i."companyId" != cust."companyId";
    `);
    report('Cross-company invoices (invoice company != customer company)', crossCompanyInvoices[0].count);

    const crossCompanyInvoicesJob = await prisma.$queryRawUnsafe(`
      SELECT count(*)::int AS count FROM invoices i
      JOIN jobs j ON i."jobId" = j.id
      WHERE i."companyId" != j."companyId";
    `);
    report('Cross-company invoices to job (invoice company != job company)', crossCompanyInvoicesJob[0].count);

    const crossCompanyPayments = await prisma.$queryRawUnsafe(`
      SELECT count(*)::int AS count FROM payments p
      JOIN invoices i ON p."invoiceId" = i.id
      WHERE p."companyId" != i."companyId";
    `);
    report('Cross-company payments (payment company != invoice company)', crossCompanyPayments[0].count);

    // 3. Invoice Math & Balance Consistency
    const invoiceTotalMismatch = await prisma.$queryRawUnsafe(`
      SELECT count(*)::int AS count FROM invoices
      WHERE "totalMinor" != ("subtotalMinor" - "discountMinor" + "taxMinor");
    `);
    report('Invoice total calculation (total != subtotal - discount + tax)', invoiceTotalMismatch[0].count);

    const invoiceBalanceMismatch = await prisma.$queryRawUnsafe(`
      SELECT count(*)::int AS count FROM invoices
      WHERE "balanceDueMinor" != ("totalMinor" - "amountPaidMinor");
    `);
    report('Invoice balance due calculation (balance != total - amount_paid)', invoiceBalanceMismatch[0].count);

    const invoiceNegativeBalance = await prisma.$queryRawUnsafe(`
      SELECT count(*)::int AS count FROM invoices
      WHERE "balanceDueMinor" < 0 OR "amountPaidMinor" < 0;
    `);
    report('Negative invoice balance or negative amount paid', invoiceNegativeBalance[0].count);

    // 4. State & Timestamp Consistency
    const completedWithoutTimestamp = await prisma.job.count({
      where: {
        status: 'COMPLETED',
        completedAt: null,
      },
    });
    report('Jobs COMPLETED without completed_at', completedWithoutTimestamp);

    const scheduledWithoutStart = await prisma.job.count({
      where: {
        status: 'SCHEDULED',
        scheduledStart: null,
      },
    });
    report('Jobs SCHEDULED without scheduled_start', scheduledWithoutStart);

    // 5. Uniqueness of Business Numbers
    const duplicateJobNumbers = await prisma.$queryRawUnsafe(`
      SELECT count(*)::int AS count FROM (
        SELECT "companyId", "jobNumber", count(*)
        FROM jobs
        GROUP BY "companyId", "jobNumber"
        HAVING count(*) > 1
      ) dupes;
    `);
    report('Duplicate job numbers per company', duplicateJobNumbers[0].count);

    const duplicateInvoiceNumbers = await prisma.$queryRawUnsafe(`
      SELECT count(*)::int AS count FROM (
        SELECT "companyId", "invoiceNumber", count(*)
        FROM invoices
        GROUP BY "companyId", "invoiceNumber"
        HAVING count(*) > 1
      ) dupes;
    `);
    report('Duplicate invoice numbers per company', duplicateInvoiceNumbers[0].count);

    console.log(`\n=== INTEGRITY CHECKS COMPLETE: ${passCount} PASSED, ${failCount} FAILED ===`);
  } catch (err) {
    console.error('Integrity check error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

runIntegrityChecks();
