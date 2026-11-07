import { prisma } from "../src/db/prisma.js";

/**
 * Phase 8.4 — referential/tenant integrity report.
 *
 * Runs read-only orphan, cross-tenant, and invariant checks across the
 * request-first schema. Every check prints a count; non-zero counts are
 * integrity violations that must be triaged before a gate is signed off.
 * Exits 1 when any check reports violations.
 */
async function count(sql: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(sql);
  return Number(rows[0]?.count ?? 0n);
}

const checks: Array<{ name: string; sql: string }> = [
  // --- Orphans -----------------------------------------------------------
  {
    name: "jobs.serviceRequestId dangling",
    sql: `SELECT COUNT(*)::bigint AS count FROM jobs j
          LEFT JOIN service_requests r ON r.id = j."serviceRequestId"
          WHERE j."serviceRequestId" IS NOT NULL AND r.id IS NULL`,
  },
  {
    name: "quotes.serviceRequestId dangling",
    sql: `SELECT COUNT(*)::bigint AS count FROM quotes q
          LEFT JOIN service_requests r ON r.id = q."serviceRequestId"
          WHERE q."serviceRequestId" IS NOT NULL AND r.id IS NULL`,
  },
  {
    name: "quotes.basisJobId dangling",
    sql: `SELECT COUNT(*)::bigint AS count FROM quotes q
          LEFT JOIN jobs j ON j.id = q."basisJobId"
          WHERE q."basisJobId" IS NOT NULL AND j.id IS NULL`,
  },
  {
    name: "invoices.jobId dangling",
    sql: `SELECT COUNT(*)::bigint AS count FROM invoices i
          LEFT JOIN jobs j ON j.id = i."jobId"
          WHERE i."jobId" IS NOT NULL AND j.id IS NULL`,
  },
  {
    name: "payment_sessions.invoiceId dangling",
    sql: `SELECT COUNT(*)::bigint AS count FROM payment_sessions ps
          LEFT JOIN invoices i ON i.id = ps."invoiceId"
          WHERE i.id IS NULL`,
  },
  {
    name: "refunds.paymentId dangling",
    sql: `SELECT COUNT(*)::bigint AS count FROM refunds rf
          LEFT JOIN payments p ON p.id = rf."paymentId"
          WHERE p.id IS NULL`,
  },
  {
    name: "service_request_attachments.requestId dangling",
    sql: `SELECT COUNT(*)::bigint AS count FROM service_request_attachments a
          LEFT JOIN service_requests r ON r.id = a."requestId"
          WHERE r.id IS NULL`,
  },
  {
    name: "service_request_messages.requestId dangling",
    sql: `SELECT COUNT(*)::bigint AS count FROM service_request_messages m
          LEFT JOIN service_requests r ON r.id = m."requestId"
          WHERE r.id IS NULL`,
  },
  // --- Cross-tenant mismatches -------------------------------------------
  {
    name: "jobs↔service_requests company mismatch",
    sql: `SELECT COUNT(*)::bigint AS count FROM jobs j
          JOIN service_requests r ON r.id = j."serviceRequestId"
          WHERE j."companyId" <> r."companyId"`,
  },
  {
    name: "quotes↔service_requests company mismatch",
    sql: `SELECT COUNT(*)::bigint AS count FROM quotes q
          JOIN service_requests r ON r.id = q."serviceRequestId"
          WHERE q."companyId" <> r."companyId"`,
  },
  {
    name: "quotes↔jobs(basis) company mismatch",
    sql: `SELECT COUNT(*)::bigint AS count FROM quotes q
          JOIN jobs j ON j.id = q."basisJobId"
          WHERE q."companyId" <> j."companyId"`,
  },
  {
    name: "invoices↔jobs company mismatch",
    sql: `SELECT COUNT(*)::bigint AS count FROM invoices i
          JOIN jobs j ON j.id = i."jobId"
          WHERE i."companyId" <> j."companyId"`,
  },
  {
    name: "payment_sessions↔invoices company mismatch",
    sql: `SELECT COUNT(*)::bigint AS count FROM payment_sessions ps
          JOIN invoices i ON i.id = ps."invoiceId"
          WHERE ps."companyId" <> i."companyId"`,
  },
  {
    name: "refunds↔payments company mismatch",
    sql: `SELECT COUNT(*)::bigint AS count FROM refunds rf
          JOIN payments p ON p.id = rf."paymentId"
          WHERE rf."companyId" <> p."companyId"`,
  },
  {
    name: "invoice_disputes↔invoices company mismatch",
    sql: `SELECT COUNT(*)::bigint AS count FROM invoice_disputes d
          JOIN invoices i ON i.id = d."invoiceId"
          WHERE d."companyId" <> i."companyId"`,
  },
  {
    name: "portal_sessions↔grants company mismatch",
    sql: `SELECT COUNT(*)::bigint AS count FROM portal_sessions s
          JOIN portal_access_grants g ON g.id = s."grantId"
          WHERE s."companyId" <> g."companyId"`,
  },
  {
    name: "request media↔requests company mismatch",
    sql: `SELECT COUNT(*)::bigint AS count FROM service_request_attachments a
          JOIN service_requests r ON r.id = a."requestId"
          WHERE a."companyId" <> r."companyId"`,
  },
  // --- Domain invariants ---------------------------------------------------
  {
    name: "jobs missing type",
    sql: `SELECT COUNT(*)::bigint AS count FROM jobs WHERE type IS NULL`,
  },
  {
    name: "jobs missing serviceRequestId",
    sql: `SELECT COUNT(*)::bigint AS count FROM jobs WHERE "serviceRequestId" IS NULL`,
  },
  {
    name: "quotes missing currency",
    sql: `SELECT COUNT(*)::bigint AS count FROM quotes WHERE currency IS NULL OR currency = ''`,
  },
  {
    name: "portal_sessions JOB scope without jobId",
    sql: `SELECT COUNT(*)::bigint AS count FROM portal_sessions
          WHERE scope = 'JOB' AND "jobId" IS NULL`,
  },
  {
    name: "open payment sessions exceeding invoice balance",
    sql: `SELECT COUNT(*)::bigint AS count FROM payment_sessions ps
          JOIN invoices i ON i.id = ps."invoiceId"
          WHERE ps.status = 'OPEN' AND ps."amountMinor" > i."balanceDueMinor"`,
  },
  {
    name: "multiple OPEN payment sessions per invoice",
    sql: `SELECT COUNT(*)::bigint AS count FROM (
            SELECT "invoiceId" FROM payment_sessions
            WHERE status = 'OPEN' GROUP BY "invoiceId" HAVING COUNT(*) > 1
          ) dupes`,
  },
  {
    name: "credit applications exceeding source paid amount",
    sql: `SELECT COUNT(*)::bigint AS count FROM invoice_credit_applications c
          JOIN invoices s ON s.id = c."sourceInvoiceId"
          WHERE c."amountMinor" > s."amountPaidMinor"`,
  },
  {
    name: "duplicate active invoice disputes",
    sql: `SELECT COUNT(*)::bigint AS count FROM (
            SELECT "invoiceId" FROM invoice_disputes
            WHERE status IN ('OPEN','UNDER_REVIEW')
            GROUP BY "invoiceId" HAVING COUNT(*) > 1
          ) dupes`,
  },
  {
    name: "invoices with negative balanceDue",
    sql: `SELECT COUNT(*)::bigint AS count FROM invoices WHERE "balanceDueMinor" < 0`,
  },
];

const results: Record<string, number> = {};
let violations = 0;
for (const check of checks) {
  const value = await count(check.sql);
  results[check.name] = value;
  if (value > 0) violations += value;
}

console.table(results);
if (violations > 0) {
  console.error(`Integrity check FAILED: ${violations} violation(s) found.`);
  process.exitCode = 1;
} else {
  console.log("Integrity check passed: 0 violations.");
}
await prisma.$disconnect();
