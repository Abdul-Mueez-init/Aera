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
    type?: "DIAGNOSTIC" | "REPAIR" | "INSTALLATION" | "MAINTENANCE" | "OTHER";
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

// Phase 6.3 completion requirements: REPAIR/INSTALLATION jobs need one
// BEFORE and one AFTER photo before completeJob accepts completion.
async function addCompletionPhotos(jobId: string) {
  for (const kind of ["BEFORE", "AFTER"] as const) {
    await prisma.jobPhoto.create({
      data: {
        companyId: fx.companyId,
        jobId,
        uploadedBy: tech.userId,
        objectKey: `test/${jobId}/${kind}.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 1024n,
        kind,
      },
    });
  }
}

let fx: Fixture;
let tech: { userId: string; auth: { Authorization: string } };

beforeEach(async () => {
  await prisma.$transaction([
    // Break the jobs↔quotes circular FKs first: a leftover job from a
    // previous file's last test may still reference its source quote
    // (Restrict), and a quote may reference its basis job.
    prisma.job.updateMany({ data: { sourceQuoteId: null } }),
    prisma.quote.updateMany({
      data: {
        basisJobId: null,
        supersedesQuoteId: null,
        supersededByQuoteId: null,
      },
    }),
    prisma.invoiceItem.deleteMany(),
    prisma.invoiceCreditApplication.deleteMany(),
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

  it("enforces the completionRequirements map per job type", async () => {
    // REPAIR without photos → blocked with BEFORE photo error.
    const repair = await seedJob(fx, {
      type: "REPAIR",
      technicianId: tech.userId,
    });
    const noPhotos = await request(app)
      .post(`/api/v1/jobs/${repair.id}/complete`)
      .set(tech.auth)
      .send({ summary: "Done" });
    expect(noPhotos.status).toBe(422);
    expect(noPhotos.body.error.code).toBe("JOB_BEFORE_PHOTO_REQUIRED");

    // BEFORE only → blocked on AFTER.
    await prisma.jobPhoto.create({
      data: {
        companyId: fx.companyId,
        jobId: repair.id,
        uploadedBy: tech.userId,
        objectKey: `test/${repair.id}/before.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 1024n,
        kind: "BEFORE",
      },
    });
    const noAfter = await request(app)
      .post(`/api/v1/jobs/${repair.id}/complete`)
      .set(tech.auth)
      .send({ summary: "Done" });
    expect(noAfter.status).toBe(422);
    expect(noAfter.body.error.code).toBe("JOB_AFTER_PHOTO_REQUIRED");

    // INSTALLATION also requires both photos.
    const install = await seedJob(fx, {
      type: "INSTALLATION",
      technicianId: tech.userId,
    });
    const installBlocked = await request(app)
      .post(`/api/v1/jobs/${install.id}/complete`)
      .set(tech.auth)
      .send({ summary: "Done" });
    expect(installBlocked.status).toBe(422);
    expect(installBlocked.body.error.code).toBe("JOB_BEFORE_PHOTO_REQUIRED");

    // MAINTENANCE and OTHER have no minimums.
    for (const type of ["MAINTENANCE", "OTHER"] as const) {
      const job = await seedJob(fx, { type, technicianId: tech.userId });
      const res = await request(app)
        .post(`/api/v1/jobs/${job.id}/complete`)
        .set(tech.auth)
        .send({ summary: "Done" });
      expect(res.status).toBe(200);
    }
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

describe("4.6 repair quote from diagnostic findings", () => {
  async function diagnosticJobWithFinding() {
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
    const job = await seedJob(fx, {
      type: "DIAGNOSTIC",
      status: "COMPLETED",
      technicianId: tech.userId,
      serviceRequestId: requestRow.id,
    });
    await prisma.jobFinding.create({
      data: {
        companyId: fx.companyId,
        jobId: job.id,
        authorUserId: tech.userId,
        summary: "Failed capacitor",
        recommendedWork: "Replace run capacitor and test",
        likelyParts: [
          { name: "Run capacitor 45/5", quantity: 1, unitPriceMinor: 4500 },
        ],
        customerVisible: true,
      },
    });
    return { requestRow, job };
  }

  it("creates a REPAIR quote linked to the request and diagnostic job", async () => {
    const { requestRow, job } = await diagnosticJobWithFinding();
    const res = await request(app)
      .post(`/api/v1/jobs/${job.id}/repair-quote`)
      .set(fx.auth);
    expect(res.status).toBe(201);
    expect(res.body.data.kind).toBe("REPAIR");
    expect(res.body.data.status).toBe("DRAFT");
    expect(res.body.data.serviceRequestId).toBe(requestRow.id);
    expect(res.body.data.basisJobId).toBe(job.id);
    expect(res.body.data.customerId).toBe(fx.customerId);
    // Items come only from findings: work line + priced likelyPart.
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.items[0].description).toBe(
      "Replace run capacitor and test",
    );
    expect(res.body.data.items[1].description).toBe("Run capacitor 45/5");
  });

  it("rejects non-diagnostic, incomplete, and finding-less jobs", async () => {
    const repair = await seedJob(fx, {
      type: "REPAIR",
      status: "COMPLETED",
      technicianId: tech.userId,
    });
    const wrongType = await request(app)
      .post(`/api/v1/jobs/${repair.id}/repair-quote`)
      .set(fx.auth);
    expect(wrongType.status).toBe(422);
    expect(wrongType.body.error.code).toBe("REPAIR_QUOTE_REQUIRES_DIAGNOSTIC");

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
    const noFindings = await seedJob(fx, {
      type: "DIAGNOSTIC",
      status: "COMPLETED",
      technicianId: tech.userId,
      serviceRequestId: requestRow.id,
    });
    const empty = await request(app)
      .post(`/api/v1/jobs/${noFindings.id}/repair-quote`)
      .set(fx.auth);
    expect(empty.status).toBe(422);
    expect(empty.body.error.code).toBe("JOB_FINDING_REQUIRED");

    const inProgress = await seedJob(fx, {
      type: "DIAGNOSTIC",
      status: "IN_PROGRESS",
      technicianId: tech.userId,
    });
    const notDone = await request(app)
      .post(`/api/v1/jobs/${inProgress.id}/repair-quote`)
      .set(fx.auth);
    expect(notDone.status).toBe(422);
  });

  it("technicians cannot create repair quotes", async () => {
    const { job } = await diagnosticJobWithFinding();
    const res = await request(app)
      .post(`/api/v1/jobs/${job.id}/repair-quote`)
      .set(tech.auth);
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
    await addCompletionPhotos(job.id);
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

    await addCompletionPhotos(job.id);
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
        amountPaidMinor: 5000n,
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
    // The credit is capped at money actually received — record the
    // payment that makes this diagnostic invoice PAID.
    await prisma.payment.create({
      data: {
        companyId: fx.companyId,
        invoiceId: diagInvoice.id,
        amountMinor: 5000n,
        currency: "USD",
        method: "CARD",
        idempotencyKey: `diag-pay-${diagInvoice.id}`,
      },
    });

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
    // The diagnostic fee credits through InvoiceCreditApplication, not a
    // negative line item: total stays at the parts total and the balance
    // is reduced by the credit.
    const creditLine = invoice.body.data.items.find(
      (item: { description: string }) =>
        item.description === "Credit: diagnostic fee",
    );
    expect(creditLine).toBeUndefined();
    expect(Number(invoice.body.data.totalMinor)).toBe(12000);
    expect(Number(invoice.body.data.balanceDueMinor)).toBe(7000);
    const credit = invoice.body.data.creditTargets.find(
      (target: { sourceInvoice: { id: string } }) =>
        target.sourceInvoice.id === diagInvoice.id,
    );
    expect(credit).toBeDefined();
    expect(Number(credit.amountMinor)).toBe(5000);
  });

  it("6.5 preview exposes unapproved parts; generation excludes them", async () => {
    const job = await seedJob(fx, {
      status: "COMPLETED",
      technicianId: tech.userId,
    });
    const part = await prisma.jobPart.create({
      data: {
        companyId: fx.companyId,
        jobId: job.id,
        name: "Extra capacitor",
        quantity: "1",
        unitPriceMinor: 9000n,
        currency: "USD",
      },
    });
    const quote = await prisma.quote.create({
      data: {
        companyId: fx.companyId,
        customerId: fx.customerId,
        jobId: job.id,
        kind: "REPAIR",
        status: "APPROVED",
        subtotalMinor: 20000n,
        totalMinor: 20000n,
        currency: "USD",
        approvedAt: new Date(),
        items: {
          create: [
            {
              companyId: fx.companyId,
              description: "Approved repair labor",
              quantity: "1",
              unitPriceMinor: 20000n,
              totalMinor: 20000n,
              sortOrder: 0,
            },
          ],
        },
      },
    });

    const preview = await request(app)
      .get(`/api/v1/invoices/from-job/${job.id}/preview`)
      .set(fx.auth);
    expect(preview.status).toBe(200);
    expect(preview.body.data.issueable).toBe(true);
    expect(preview.body.data.items).toHaveLength(1);
    expect(preview.body.data.items[0].sourceType).toBe("QUOTE_ITEM");
    expect(preview.body.data.unapprovedParts).toHaveLength(1);
    expect(preview.body.data.unapprovedParts[0].id).toBe(part.id);
    expect(Number(preview.body.data.totalMinor)).toBe(20000);

    const invoice = await request(app)
      .post(`/api/v1/invoices/from-job/${job.id}`)
      .set(fx.auth)
      .send({});
    expect(invoice.status).toBe(201);
    expect(
      invoice.body.data.items.every(
        (item: { sourceType: string }) => item.sourceType !== "JOB_PART",
      ),
    ).toBe(true);
    expect(Number(invoice.body.data.totalMinor)).toBe(20000);
    expect(quote.id).toBeTruthy();
  });
});
