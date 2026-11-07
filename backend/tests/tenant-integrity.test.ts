/**
 * P1-6 — composite tenant foreign keys.
 *
 * Every tenant-scoped child row must reference its parent through
 * (id, companyId), so a row can never point at another company's
 * customer/job/invoice/payment/session. These tests seed two companies
 * and assert the database itself rejects cross-tenant links.
 */
import { beforeAll, describe, expect, it } from "vitest";

type PrismaClient = (typeof import("../src/db/prisma.js"))["prisma"];
type GenerateToken =
  (typeof import("../src/modules/portal/portal.tokens.js"))["generateToken"];
type HashToken =
  (typeof import("../src/modules/portal/portal.tokens.js"))["hashToken"];

let prisma: PrismaClient;
let generateToken: GenerateToken;
let hashToken: HashToken;

beforeAll(async () => {
  prisma = (await import("../src/db/prisma.js")).prisma;
  const tokens = await import("../src/modules/portal/portal.tokens.js");
  generateToken = tokens.generateToken;
  hashToken = tokens.hashToken;
}, 60000);

const suffix = () =>
  `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

async function makeCompany(label: string) {
  const company = await prisma.company.create({
    data: {
      name: `${label} Co ${suffix()}`,
      slug: `${label.toLowerCase()}-${suffix()}`,
      phone: "+15550001111",
    },
  });
  const customer = await prisma.customer.create({
    data: {
      companyId: company.id,
      firstName: "Pat",
      lastName: "Client",
      email: `pat-${company.id}@example.com`,
      phone: "+15550003333",
    },
  });
  const address = await prisma.serviceAddress.create({
    data: {
      companyId: company.id,
      customerId: customer.id,
      label: "Home",
      line1: "1 Main St",
      city: "Austin",
      region: "TX",
      postalCode: "73301",
      countryCode: "US",
    },
  });
  const job = await prisma.job.create({
    data: {
      companyId: company.id,
      customerId: customer.id,
      serviceAddressId: address.id,
      jobNumber: Math.floor(Math.random() * 900_000) + 1000,
      serviceType: "REPAIR",
      problemDescription: "Job",
      status: "SCHEDULED",
      handshakeVersion: 1,
    },
  });
  const invoice = await prisma.invoice.create({
    data: {
      companyId: company.id,
      customerId: customer.id,
      jobId: job.id,
      invoiceNumber: `INV-${suffix()}`,
      status: "ISSUED",
      subtotalMinor: 1000n,
      totalMinor: 1000n,
      balanceDueMinor: 1000n,
      currency: "USD",
    },
  });
  const payment = await prisma.payment.create({
    data: {
      companyId: company.id,
      invoiceId: invoice.id,
      amountMinor: 1000n,
      currency: "USD",
      method: "CASH",
      idempotencyKey: `pay-${suffix()}`,
    },
  });
  const grant = await prisma.portalAccessGrant.create({
    data: {
      companyId: company.id,
      customerId: customer.id,
      jobId: job.id,
      linkTokenHash: hashToken(generateToken()),
      linkExpiresAt: new Date(Date.now() + 86400000),
      status: "ACTIVE",
    },
  });
  const session = await prisma.portalSession.create({
    data: {
      grantId: grant.id,
      companyId: company.id,
      customerId: customer.id,
      jobId: job.id,
      sessionTokenHash: hashToken(generateToken()),
      expiresAt: new Date(Date.now() + 86400000),
      lastSeenAt: new Date(),
    },
  });
  return { company, customer, address, job, invoice, payment, grant, session };
}

describe("composite tenant foreign keys", () => {
  it("rejects cross-company invoice credit applications", async () => {
    const a = await makeCompany("A");
    const b = await makeCompany("B");
    await expect(
      prisma.invoiceCreditApplication.create({
        data: {
          companyId: b.company.id,
          sourceInvoiceId: a.invoice.id,
          targetInvoiceId: b.invoice.id,
          amountMinor: 100n,
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects cross-company refunds and payment sessions", async () => {
    const a = await makeCompany("A");
    const b = await makeCompany("B");
    await expect(
      prisma.refund.create({
        data: {
          companyId: b.company.id,
          paymentId: a.payment.id,
          amountMinor: 100n,
          reason: "cross-tenant",
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.paymentSession.create({
        data: {
          companyId: b.company.id,
          invoiceId: a.invoice.id,
          provider: "sandbox",
          providerSessionId: `ps-${suffix()}`,
          amountMinor: 1000n,
          currency: "USD",
          expiresAt: new Date(Date.now() + 86400000),
          idempotencyKey: `ps-key-${suffix()}`,
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects cross-company disputes and portal sessions", async () => {
    const a = await makeCompany("A");
    const b = await makeCompany("B");
    await expect(
      prisma.invoiceDispute.create({
        data: {
          companyId: b.company.id,
          invoiceId: a.invoice.id,
          customerId: b.customer.id,
          reason: "OTHER",
          message: "cross-tenant",
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.portalSession.create({
        data: {
          grantId: a.grant.id,
          companyId: b.company.id,
          customerId: b.customer.id,
          sessionTokenHash: hashToken(generateToken()),
          expiresAt: new Date(Date.now() + 86400000),
          lastSeenAt: new Date(),
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.portalAuditEvent.create({
        data: {
          companyId: b.company.id,
          jobId: a.job.id,
          customerId: b.customer.id,
          action: "TEST",
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects cross-company request media session/customer links", async () => {
    const a = await makeCompany("A");
    const b = await makeCompany("B");
    const requestA = await prisma.serviceRequest.create({
      data: {
        companyId: a.company.id,
        customerId: a.customer.id,
        serviceAddressId: a.address.id,
        requestNumber: Math.floor(Math.random() * 900_000) + 1000,
        title: "Fix",
        description: "desc",
        serviceCategory: "HVAC",
        source: "STAFF_DIRECT",
        status: "SUBMITTED",
      },
    });
    await expect(
      prisma.serviceRequestMessage.create({
        data: {
          companyId: b.company.id,
          requestId: requestA.id,
          authorType: "STAFF",
          authorUserId: null,
          portalSessionId: a.session.id,
          body: "cross-tenant",
        },
      }),
    ).rejects.toThrow();
  });

  it("enforces the JOB-scope session CHECK constraint", async () => {
    const a = await makeCompany("A");
    // scope=JOB without jobId must fail the CHECK.
    await expect(
      prisma.portalSession.create({
        data: {
          grantId: a.grant.id,
          companyId: a.company.id,
          customerId: a.customer.id,
          jobId: null,
          scope: "JOB",
          sessionTokenHash: hashToken(generateToken()),
          expiresAt: new Date(Date.now() + 86400000),
          lastSeenAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });
});
