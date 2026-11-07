/**
 * Phase 4 — Quote-before-job tests (QUOTE_BEFORE_JOB_ENABLED=true).
 *
 * Flags must be set BEFORE src imports (env.ts parses once at load).
 * Covers the 4.3 send matrix, 4.2 edit/revision rules, 4.5 decline /
 * ask-a-question / expiry recompute, and 4.7 staff accept-on-behalf audit
 * reason. Supabase storage is not touched by these paths.
 */
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

process.env.QUOTE_BEFORE_JOB_ENABLED = "true";
process.env.REQUESTS_ENABLED = "true";
process.env.WORKSPACE_PORTAL_ENABLED = "true";
process.env.PORTAL_REQUESTS_ENABLED = "true";

type App = ReturnType<(typeof import("../src/app.js"))["buildApp"]>;
type PrismaClient = (typeof import("../src/db/prisma.js"))["prisma"];
type GenerateToken =
  (typeof import("../src/modules/portal/portal.tokens.js"))["generateToken"];
type HashToken =
  (typeof import("../src/modules/portal/portal.tokens.js"))["hashToken"];

let app: App;
let prisma: PrismaClient;
let generateToken: GenerateToken;
let hashToken: HashToken;

beforeAll(async () => {
  app = (await import("../src/app.js")).buildApp();
  prisma = (await import("../src/db/prisma.js")).prisma;
  const portalTokens = await import("../src/modules/portal/portal.tokens.js");
  generateToken = portalTokens.generateToken;
  hashToken = portalTokens.hashToken;
}, 60000);

function suffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

interface Fixture {
  companyId: string;
  userId: string;
  auth: { Authorization: string };
  customerId: string;
  addressId: string;
}

async function seedCompany(): Promise<Fixture> {
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({
      email: `p4-${suffix()}@example.com`,
      password: "correct-horse-battery-staple",
      firstName: "Owner",
      lastName: "P4",
      companyName: `P4 ${suffix()}`,
    });
  expect(res.status).toBe(201);
  const companyId = res.body.data.company.id as string;
  const userId = res.body.data.user.id as string;
  const customer = await prisma.customer.create({
    data: {
      companyId,
      firstName: "Casey",
      lastName: "Customer",
      email: `casey-${suffix()}@example.com`,
    },
  });
  const address = await prisma.serviceAddress.create({
    data: {
      companyId,
      customerId: customer.id,
      label: "Home",
      line1: "1 Main St",
      city: "Austin",
      region: "TX",
      postalCode: "78701",
      countryCode: "US",
    },
  });
  return {
    companyId,
    userId,
    auth: { Authorization: `Bearer ${res.body.data.accessToken}` },
    customerId: customer.id,
    addressId: address.id,
  };
}

async function seedRequest(
  fx: Fixture,
  status: "SUBMITTED" | "QUOTED" = "SUBMITTED",
) {
  return prisma.serviceRequest.create({
    data: {
      companyId: fx.companyId,
      customerId: fx.customerId,
      serviceAddressId: fx.addressId,
      requestNumber: Math.floor(Math.random() * 900_000) + 1000,
      title: "Repair request",
      description: "Needs service",
      serviceCategory: "HVAC",
      source: "WEB_PORTAL",
      status,
    },
  });
}

function quoteBody(fx: Fixture, extra: Record<string, unknown> = {}) {
  return {
    customerId: fx.customerId,
    currency: "USD",
    items: [
      { description: "Service call", quantity: "1", unitPriceMinor: 10000 },
    ],
    ...extra,
  };
}

async function createQuote(fx: Fixture, extra: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/v1/quotes")
    .set(fx.auth)
    .send(quoteBody(fx, extra));
  return res;
}

async function workspaceSession(fx: Fixture) {
  const grant = await prisma.portalAccessGrant.create({
    data: {
      companyId: fx.companyId,
      customerId: fx.customerId,
      scope: "WORKSPACE",
      issuedBy: fx.userId,
      linkTokenHash: hashToken(generateToken()),
      linkExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      linkConsumedAt: new Date(),
      status: "ACTIVE",
    },
  });
  const sessionToken = generateToken();
  await prisma.portalSession.create({
    data: {
      grantId: grant.id,
      companyId: fx.companyId,
      customerId: fx.customerId,
      scope: "WORKSPACE",
      sessionTokenHash: hashToken(sessionToken),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      lastSeenAt: new Date(),
    },
  });
  return {
    Authorization: `Bearer ${sessionToken}`,
    "X-Aera-Portal": "1",
  };
}

let fx: Fixture;

beforeEach(async () => {
  await prisma.$transaction([
    prisma.payment.deleteMany(),
    prisma.invoiceItem.deleteMany(),
    prisma.invoiceCreditApplication.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.portalSession.deleteMany(),
    prisma.portalAccessGrant.deleteMany(),
    prisma.portalAuditEvent.deleteMany(),
    prisma.serviceRequestMessage.deleteMany(),
    prisma.serviceRequestAttachment.deleteMany(),
    prisma.serviceRequestUpload.deleteMany(),
    prisma.serviceRequestEvent.deleteMany(),
    prisma.jobChangeRequest.deleteMany(),
    prisma.jobFinding.deleteMany(),
    prisma.jobStatusHistory.deleteMany(),
    prisma.jobPhoto.deleteMany(),
    prisma.jobNote.deleteMany(),
    prisma.jobPart.deleteMany(),
    prisma.job.deleteMany(),
    prisma.quoteApprovalEvent.deleteMany(),
    prisma.quoteAcceptance.deleteMany(),
    prisma.quoteItem.deleteMany(),
    prisma.quote.deleteMany(),
    prisma.serviceRequest.deleteMany(),
    prisma.serviceAddress.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.companyMember.deleteMany(),
    prisma.refreshSession.deleteMany(),
    prisma.user.deleteMany(),
    prisma.company.deleteMany(),
  ]);
  fx = await seedCompany();
});

describe("4.3 send without a job (flag on)", () => {
  it("creates and sends a request-linked quote with no job", async () => {
    const requestRow = await seedRequest(fx);
    const created = await createQuote(fx, {
      serviceRequestId: requestRow.id,
      kind: "REPAIR",
    });
    expect(created.status).toBe(201);
    expect(created.body.data.jobId).toBeNull();

    const sent = await request(app)
      .post(`/api/v1/quotes/${created.body.data.id}/send`)
      .set(fx.auth);
    expect(sent.status).toBe(200);
    expect(sent.body.data.status).toBe("SENT");

    const after = await prisma.serviceRequest.findUnique({
      where: { id: requestRow.id },
    });
    expect(after?.status).toBe("QUOTED");
  });

  it("rejects a quote with neither job nor request", async () => {
    const res = await createQuote(fx);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("QUOTE_REQUIRES_REQUEST");
  });

  it("still allows a job-linked quote (legacy path)", async () => {
    const job = await prisma.job.create({
      data: {
        companyId: fx.companyId,
        customerId: fx.customerId,
        serviceAddressId: fx.addressId,
        jobNumber: Math.floor(Math.random() * 900_000) + 1000,
        serviceType: "REPAIR",
        problemDescription: "x",
        status: "QUOTING",
        handshakeVersion: 1,
      },
    });
    const created = await createQuote(fx, { jobId: job.id });
    expect(created.status).toBe(201);
  });
});

describe("4.2 editing and revision rules", () => {
  it("rejects editing a sent quote and revisions expire the original", async () => {
    const requestRow = await seedRequest(fx);
    const created = await createQuote(fx, { serviceRequestId: requestRow.id });
    await request(app)
      .post(`/api/v1/quotes/${created.body.data.id}/send`)
      .set(fx.auth);

    const edit = await request(app)
      .patch(`/api/v1/quotes/${created.body.data.id}`)
      .set(fx.auth)
      .send(quoteBody(fx));
    expect(edit.status).toBe(409);
    expect(edit.body.error.code).toBe("QUOTE_NOT_EDITABLE");

    const revise = await request(app)
      .post(`/api/v1/quotes/${created.body.data.id}/revise`)
      .set(fx.auth);
    expect(revise.status).toBe(201);
    expect(revise.body.data.supersedesQuoteId).toBe(created.body.data.id);
    expect(revise.body.data.status).toBe("DRAFT");

    const sentRevision = await request(app)
      .post(`/api/v1/quotes/${revise.body.data.id}/send`)
      .set(fx.auth);
    expect(sentRevision.status).toBe(200);
    const original = await prisma.quote.findUnique({
      where: { id: created.body.data.id },
    });
    expect(original?.status).toBe("EXPIRED");
    expect(original?.supersededByQuoteId).toBe(revise.body.data.id);
  });
});

describe("4.4/4.7 acceptance orchestration", () => {
  it("staff approve requires an audit reason and creates job + snapshot", async () => {
    const requestRow = await seedRequest(fx, "QUOTED");
    const created = await createQuote(fx, {
      serviceRequestId: requestRow.id,
      kind: "INSPECTION",
    });
    await request(app)
      .post(`/api/v1/quotes/${created.body.data.id}/send`)
      .set(fx.auth);

    const noReason = await request(app)
      .post(`/api/v1/quotes/${created.body.data.id}/respond`)
      .set(fx.auth)
      .send({ action: "APPROVED" });
    expect(noReason.status).toBe(422);

    const approved = await request(app)
      .post(`/api/v1/quotes/${created.body.data.id}/respond`)
      .set(fx.auth)
      .send({ action: "APPROVED", reason: "Customer approved by phone" });
    expect(approved.status).toBe(200);

    const acceptance = await prisma.quoteAcceptance.findUnique({
      where: { quoteId: created.body.data.id },
    });
    expect(acceptance).not.toBeNull();
    expect(acceptance?.acceptedByType).toBe("STAFF");
    const event = await prisma.quoteApprovalEvent.findFirstOrThrow({
      where: { quoteId: created.body.data.id },
    });
    expect(event.reason).toBe("Customer approved by phone");

    const job = await prisma.job.findFirst({
      where: { sourceQuoteId: created.body.data.id },
    });
    expect(job?.type).toBe("DIAGNOSTIC");
    expect(job?.serviceRequestId).toBe(requestRow.id);
    const requestAfter = await prisma.serviceRequest.findUnique({
      where: { id: requestRow.id },
    });
    expect(requestAfter?.status).toBe("ACCEPTED");
  });
});

describe("4.5 decline, question and expiry", () => {
  it("declining the last open quote declines the request", async () => {
    const requestRow = await seedRequest(fx, "QUOTED");
    const created = await createQuote(fx, { serviceRequestId: requestRow.id });
    await request(app)
      .post(`/api/v1/quotes/${created.body.data.id}/send`)
      .set(fx.auth);
    const declined = await request(app)
      .post(`/api/v1/quotes/${created.body.data.id}/respond`)
      .set(fx.auth)
      .send({ action: "DECLINED" });
    expect(declined.status).toBe(200);
    const after = await prisma.serviceRequest.findUnique({
      where: { id: requestRow.id },
    });
    expect(after?.status).toBe("DECLINED");
    expect(
      await prisma.job.count({
        where: { sourceQuoteId: created.body.data.id },
      }),
    ).toBe(0);
  });

  it("declining one quote keeps the request QUOTED while another is open", async () => {
    const requestRow = await seedRequest(fx, "QUOTED");
    const q1 = await createQuote(fx, { serviceRequestId: requestRow.id });
    const q2 = await createQuote(fx, { serviceRequestId: requestRow.id });
    for (const q of [q1, q2]) {
      await request(app)
        .post(`/api/v1/quotes/${q.body.data.id}/send`)
        .set(fx.auth);
    }
    await request(app)
      .post(`/api/v1/quotes/${q1.body.data.id}/respond`)
      .set(fx.auth)
      .send({ action: "DECLINED" });
    const after = await prisma.serviceRequest.findUnique({
      where: { id: requestRow.id },
    });
    expect(after?.status).toBe("QUOTED");
  });

  it("ask-a-question posts a customer message without changing status", async () => {
    const requestRow = await seedRequest(fx, "QUOTED");
    const created = await createQuote(fx, { serviceRequestId: requestRow.id });
    await request(app)
      .post(`/api/v1/quotes/${created.body.data.id}/send`)
      .set(fx.auth);
    const portal = await workspaceSession(fx);

    const res = await request(app)
      .post(`/api/v1/portal/quotes/${created.body.data.id}/question`)
      .set(portal)
      .send({ body: "Is the diagnostic fee credited toward repair?" });
    expect(res.status).toBe(201);
    expect(res.body.data.authorType).toBe("CUSTOMER");

    const quote = await prisma.quote.findUnique({
      where: { id: created.body.data.id },
    });
    expect(quote?.status).toBe("SENT");
    const message = await prisma.serviceRequestMessage.findFirst({
      where: { requestId: requestRow.id },
    });
    expect(message?.body).toContain("diagnostic fee");
  });

  it("sweep expiry moves the request QUOTED → EXPIRED when no quote remains", async () => {
    const { sweepExpiredQuotes } =
      await import("../src/modules/quotes/quote.service.js");
    const requestRow = await seedRequest(fx, "QUOTED");
    const created = await createQuote(fx, {
      serviceRequestId: requestRow.id,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await request(app)
      .post(`/api/v1/quotes/${created.body.data.id}/send`)
      .set(fx.auth);
    // Age the sent quote past expiry, then sweep.
    await prisma.quote.update({
      where: { id: created.body.data.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    const result = await sweepExpiredQuotes();
    expect(result.expiredCount).toBeGreaterThanOrEqual(1);
    const after = await prisma.serviceRequest.findUnique({
      where: { id: requestRow.id },
    });
    expect(after?.status).toBe("EXPIRED");
  });
});
