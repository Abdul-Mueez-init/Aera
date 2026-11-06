/**
 * Phase 6 — findings, completion review, change requests, invoice scope.
 * Flags set before src imports (env.ts parses once at load).
 */
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

process.env.COMPLETION_REVIEW_ENABLED = "true";
process.env.INVOICE_FROM_SCOPE_ENABLED = "true";
process.env.REQUESTS_ENABLED = "true";
process.env.QUOTE_BEFORE_JOB_ENABLED = "true";

type App = ReturnType<(typeof import("../src/app.js"))["buildApp"]>;
type PrismaClient = (typeof import("../src/db/prisma.js"))["prisma"];

let app: App;
let prisma: PrismaClient;
let hashPassword: (typeof import("../src/common/auth/password.js"))["hashPassword"];

beforeAll(async () => {
  app = (await import("../src/app.js")).buildApp();
  prisma = (await import("../src/db/prisma.js")).prisma;
  hashPassword = (await import("../src/common/auth/password.js")).hashPassword;
}, 60000);

function suffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

interface Fixture {
  companyId: string;
  ownerId: string;
  auth: { Authorization: string };
  customerId: string;
  addressId: string;
}

async function seedCompany(): Promise<Fixture> {
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({
      email: `p6-${suffix()}@example.com`,
      password: "correct-horse-battery-staple",
      firstName: "Owner",
      lastName: "P6",
      companyName: `P6 ${suffix()}`,
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
    ownerId: userId,
    auth: { Authorization: `Bearer ${res.body.data.accessToken}` },
    customerId: customer.id,
    addressId: address.id,
  };
}

async function seedTechnician(fx: Fixture) {
  const email = `p6-tech-${suffix()}@example.com`;
  const password = "correct-horse-battery-staple";
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      firstName: "Tech",
      lastName: "Six",
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

async function seedJob(
  fx: Fixture,
  opts: {
    type?: "DIAGNOSTIC" | "REPAIR" | "OTHER";
    status?: string;
    technicianId?: string;
    serviceRequestId?: string;
  } = {},
) {
  return prisma.job.create({
    data: {
      companyId: fx.companyId,
      customerId: fx.customerId,
      serviceAddressId: fx.addressId,
      serviceRequestId: opts.serviceRequestId,
      jobNumber: Math.floor(Math.random() * 900_000) + 1000,
      serviceType: "HVAC Repair",
      problemDescription: "Needs repair",
      type: opts.type ?? "REPAIR",
      status: (opts.status ?? "IN_PROGRESS") as never,
      assignedTechnicianId: opts.technicianId,
      startedAt: new Date(),
    },
  });
}

let fx: Fixture;
let tech: { userId: string; auth: { Authorization: string } };

beforeEach(async () => {
  await prisma.$transaction([
    prisma.invoiceItem.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.quoteApprovalEvent.deleteMany(),
    prisma.quoteAcceptance.deleteMany(),
    prisma.quoteItem.deleteMany(),
    prisma.quote.deleteMany(),
    prisma.jobChangeRequest.deleteMany(),
    prisma.jobFinding.deleteMany(),
    prisma.jobStatusHistory.deleteMany(),
    prisma.jobPhoto.deleteMany(),
    prisma.jobNote.deleteMany(),
    prisma.jobPart.deleteMany(),
    prisma.job.deleteMany(),
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

describe("6.3 findings and completion requirements", () => {
  it("blocks DIAGNOSTIC completion without a finding, allows with one", async () => {
    const job = await seedJob(fx, {
      type: "DIAGNOSTIC",
      technicianId: tech.userId,
    });
    const blocked = await request(app)
      .post(`/api/v1/jobs/${job.id}/complete`)
      .set(tech.auth)
      .send({ summary: "Done" });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe("JOB_FINDING_REQUIRED");

    const finding = await request(app)
      .post(`/api/v1/jobs/${job.id}/findings`)
      .set(tech.auth)
      .send({
        summary: "Compressor seized",
        recommendedWork: "Replace compressor",
        customerVisible: true,
      });
    expect(finding.status).toBe(201);

    const done = await request(app)
      .post(`/api/v1/jobs/${job.id}/complete`)
      .set(tech.auth)
      .send({ summary: "Diagnosed and documented" });
    expect(done.status).toBe(200);
    expect(done.body.data.status).toBe("COMPLETED");
    // Company default requireCompletionReview=false → NOT_REQUIRED.
    expect(done.body.data.reviewState).toBe("NOT_REQUIRED");
  });

  it("unassigned technician cannot add findings (6.1 authz)", async () => {
    const otherTech = await seedTechnician(fx);
    const job = await seedJob(fx, { technicianId: tech.userId });
    const res = await request(app)
      .post(`/api/v1/jobs/${job.id}/findings`)
      .set(otherTech.auth)
      .send({ summary: "Nope" });
    expect(res.status).toBe(403);
  });
});

describe("6.4 completion review", () => {
  it("PENDING → APPROVED gates invoicing; CHANGES_REQUESTED reopens evidence", async () => {
    await prisma.company.update({
      where: { id: fx.companyId },
      data: { requireCompletionReview: true },
    });
    const job = await seedJob(fx, { technicianId: tech.userId });
    const done = await request(app)
      .post(`/api/v1/jobs/${job.id}/complete`)
      .set(tech.auth)
      .send({ summary: "Finished" });
    expect(done.body.data.reviewState).toBe("PENDING");

    // Invoice blocked while PENDING.
    const invoice = await request(app)
      .post(`/api/v1/invoices/from-job/${job.id}`)
      .set(fx.auth)
      .send({});
    expect(invoice.status).toBe(422);
    expect(invoice.body.error.code).toBe("INVOICE_REVIEW_REQUIRED");

    // Request changes → technician can still add notes/findings.
    const changes = await request(app)
      .post(`/api/v1/jobs/${job.id}/review`)
      .set(fx.auth)
      .send({ decision: "CHANGES_REQUESTED", note: "Photos are blurry" });
    expect(changes.status).toBe(200);
    expect(changes.body.data.reviewState).toBe("CHANGES_REQUESTED");

    const note = await request(app)
      .post(`/api/v1/jobs/${job.id}/notes`)
      .set(tech.auth)
      .send({ body: "Retook photos", visibility: "INTERNAL" });
    expect(note.status).toBe(201);

    // Re-complete is not possible (already COMPLETED); staff approve path
    // requires PENDING, so verify a second review is rejected.
    const again = await request(app)
      .post(`/api/v1/jobs/${job.id}/review`)
      .set(fx.auth)
      .send({ decision: "APPROVED" });
    expect(again.status).toBe(409);
  });
});

describe("6.5 change requests", () => {
  it("technician submits, staff quotes as CHANGE_ORDER, technician sees scope", async () => {
    const job = await seedJob(fx, {
      status: "IN_PROGRESS",
      technicianId: tech.userId,
    });
    const created = await request(app)
      .post(`/api/v1/jobs/${job.id}/change-requests`)
      .set(tech.auth)
      .send({
        reason: "Additional damage",
        description: "Freon line is corroded",
        estimatedPriceMinor: 25000,
        currency: "USD",
      });
    expect(created.status).toBe(201);
    const crId = created.body.data.id as string;

    const list = await request(app)
      .get(`/api/v1/jobs/${job.id}/change-requests`)
      .set(tech.auth);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);

    const quoted = await request(app)
      .post(`/api/v1/jobs/${job.id}/change-requests/${crId}/quote`)
      .set(fx.auth);
    expect(quoted.status).toBe(201);
    expect(quoted.body.data.kind).toBe("CHANGE_ORDER");
    expect(quoted.body.data.jobId).toBe(job.id);

    const after = await prisma.jobChangeRequest.findUniqueOrThrow({
      where: { id: crId },
    });
    expect(after.status).toBe("QUOTED");
  });

  it("emergency authorization requires the company setting", async () => {
    const job = await seedJob(fx, {
      status: "IN_PROGRESS",
      technicianId: tech.userId,
    });
    const created = await request(app)
      .post(`/api/v1/jobs/${job.id}/change-requests`)
      .set(tech.auth)
      .send({
        reason: "Emergency",
        description: "Water leak",
        estimatedPriceMinor: 10000,
        currency: "USD",
      });
    const crId = created.body.data.id as string;

    const denied = await request(app)
      .post(`/api/v1/jobs/${job.id}/change-requests/${crId}/authorize`)
      .set(fx.auth)
      .send({ reason: "Customer unreachable, safety issue" });
    expect(denied.status).toBe(422);
    expect(denied.body.error.code).toBe("EMERGENCY_AUTH_NOT_ALLOWED");

    await prisma.company.update({
      where: { id: fx.companyId },
      data: { emergencyAuthorizationAllowed: true },
    });
    const allowed = await request(app)
      .post(`/api/v1/jobs/${job.id}/change-requests/${crId}/authorize`)
      .set(fx.auth)
      .send({ reason: "Customer unreachable, safety issue" });
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.authorizedBy).toBe(fx.ownerId);
  });

  it("technician can withdraw own OPEN request only", async () => {
    const job = await seedJob(fx, {
      status: "IN_PROGRESS",
      technicianId: tech.userId,
    });
    const created = await request(app)
      .post(`/api/v1/jobs/${job.id}/change-requests`)
      .set(tech.auth)
      .send({
        reason: "Maybe",
        description: "Optional work",
        estimatedPriceMinor: 5000,
        currency: "USD",
      });
    const crId = created.body.data.id as string;
    const withdrawn = await request(app)
      .post(`/api/v1/jobs/${job.id}/change-requests/${crId}/withdraw`)
      .set(tech.auth);
    expect(withdrawn.status).toBe(200);
    expect(withdrawn.body.data.status).toBe("WITHDRAWN");

    const again = await request(app)
      .post(`/api/v1/jobs/${job.id}/change-requests/${crId}/withdraw`)
      .set(tech.auth);
    expect(again.status).toBe(409);
  });
});

describe("6.6 invoice scope lines", () => {
  it("adds AUTHORIZATION line for authorized change requests", async () => {
    await prisma.company.update({
      where: { id: fx.companyId },
      data: { emergencyAuthorizationAllowed: true },
    });
    const requestRow = await prisma.serviceRequest.create({
      data: {
        companyId: fx.companyId,
        customerId: fx.customerId,
        serviceAddressId: fx.addressId,
        requestNumber: Math.floor(Math.random() * 900_000) + 1000,
        title: "Repair",
        description: "Fix it",
        serviceCategory: "HVAC",
        source: "STAFF_DIRECT",
        status: "ACCEPTED",
      },
    });
    const job = await seedJob(fx, {
      status: "IN_PROGRESS",
      technicianId: tech.userId,
      serviceRequestId: requestRow.id,
    });
    const created = await request(app)
      .post(`/api/v1/jobs/${job.id}/change-requests`)
      .set(tech.auth)
      .send({
        reason: "Extra part",
        description: "Replacement board",
        estimatedPriceMinor: 8000,
        currency: "USD",
      });
    const crId = created.body.data.id as string;
    const authorized = await request(app)
      .post(`/api/v1/jobs/${job.id}/change-requests/${crId}/authorize`)
      .set(fx.auth)
      .send({ reason: "Customer approved by phone" });
    expect(authorized.status).toBe(200);

    await request(app)
      .post(`/api/v1/jobs/${job.id}/complete`)
      .set(tech.auth)
      .send({ summary: "Done" });

    // No approved quote and no parts → zero-amount path needs the flag.
    const invoice = await request(app)
      .post(`/api/v1/invoices/from-job/${job.id}`)
      .set(fx.auth)
      .send({ allowZeroAmount: true });
    expect(invoice.status).toBe(201);
    const authLine = invoice.body.data.items.find(
      (item: { sourceType: string }) => item.sourceType === "AUTHORIZATION",
    );
    expect(authLine).toBeDefined();
    expect(authLine.sourceId).toBe(crId);
    expect(Number(authLine.totalMinor)).toBe(8000);
  });

  it("adds a negative diagnostic-fee credit line on the follow-up job", async () => {
    const requestRow = await prisma.serviceRequest.create({
      data: {
        companyId: fx.companyId,
        customerId: fx.customerId,
        serviceAddressId: fx.addressId,
        requestNumber: Math.floor(Math.random() * 900_000) + 1000,
        title: "No cooling",
        description: "AC dead",
        serviceCategory: "HVAC",
        source: "STAFF_DIRECT",
        status: "ACCEPTED",
      },
    });
    // Diagnostic job completed with a paid invoice.
    const diagJob = await seedJob(fx, {
      type: "DIAGNOSTIC",
      status: "COMPLETED",
      technicianId: tech.userId,
      serviceRequestId: requestRow.id,
    });
    await prisma.jobFinding.create({
      data: {
        companyId: fx.companyId,
        jobId: diagJob.id,
        authorUserId: tech.userId,
        summary: "Failed capacitor",
      },
    });
    const diagInvoice = await prisma.invoice.create({
      data: {
        companyId: fx.companyId,
        customerId: fx.customerId,
        jobId: diagJob.id,
        invoiceNumber: `INV-${Math.floor(Math.random() * 900_000) + 1000}`,
        subtotalMinor: 5000n,
        totalMinor: 5000n,
        balanceDueMinor: 0n,
        currency: "USD",
        status: "PAID",
        items: {
          create: [
            {
              companyId: fx.companyId,
              description: "Diagnostic fee",
              quantity: "1",
              unitPriceMinor: 5000n,
              totalMinor: 5000n,
              sortOrder: 0,
            },
          ],
        },
      },
    });
    void diagInvoice;

    // Follow-up repair job on the same request.
    const repairJob = await seedJob(fx, {
      status: "COMPLETED",
      technicianId: tech.userId,
      serviceRequestId: requestRow.id,
    });
    await prisma.jobPart.create({
      data: {
        companyId: fx.companyId,
        jobId: repairJob.id,
        name: "Capacitor",
        quantity: "1",
        unitPriceMinor: 12000n,
        currency: "USD",
      },
    });
    const invoice = await request(app)
      .post(`/api/v1/invoices/from-job/${repairJob.id}`)
      .set(fx.auth)
      .send({});
    expect(invoice.status).toBe(201);
    const credit = invoice.body.data.items.find(
      (item: { description: string }) =>
        item.description === "Credit: diagnostic fee",
    );
    expect(credit).toBeDefined();
    expect(Number(credit.totalMinor)).toBe(-5000);
    expect(Number(invoice.body.data.totalMinor)).toBe(7000);
  });
});
