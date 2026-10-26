import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/common/auth/password.js";
import {
  createAccessToken,
  hashRefreshToken,
} from "../src/common/auth/tokens.js";
import { env } from "../src/config/env.js";
import { prisma } from "../src/db/prisma.js";
import { deriveHandshakeCode } from "../src/modules/portal/portal.tokens.js";

const app = buildApp();

type Role = "OWNER" | "DISPATCHER" | "TECHNICIAN";

interface TestActor {
  userId: string;
  auth: { Authorization: string };
}

let companyId: string;
let customerId: string;
let serviceAddressId: string;
let owner: TestActor;
let technician: TestActor;
let otherTechnician: TestActor;

function suffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

async function createActor(
  targetCompanyId: string,
  role: Role,
  label: string,
): Promise<TestActor> {
  const user = await prisma.user.create({
    data: {
      email: `${label}-${suffix()}@example.com`,
      passwordHash: await hashPassword("TestPassword123!"),
      firstName: label,
      lastName: "Tester",
    },
  });
  await prisma.companyMember.create({
    data: {
      companyId: targetCompanyId,
      userId: user.id,
      role,
      status: "ACTIVE",
    },
  });
  const sessionId = crypto.randomUUID();
  await prisma.refreshSession.create({
    data: {
      id: sessionId,
      userId: user.id,
      companyId: targetCompanyId,
      tokenHash: hashRefreshToken(crypto.randomUUID()),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  const accessToken = await createAccessToken({
    userId: user.id,
    sessionId,
    companyId: targetCompanyId,
    role,
  });
  return { userId: user.id, auth: { Authorization: `Bearer ${accessToken}` } };
}

async function seedJob(overrides: Record<string, unknown> = {}) {
  return prisma.job.create({
    data: {
      companyId,
      customerId,
      serviceAddressId,
      jobNumber: Math.floor(Math.random() * 900_000) + 1000,
      serviceType: "REPAIR",
      problemDescription: "Unit not cooling",
      status: "SCHEDULED",
      assignedTechnicianId: technician.userId,
      scheduledStart: new Date(Date.now() + 60 * 60 * 1000),
      scheduledEnd: new Date(Date.now() + 2 * 60 * 60 * 1000),
      handshakeVersion: 1,
      ...overrides,
    },
  });
}

function codeFor(jobId: string, version: number): string {
  return deriveHandshakeCode(
    env.PORTAL_CODE_SECRET ?? "",
    companyId,
    jobId,
    version,
  );
}

function wrongCodeFor(jobId: string, version: number): string {
  const correct = codeFor(jobId, version);
  return correct === "000000" ? "000001" : "000000";
}

function collectStringValues(value: unknown, into: string[] = []): string[] {
  if (typeof value === "string") {
    into.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStringValues(item, into);
  } else if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) collectStringValues(item, into);
  }
  return into;
}

beforeEach(async () => {
  // Clean in FK-safe order so the suite also passes on a shared test DB
  // where other suites left quotes/invoices behind.
  await prisma.$transaction([
    prisma.portalAuditEvent.deleteMany(),
    prisma.portalSession.deleteMany(),
    prisma.portalAccessGrant.deleteMany(),
    prisma.customerReview.deleteMany(),
    prisma.quoteApprovalEvent.deleteMany(),
    prisma.quoteItem.deleteMany(),
    prisma.quote.deleteMany(),
    prisma.invoiceItem.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.job.deleteMany(),
    prisma.serviceAddress.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.refreshSession.deleteMany(),
    prisma.companyMember.deleteMany(),
    prisma.company.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  const company = await prisma.company.create({
    data: {
      name: "Handshake Test Company",
      slug: `handshake-test-${suffix()}`,
      phone: "+1234567890",
    },
  });
  companyId = company.id;

  owner = await createActor(companyId, "OWNER", "owner");
  technician = await createActor(companyId, "TECHNICIAN", "tech");
  otherTechnician = await createActor(companyId, "TECHNICIAN", "tech-two");

  const customer = await prisma.customer.create({
    data: {
      companyId,
      firstName: "John",
      lastName: "Doe",
      email: "john@example.com",
      phone: "+1234567890",
    },
  });
  customerId = customer.id;

  const address = await prisma.serviceAddress.create({
    data: {
      companyId,
      customerId,
      label: "Home",
      line1: "123 Main St",
      city: "San Francisco",
      region: "CA",
      postalCode: "94102",
      countryCode: "US",
    },
  });
  serviceAddressId = address.id;
});

describe("Handshake (handoff 5.7)", () => {
  it("entering EN_ROUTE bumps version and clears lock", async () => {
    const job = await seedJob({
      status: "SCHEDULED",
      handshakeVersion: 3,
      handshakeFailedAttempts: 4,
      handshakeLockedUntil: new Date(Date.now() + 10 * 60 * 1000),
      handshakeVerifiedAt: new Date(),
    });

    const response = await request(app)
      .post(`/api/v1/jobs/${job.id}/status`)
      .set(owner.auth)
      .send({ status: "EN_ROUTE" });
    expect(response.status).toBe(200);

    const updated = await prisma.job.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(updated.handshakeVersion).toBe(4);
    expect(updated.handshakeFailedAttempts).toBe(0);
    expect(updated.handshakeLockedUntil).toBeNull();
    expect(updated.handshakeVerifiedAt).toBeNull();
  });

  it("staff and technician job responses never contain the code or its version (D2)", async () => {
    const job = await seedJob({ status: "EN_ROUTE" });
    const code = codeFor(job.id, 1);

    for (const auth of [owner.auth, technician.auth]) {
      const detail = await request(app).get(`/api/v1/jobs/${job.id}`).set(auth);
      expect(detail.status).toBe(200);
      const serialized = JSON.stringify(detail.body);
      expect(serialized).not.toContain(`"code":"${code}"`);
      expect(serialized).not.toContain("handshakeVersion");
      // Only the handshake STATE is exposed to staff surfaces.
      expect(detail.body.data.handshake.state).toBe("AWAITING_CODE");
    }

    const list = await request(app).get(`/api/v1/jobs`).set(owner.auth);
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toContain("handshakeVersion");
  });

  it("start with correct code moves EN_ROUTE to IN_PROGRESS and writes history + audit", async () => {
    const job = await seedJob({ status: "EN_ROUTE" });
    const code = codeFor(job.id, 1);

    const response = await request(app)
      .post(`/api/v1/jobs/${job.id}/start`)
      .set(technician.auth)
      .send({ code });
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("IN_PROGRESS");
    expect(response.body.data.handshake.state).toBe("VERIFIED");

    const updated = await prisma.job.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(updated.status).toBe("IN_PROGRESS");
    expect(updated.startedAt).not.toBeNull();
    expect(updated.handshakeVerifiedAt).not.toBeNull();
    expect(updated.handshakeFailedAttempts).toBe(0);

    const history = await prisma.jobStatusHistory.findFirst({
      where: { jobId: job.id, toStatus: "IN_PROGRESS" },
    });
    expect(history?.fromStatus).toBe("EN_ROUTE");
    expect(history?.reason).toBe("Handshake verified");
    expect(history?.actorUserId).toBe(technician.userId);

    const audit = await prisma.portalAuditEvent.findFirst({
      where: { jobId: job.id, action: "HANDSHAKE_VERIFIED" },
    });
    expect(audit?.actorUserId).toBe(technician.userId);
  });

  it("wrong code increments attempts persistently", async () => {
    const job = await seedJob({ status: "EN_ROUTE" });

    const response = await request(app)
      .post(`/api/v1/jobs/${job.id}/start`)
      .set(technician.auth)
      .send({ code: wrongCodeFor(job.id, 1) });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("HANDSHAKE_INVALID");
    expect(response.body.error.message).toContain("4 attempts remaining");

    // The increment must survive the error response (committed statement).
    const updated = await prisma.job.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(updated.handshakeFailedAttempts).toBe(1);
    expect(updated.status).toBe("EN_ROUTE");

    const audit = await prisma.portalAuditEvent.findFirst({
      where: { jobId: job.id, action: "HANDSHAKE_FAILED" },
    });
    expect(audit).not.toBeNull();
  });

  it("5 wrong codes lock the job for the lock window; correct code during lock is rejected 423", async () => {
    const job = await seedJob({ status: "EN_ROUTE" });
    const wrong = wrongCodeFor(job.id, 1);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app)
        .post(`/api/v1/jobs/${job.id}/start`)
        .set(technician.auth)
        .send({ code: wrong });
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe("HANDSHAKE_INVALID");
    }

    const locked = await prisma.job.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(locked.handshakeFailedAttempts).toBe(5);
    expect(locked.handshakeLockedUntil).not.toBeNull();
    expect(locked.handshakeLockedUntil!.getTime()).toBeGreaterThan(Date.now());

    const lockAudit = await prisma.portalAuditEvent.findFirst({
      where: { jobId: job.id, action: "HANDSHAKE_LOCKED" },
    });
    expect(lockAudit).not.toBeNull();

    const duringLock = await request(app)
      .post(`/api/v1/jobs/${job.id}/start`)
      .set(technician.auth)
      .send({ code: codeFor(job.id, 1) });
    expect(duringLock.status).toBe(423);
    expect(duringLock.body.error.code).toBe("HANDSHAKE_LOCKED");
  });

  it("20 parallel wrong codes lock the job and the counter reaches the max", async () => {
    const job = await seedJob({ status: "EN_ROUTE" });
    const wrong = wrongCodeFor(job.id, 1);

    const responses = await Promise.all(
      Array.from({ length: 20 }, () =>
        request(app)
          .post(`/api/v1/jobs/${job.id}/start`)
          .set(technician.auth)
          .send({ code: wrong }),
      ),
    );

    // Every attempt is rejected: 422 while counting, 423 once locked.
    for (const response of responses) {
      expect([422, 423]).toContain(response.status);
    }

    const updated = await prisma.job.findUniqueOrThrow({
      where: { id: job.id },
    });
    // The atomic increment must not lose counts under concurrency: the
    // counter reaches at least HANDSHAKE_MAX_ATTEMPTS and the lock is set.
    expect(updated.handshakeFailedAttempts).toBeGreaterThanOrEqual(5);
    expect(updated.handshakeLockedUntil).not.toBeNull();
    expect(updated.handshakeLockedUntil!.getTime()).toBeGreaterThan(Date.now());
    expect(updated.status).toBe("EN_ROUTE");
  });

  it("an expired lock resets the failure counter instead of re-locking on one typo", async () => {
    const job = await seedJob({
      status: "EN_ROUTE",
      handshakeFailedAttempts: 5,
      handshakeLockedUntil: new Date(Date.now() - 60 * 1000),
    });
    const wrong = wrongCodeFor(job.id, 1);

    const response = await request(app)
      .post(`/api/v1/jobs/${job.id}/start`)
      .set(technician.auth)
      .send({ code: wrong });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("HANDSHAKE_INVALID");

    const updated = await prisma.job.findUniqueOrThrow({
      where: { id: job.id },
    });
    // Counter restarted from zero: this typo is attempt #1, not #6,
    // and no new lock was set.
    expect(updated.handshakeFailedAttempts).toBe(1);
    expect(
      updated.handshakeLockedUntil === null ||
        updated.handshakeLockedUntil.getTime() <= Date.now(),
    ).toBe(true);

    // And the correct code still works right after.
    const ok = await request(app)
      .post(`/api/v1/jobs/${job.id}/start`)
      .set(technician.auth)
      .send({ code: codeFor(job.id, 1) });
    expect(ok.status).toBe(200);
  });

  it("POST /jobs/:id/status cannot move EN_ROUTE to IN_PROGRESS (422 HANDSHAKE_REQUIRED) for any role", async () => {
    const job = await seedJob({ status: "EN_ROUTE" });

    for (const actor of [technician, owner]) {
      const response = await request(app)
        .post(`/api/v1/jobs/${job.id}/status`)
        .set(actor.auth)
        .send({ status: "IN_PROGRESS" });
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe("HANDSHAKE_REQUIRED");
    }

    const updated = await prisma.job.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(updated.status).toBe("EN_ROUTE");
  });

  it("technician not assigned to the job cannot call start", async () => {
    const job = await seedJob({ status: "EN_ROUTE" });

    const response = await request(app)
      .post(`/api/v1/jobs/${job.id}/start`)
      .set(otherTechnician.auth)
      .send({ code: codeFor(job.id, 1) });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("HANDSHAKE_NOT_AVAILABLE");

    const updated = await prisma.job.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(updated.status).toBe("EN_ROUTE");
  });

  it("start is not available before EN_ROUTE", async () => {
    const job = await seedJob({ status: "SCHEDULED" });

    const response = await request(app)
      .post(`/api/v1/jobs/${job.id}/start`)
      .set(technician.auth)
      .send({ code: codeFor(job.id, 1) });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("HANDSHAKE_NOT_AVAILABLE");
  });

  it("override requires reason and OWNER/DISPATCHER; writes HANDSHAKE_OVERRIDDEN", async () => {
    const job = await seedJob({ status: "EN_ROUTE" });
    const reason = "Customer phone is broken";

    const byTechnician = await request(app)
      .post(`/api/v1/jobs/${job.id}/start/override`)
      .set(technician.auth)
      .send({ reason });
    expect(byTechnician.status).toBe(403);

    const withoutReason = await request(app)
      .post(`/api/v1/jobs/${job.id}/start/override`)
      .set(owner.auth)
      .send({});
    expect(withoutReason.status).toBe(422);
    expect(withoutReason.body.error.code).toBe("VALIDATION_FAILED");

    const response = await request(app)
      .post(`/api/v1/jobs/${job.id}/start/override`)
      .set(owner.auth)
      .send({ reason });
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("IN_PROGRESS");

    const history = await prisma.jobStatusHistory.findFirst({
      where: { jobId: job.id, toStatus: "IN_PROGRESS" },
    });
    expect(history?.reason).toBe(`Handshake override: ${reason}`);

    const audit = await prisma.portalAuditEvent.findFirst({
      where: { jobId: job.id, action: "HANDSHAKE_OVERRIDDEN" },
    });
    expect(audit?.actorUserId).toBe(owner.userId);
    expect(audit?.metadata).toMatchObject({ reason });
  });

  it("reassignment during EN_ROUTE changes the code", async () => {
    const job = await seedJob({ status: "EN_ROUTE" });
    const oldCode = codeFor(job.id, 1);

    const assignResponse = await request(app)
      .post(`/api/v1/jobs/${job.id}/assign`)
      .set(owner.auth)
      .send({ technicianId: otherTechnician.userId });
    expect(assignResponse.status).toBe(200);

    const updated = await prisma.job.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(updated.handshakeVersion).toBe(2);
    expect(updated.assignedTechnicianId).toBe(otherTechnician.userId);

    const newCode = codeFor(job.id, 2);
    expect(newCode).not.toBe(oldCode);

    const withOldCode = await request(app)
      .post(`/api/v1/jobs/${job.id}/start`)
      .set(otherTechnician.auth)
      .send({ code: oldCode });
    expect(withOldCode.status).toBe(422);
    expect(withOldCode.body.error.code).toBe("HANDSHAKE_INVALID");

    const withNewCode = await request(app)
      .post(`/api/v1/jobs/${job.id}/start`)
      .set(otherTechnician.auth)
      .send({ code: newCode });
    expect(withNewCode.status).toBe(200);
    expect(withNewCode.body.data.status).toBe("IN_PROGRESS");
  });

  it("no staff or technician response ever contains the derived code", async () => {
    const job = await seedJob({ status: "EN_ROUTE" });
    const code = codeFor(job.id, 1);

    const ownerView = await request(app)
      .get(`/api/v1/jobs/${job.id}`)
      .set(owner.auth);
    expect(ownerView.status).toBe(200);
    expect(ownerView.body.data.handshake).toEqual({
      state: "AWAITING_CODE",
      lockedUntil: null,
    });
    expect(collectStringValues(ownerView.body)).not.toContain(code);

    const technicianView = await request(app)
      .get(`/api/v1/jobs/${job.id}`)
      .set(technician.auth);
    expect(technicianView.status).toBe(200);
    expect(technicianView.body.data.handshake.state).toBe("AWAITING_CODE");
    expect(collectStringValues(technicianView.body)).not.toContain(code);

    const listView = await request(app).get("/api/v1/jobs").set(owner.auth);
    expect(listView.status).toBe(200);
    expect(collectStringValues(listView.body)).not.toContain(code);
  });

  it("code is delivered by SMS/email stub on EN_ROUTE; failure of delivery does not fail the transition", async () => {
    const job = await seedJob({ status: "SCHEDULED" });

    // Test env has no RESEND_API_KEY / TEXTBEE_API_KEY: the adapters
    // no-op, and delivery must never break the business transition.
    const response = await request(app)
      .post(`/api/v1/jobs/${job.id}/status`)
      .set(owner.auth)
      .send({ status: "EN_ROUTE" });
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("EN_ROUTE");

    // Delivery runs through the in-process queue; poll briefly for the
    // per-channel audit rows the delivery processor writes.
    let sentAudits = 0;
    for (let waited = 0; waited < 3000 && sentAudits === 0; waited += 150) {
      sentAudits = await prisma.portalAuditEvent.count({
        where: { jobId: job.id, action: "HANDSHAKE_CODE_SENT" },
      });
      if (sentAudits === 0) {
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }
    expect(sentAudits).toBeGreaterThan(0);
  });

  it("staff of another company cannot start or override a job (404)", async () => {
    const job = await seedJob({ status: "EN_ROUTE" });
    const otherCompany = await prisma.company.create({
      data: {
        name: "Other Company",
        slug: `other-company-${suffix()}`,
        phone: "+1234567890",
      },
    });
    const otherOwner = await createActor(otherCompany.id, "OWNER", "outsider");

    const startResponse = await request(app)
      .post(`/api/v1/jobs/${job.id}/start`)
      .set(otherOwner.auth)
      .send({ code: codeFor(job.id, 1) });
    expect(startResponse.status).toBe(404);

    const overrideResponse = await request(app)
      .post(`/api/v1/jobs/${job.id}/start/override`)
      .set(otherOwner.auth)
      .send({ reason: "Trying to override across companies" });
    expect(overrideResponse.status).toBe(404);
  });
});
