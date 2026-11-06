/**
 * Phase 6.8 — Gate A end-to-end: customer-to-cash v2.
 *
 * Branch A: customer request (portal) → quote → portal approval → job →
 *   diagnostic finding → completion review → invoice → issue.
 * Branch B: staff direct job → parts → completion → invoice → issue.
 * Change order: technician change request → CHANGE_ORDER quote → portal
 *   approval → invoice bills both approved quotes, no AUTHORIZATION line.
 *
 * All Phase 1–6 flags enabled before src imports (env.ts parses once).
 */
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

process.env.REQUESTS_ENABLED = "true";
process.env.QUOTE_BEFORE_JOB_ENABLED = "true";
process.env.WORKSPACE_PORTAL_ENABLED = "true";
process.env.PORTAL_REQUESTS_ENABLED = "true";
process.env.BOOKING_ENABLED = "true";
process.env.COMPLETION_REVIEW_ENABLED = "true";
process.env.INVOICE_FROM_SCOPE_ENABLED = "true";

type App = ReturnType<(typeof import("../src/app.js"))["buildApp"]>;
type PrismaClient = (typeof import("../src/db/prisma.js"))["prisma"];
type GenerateToken =
  (typeof import("../src/modules/portal/portal.tokens.js"))["generateToken"];
type HashToken =
  (typeof import("../src/modules/portal/portal.tokens.js"))["hashToken"];
type HashPassword =
  (typeof import("../src/common/auth/password.js"))["hashPassword"];

let app: App;
let prisma: PrismaClient;
let generateToken: GenerateToken;
let hashToken: HashToken;
let hashPassword: HashPassword;

beforeAll(async () => {
  app = (await import("../src/app.js")).buildApp();
  prisma = (await import("../src/db/prisma.js")).prisma;
  const tokens = await import("../src/modules/portal/portal.tokens.js");
  generateToken = tokens.generateToken;
  hashToken = tokens.hashToken;
  hashPassword = (await import("../src/common/auth/password.js")).hashPassword;
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
      email: `v2-${suffix()}@example.com`,
      password: "correct-horse-battery-staple",
      firstName: "Owner",
      lastName: "V2",
      companyName: `V2 ${suffix()}`,
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

async function seedTechnician(fx: Fixture) {
  const email = `v2-tech-${suffix()}@example.com`;
  const password = "correct-horse-battery-staple";
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      firstName: "Tech",
      lastName: "V2",
    },
  });
  await prisma.companyMember.create({
    data: {
      userId: user.id,
      companyId: fx.companyId,
      role: "TECHNICIAN",
      status: "ACTIVE",
    },
  });
  const login = await request(app).post("/api/v1/auth/login").send({
    email,
    password,
  });
  expect(login.status).toBe(200);
  return {
    userId: user.id,
    auth: { Authorization: `Bearer ${login.body.data.accessToken}` },
  };
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

/** Drive a job to IN_PROGRESS the way the field flow would (handshake,
 *  scheduling and EN_ROUTE are covered by their own suites). */
async function activateJob(jobId: string) {
  await prisma.job.update({
    where: { id: jobId },
    data: { status: "IN_PROGRESS", startedAt: new Date() },
  });
}

let fx: Fixture;
let tech: { userId: string; auth: { Authorization: string } };

beforeEach(async () => {
  await prisma.$transaction([
    prisma.payment.deleteMany(),
    prisma.invoiceItem.deleteMany(),
    prisma.invoice.deleteMany(),
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
    prisma.appointmentHold.deleteMany(),
    prisma.appointmentProposal.deleteMany(),
    prisma.portalSession.deleteMany(),
    prisma.portalAccessGrant.deleteMany(),
    prisma.portalAuditEvent.deleteMany(),
    prisma.serviceRequestMessage.deleteMany(),
    prisma.serviceRequestAttachment.deleteMany(),
    prisma.serviceRequestUpload.deleteMany(),
    prisma.serviceRequestEvent.deleteMany(),
    prisma.serviceRequest.deleteMany(),
    prisma.serviceAddress.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.companyMember.deleteMany(),
    prisma.refreshSession.deleteMany(),
    prisma.user.deleteMany(),
    prisma.company.deleteMany(),
  ]);
  fx = await seedCompany();
  tech = await seedTechnician(fx);
});

describe("Branch A — request-first customer-to-cash", () => {
  it("portal request → quote → approval → job → finding → review → invoice → issue", async () => {
    await prisma.company.update({
      where: { id: fx.companyId },
      data: { requireCompletionReview: true },
    });
    const portal = await workspaceSession(fx);

    // 1. Customer submits a request through the portal.
    const submit = await request(app)
      .post("/api/v1/portal/requests")
      .set(portal)
      .set("Idempotency-Key", `v2-${suffix()}-request-key`)
      .send({
        serviceAddressId: fx.addressId,
        title: "AC not cooling",
        description: "Air handler runs but no cold air",
        serviceCategory: "HVAC",
      });
    expect(submit.status).toBe(201);
    const requestId = submit.body.data.id as string;

    // 2. Staff create + send a request-linked quote.
    const quoteRes = await request(app)
      .post("/api/v1/quotes")
      .set(fx.auth)
      .send({
        customerId: fx.customerId,
        serviceRequestId: requestId,
        kind: "REPAIR",
        currency: "USD",
        items: [
          {
            description: "Diagnostic + repair labor",
            quantity: "1",
            unitPriceMinor: 20000,
          },
        ],
      });
    expect(quoteRes.status).toBe(201);
    const quoteId = quoteRes.body.data.id as string;
    const sent = await request(app)
      .post(`/api/v1/quotes/${quoteId}/send`)
      .set(fx.auth);
    expect(sent.status).toBe(200);

    // 3. Customer approves in the workspace → job is created.
    const approve = await request(app)
      .post(`/api/v1/portal/quotes/${quoteId}/respond`)
      .set(portal)
      .send({ action: "APPROVED" });
    expect(approve.status).toBe(200);

    const job = await prisma.job.findFirstOrThrow({
      where: { companyId: fx.companyId, sourceQuoteId: quoteId },
    });
    await prisma.job.update({
      where: { id: job.id },
      data: { assignedTechnicianId: tech.userId },
    });
    await activateJob(job.id);

    // 4. Technician records a finding (REPAIR job — allowed but not
    //    required) and completes; review is required by company setting.
    const finding = await request(app)
      .post(`/api/v1/jobs/${job.id}/findings`)
      .set(tech.auth)
      .send({ summary: "Failed capacitor", customerVisible: true });
    expect(finding.status).toBe(201);

    const complete = await request(app)
      .post(`/api/v1/jobs/${job.id}/complete`)
      .set(tech.auth)
      .send({ summary: "Replaced capacitor, system cooling" });
    expect(complete.status).toBe(200);
    expect(complete.body.data.reviewState).toBe("PENDING");

    // 5. Invoice is gated on review.
    const blocked = await request(app)
      .post(`/api/v1/invoices/from-job/${job.id}`)
      .set(fx.auth)
      .send({});
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe("INVOICE_REVIEW_REQUIRED");

    const review = await request(app)
      .post(`/api/v1/jobs/${job.id}/review`)
      .set(fx.auth)
      .send({ decision: "APPROVED", note: "Verified on site" });
    expect(review.status).toBe(200);

    // 6. Invoice from approved scope → issue.
    const invoice = await request(app)
      .post(`/api/v1/invoices/from-job/${job.id}`)
      .set(fx.auth)
      .send({});
    expect(invoice.status).toBe(201);
    expect(invoice.body.data.totalMinor).toBe("20000");
    expect(invoice.body.data.items[0].sourceType).toBe("QUOTE_ITEM");

    const issued = await request(app)
      .post(`/api/v1/invoices/${invoice.body.data.id}/issue`)
      .set(fx.auth);
    expect(issued.status).toBe(200);
    expect(issued.body.data.status).toBe("ISSUED");

    // Idempotent re-issue returns the same invoice.
    const again = await request(app)
      .post(`/api/v1/invoices/${invoice.body.data.id}/issue`)
      .set(fx.auth);
    expect(again.body.data.id).toBe(invoice.body.data.id);
  });
});

describe("Branch B — staff direct job", () => {
  it("direct job → parts → completion → invoice → issue", async () => {
    // REQUESTS_ENABLED: createJob auto-creates a STAFF_DIRECT request.
    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: fx.customerId },
    });
    void customer;
    const created = await request(app).post("/api/v1/jobs").set(fx.auth).send({
      customerId: fx.customerId,
      serviceAddressId: fx.addressId,
      serviceType: "HVAC Repair",
      problemDescription: "No cooling",
      priority: "NORMAL",
    });
    expect(created.status).toBe(201);
    const jobId = created.body.data.id as string;

    const autoRequest = await prisma.serviceRequest.findFirst({
      where: { companyId: fx.companyId, jobs: { some: { id: jobId } } },
    });
    expect(autoRequest).not.toBeNull();
    expect(autoRequest!.source).toBe("STAFF_DIRECT");

    await prisma.job.update({
      where: { id: jobId },
      data: { assignedTechnicianId: tech.userId },
    });
    await activateJob(jobId);

    const part = await request(app)
      .post(`/api/v1/jobs/${jobId}/parts`)
      .set(tech.auth)
      .send({
        name: "Capacitor",
        quantity: 1,
        unitPriceMinor: 4500,
        currency: "USD",
      });
    expect(part.status).toBe(201);

    const complete = await request(app)
      .post(`/api/v1/jobs/${jobId}/complete`)
      .set(tech.auth)
      .send({ summary: "Replaced capacitor" });
    expect(complete.status).toBe(200);

    const invoice = await request(app)
      .post(`/api/v1/invoices/from-job/${jobId}`)
      .set(fx.auth)
      .send({});
    expect(invoice.status).toBe(201);
    expect(invoice.body.data.items[0].sourceType).toBe("JOB_PART");
    expect(invoice.body.data.totalMinor).toBe("4500");
  });
});

describe("Change order — field request to invoice", () => {
  it("technician CR → CHANGE_ORDER quote → portal approval → invoice bills both quotes", async () => {
    const portal = await workspaceSession(fx);

    // Base request + quote + approval (same as Branch A setup).
    const submit = await request(app)
      .post("/api/v1/portal/requests")
      .set(portal)
      .set("Idempotency-Key", `v2-${suffix()}-cr-request`)
      .send({
        serviceAddressId: fx.addressId,
        title: "Refrigerant leak",
        description: "Hissing noise at line set",
        serviceCategory: "HVAC",
      });
    expect(submit.status).toBe(201);
    const requestId = submit.body.data.id as string;

    const baseQuote = await request(app)
      .post("/api/v1/quotes")
      .set(fx.auth)
      .send({
        customerId: fx.customerId,
        serviceRequestId: requestId,
        kind: "REPAIR",
        currency: "USD",
        items: [
          { description: "Leak repair", quantity: "1", unitPriceMinor: 15000 },
        ],
      });
    const baseQuoteId = baseQuote.body.data.id as string;
    await request(app).post(`/api/v1/quotes/${baseQuoteId}/send`).set(fx.auth);
    await request(app)
      .post(`/api/v1/portal/quotes/${baseQuoteId}/respond`)
      .set(portal)
      .send({ action: "APPROVED" });

    const job = await prisma.job.findFirstOrThrow({
      where: { companyId: fx.companyId, sourceQuoteId: baseQuoteId },
    });
    await prisma.job.update({
      where: { id: job.id },
      data: { assignedTechnicianId: tech.userId },
    });
    await activateJob(job.id);

    // Technician discovers extra damage → change request.
    const cr = await request(app)
      .post(`/api/v1/jobs/${job.id}/change-requests`)
      .set(tech.auth)
      .send({
        reason: "Corroded line set",
        description: "Full line set replacement needed",
        estimatedPriceMinor: 30000,
        currency: "USD",
      });
    expect(cr.status).toBe(201);
    const crId = cr.body.data.id as string;

    // Staff turn it into a CHANGE_ORDER quote and send it.
    const coQuote = await request(app)
      .post(`/api/v1/jobs/${job.id}/change-requests/${crId}/quote`)
      .set(fx.auth);
    expect(coQuote.status).toBe(201);
    expect(coQuote.body.data.kind).toBe("CHANGE_ORDER");
    const coQuoteId = coQuote.body.data.id as string;
    await request(app).post(`/api/v1/quotes/${coQuoteId}/send`).set(fx.auth);

    // Customer approves the change order in the workspace.
    const coApprove = await request(app)
      .post(`/api/v1/portal/quotes/${coQuoteId}/respond`)
      .set(portal)
      .send({ action: "APPROVED" });
    expect(coApprove.status).toBe(200);

    // Complete + invoice: both approved quotes bill; no AUTHORIZATION line
    // (the approved CHANGE_ORDER already covers the change request).
    await request(app)
      .post(`/api/v1/jobs/${job.id}/complete`)
      .set(tech.auth)
      .send({ summary: "Repaired leak, replaced line set" });

    const invoice = await request(app)
      .post(`/api/v1/invoices/from-job/${job.id}`)
      .set(fx.auth)
      .send({});
    expect(invoice.status).toBe(201);
    const items = invoice.body.data.items as {
      sourceType: string;
      totalMinor: string;
      description: string;
    }[];
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.sourceType === "QUOTE_ITEM")).toBe(true);
    expect(Number(invoice.body.data.totalMinor)).toBe(45000);
  });

  it("emergency-authorized change request bills as AUTHORIZATION line", async () => {
    await prisma.company.update({
      where: { id: fx.companyId },
      data: { emergencyAuthorizationAllowed: true },
    });
    const job = await prisma.job.create({
      data: {
        companyId: fx.companyId,
        customerId: fx.customerId,
        serviceAddressId: fx.addressId,
        jobNumber: Math.floor(Math.random() * 900_000) + 1000,
        serviceType: "Plumbing",
        problemDescription: "Burst pipe",
        status: "IN_PROGRESS",
        assignedTechnicianId: tech.userId,
        startedAt: new Date(),
      },
    });
    const cr = await request(app)
      .post(`/api/v1/jobs/${job.id}/change-requests`)
      .set(tech.auth)
      .send({
        reason: "Mold remediation",
        description: "Hidden mold behind wall",
        estimatedPriceMinor: 20000,
        currency: "USD",
      });
    const crId = cr.body.data.id as string;
    const auth = await request(app)
      .post(`/api/v1/jobs/${job.id}/change-requests/${crId}/authorize`)
      .set(fx.auth)
      .send({ reason: "Customer unreachable, safety hazard" });
    expect(auth.status).toBe(200);

    await request(app)
      .post(`/api/v1/jobs/${job.id}/complete`)
      .set(tech.auth)
      .send({ summary: "Pipe repaired, mold treated" });

    const invoice = await request(app)
      .post(`/api/v1/invoices/from-job/${job.id}`)
      .set(fx.auth)
      .send({ allowZeroAmount: true });
    expect(invoice.status).toBe(201);
    const authLine = (
      invoice.body.data.items as { sourceType: string; totalMinor: string }[]
    ).find((i) => i.sourceType === "AUTHORIZATION");
    expect(authLine).toBeDefined();
    expect(Number(authLine!.totalMinor)).toBe(20000);
  });
});
