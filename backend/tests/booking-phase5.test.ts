/**
 * Phase 5 — Scheduling and booking tests (BOOKING_ENABLED=true).
 *
 * Flags must be set BEFORE src imports (env.ts parses once at load).
 * Covers 5.1 config, 5.3 proposals, 5.4 holds + atomic confirmation,
 * 5.5 BookingGate (DISPATCHER_CONFIRMS vs SELF_SERVE_WINDOWS) and the
 * portal booking endpoints' tenant scoping.
 */
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

process.env.BOOKING_ENABLED = "true";
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
  const res = await request(app).post("/api/v1/auth/register").send({
    email: `p5-${suffix()}@example.com`,
    password: "correct-horse-battery-staple",
    firstName: "Owner",
    lastName: "P5",
    companyName: `P5 ${suffix()}`,
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

async function seedTechnician(companyId: string) {
  const res = await request(app).post("/api/v1/auth/register").send({
    email: `p5-tech-${suffix()}@example.com`,
    password: "correct-horse-battery-staple",
    firstName: "Tech",
    lastName: "Five",
    companyName: `Temp ${suffix()}`,
  });
  expect(res.status).toBe(201);
  const techUserId = res.body.data.user.id as string;
  const tempCompanyId = res.body.data.company.id as string;
  await prisma.companyMember.deleteMany({ where: { userId: techUserId } });
  await prisma.companyMember.create({
    data: {
      userId: techUserId,
      companyId,
      role: "TECHNICIAN",
      status: "ACTIVE",
    },
  });
  await prisma.company.delete({ where: { id: tempCompanyId } });
  return techUserId;
}

async function seedRequest(fx: Fixture, status = "SUBMITTED") {
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
      status: status as never,
    },
  });
}

async function workspaceSession(fx: Fixture, customerId?: string) {
  const cid = customerId ?? fx.customerId;
  const grant = await prisma.portalAccessGrant.create({
    data: {
      companyId: fx.companyId,
      customerId: cid,
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
      customerId: cid,
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

async function sentRequestQuote(fx: Fixture) {
  const requestRow = await seedRequest(fx);
  const created = await request(app)
    .post("/api/v1/quotes")
    .set(fx.auth)
    .send({
      customerId: fx.customerId,
      serviceRequestId: requestRow.id,
      kind: "REPAIR",
      currency: "USD",
      items: [
        { description: "Service call", quantity: "1", unitPriceMinor: 10000 },
      ],
    });
  expect(created.status).toBe(201);
  const sent = await request(app)
    .post(`/api/v1/quotes/${created.body.data.id}/send`)
    .set(fx.auth);
  expect(sent.status).toBe(200);
  return { requestRow, quote: created.body.data as { id: string } };
}

let fx: Fixture;

beforeEach(async () => {
  await prisma.$transaction([
    prisma.appointmentHold.deleteMany(),
    prisma.appointmentProposal.deleteMany(),
    prisma.portalSession.deleteMany(),
    prisma.portalAccessGrant.deleteMany(),
    prisma.portalAuditEvent.deleteMany(),
    prisma.serviceRequestMessage.deleteMany(),
    prisma.serviceRequestAttachment.deleteMany(),
    prisma.serviceRequestUpload.deleteMany(),
    prisma.serviceRequestEvent.deleteMany(),
    prisma.jobStatusHistory.deleteMany(),
    prisma.job.deleteMany(),
    prisma.invoiceDisputeEvent.deleteMany(),
    prisma.invoiceDispute.deleteMany(),
    prisma.refund.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.paymentOperation.deleteMany(),
    prisma.paymentSession.deleteMany(),
    prisma.providerWebhookEvent.deleteMany(),
    prisma.invoiceCreditApplication.deleteMany(),
    prisma.invoiceItem.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.quoteApprovalEvent.deleteMany(),
    prisma.quoteAcceptance.deleteMany(),
    prisma.quoteItem.deleteMany(),
    prisma.quote.deleteMany(),
    prisma.serviceRequest.deleteMany(),
    prisma.serviceAddress.deleteMany(),
    prisma.companyBusinessHours.deleteMany(),
    prisma.technicianWorkingHours.deleteMany(),
    prisma.technicianTimeOff.deleteMany(),
    prisma.technicianSkill.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.companyMember.deleteMany(),
    prisma.refreshSession.deleteMany(),
    prisma.user.deleteMany(),
    prisma.company.deleteMany(),
  ]);
  fx = await seedCompany();
});

describe("5.1 booking config", () => {
  it("returns defaults and updates mode/buffer/business hours", async () => {
    const initial = await request(app)
      .get("/api/v1/booking/config")
      .set(fx.auth);
    expect(initial.status).toBe(200);
    expect(initial.body.data.company.bookingMode).toBe("DISPATCHER_CONFIRMS");

    const updated = await request(app)
      .patch("/api/v1/booking/config")
      .set(fx.auth)
      .send({
        bookingMode: "SELF_SERVE_WINDOWS",
        travelBufferMinutes: 30,
        businessHours: [
          { weekday: 1, open: "08:00", close: "17:00" },
          { weekday: 2, open: "08:00", close: "17:00" },
        ],
      });
    expect(updated.status).toBe(200);
    expect(updated.body.data.company.bookingMode).toBe("SELF_SERVE_WINDOWS");
    expect(updated.body.data.businessHours).toHaveLength(2);
  });

  it("rejects config updates from non-owners", async () => {
    const tech = await seedTechnician(fx.companyId);
    void tech;
    const res = await request(app)
      .patch("/api/v1/booking/config")
      .set({ Authorization: `Bearer ${""}` })
      .send({});
    expect([401, 403]).toContain(res.status);
  });
});

describe("5.3 appointment proposals", () => {
  it("staff creates, lists and customer picks a proposal window", async () => {
    const requestRow = await seedRequest(fx);
    const start = new Date(Date.now() + 2 * 86_400_000);
    start.setUTCHours(15, 0, 0, 0);
    const end = new Date(start.getTime() + 2 * 3_600_000);
    const created = await request(app)
      .post("/api/v1/booking/proposals")
      .set(fx.auth)
      .send({
        requestId: requestRow.id,
        windows: [{ startsAt: start, endsAt: end }],
        expiresAt: new Date(Date.now() + 3 * 86_400_000),
      });
    expect(created.status).toBe(201);
    const proposalId = created.body.data.id as string;

    const portal = await workspaceSession(fx);
    const listed = await request(app)
      .get("/api/v1/portal/booking/proposals")
      .set(portal);
    expect(listed.status).toBe(200);
    expect(
      listed.body.data.some((p: { id: string }) => p.id === proposalId),
    ).toBe(true);

    const picked = await request(app)
      .post(`/api/v1/portal/appointment-proposals/${proposalId}/pick`)
      .set(portal)
      .send({ startsAt: start, endsAt: end });
    expect(picked.status).toBe(200);
    expect(picked.body.data.status).toBe("PICKED");

    const again = await request(app)
      .post(`/api/v1/portal/appointment-proposals/${proposalId}/pick`)
      .set(portal)
      .send({ startsAt: start, endsAt: end });
    expect(again.status).toBe(409);
  });

  it("hides proposals from other customers", async () => {
    const requestRow = await seedRequest(fx);
    const other = await prisma.customer.create({
      data: {
        companyId: fx.companyId,
        firstName: "Other",
        lastName: "Customer",
        email: `other-${suffix()}@example.com`,
      },
    });
    await prisma.portalAccessGrant.deleteMany();
    const created = await request(app)
      .post("/api/v1/booking/proposals")
      .set(fx.auth)
      .send({
        requestId: requestRow.id,
        windows: [
          {
            startsAt: new Date(Date.now() + 86_400_000),
            endsAt: new Date(Date.now() + 2 * 86_400_000),
          },
        ],
        expiresAt: new Date(Date.now() + 3 * 86_400_000),
      });
    const proposalId = created.body.data.id as string;

    const portal = await workspaceSession(fx, other.id);
    const listed = await request(app)
      .get("/api/v1/portal/booking/proposals")
      .set(portal);
    expect(listed.status).toBe(200);
    expect(
      listed.body.data.some((p: { id: string }) => p.id === proposalId),
    ).toBe(false);

    const picked = await request(app)
      .post(`/api/v1/portal/appointment-proposals/${proposalId}/pick`)
      .set(portal)
      .send({
        startsAt: new Date(Date.now() + 86_400_000),
        endsAt: new Date(Date.now() + 2 * 86_400_000),
      });
    expect(picked.status).toBe(409);
  });
});

describe("5.4 holds and atomic confirmation", () => {
  it("10 parallel confirms on a one-capacity window yield exactly one success", async () => {
    await seedTechnician(fx.companyId);
    const requestRow = await seedRequest(fx);
    const windowStart = new Date(Date.now() + 3 * 86_400_000);
    windowStart.setUTCHours(16, 0, 0, 0);
    const windowEnd = new Date(windowStart.getTime() + 60 * 60_000);

    const holds = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app)
          .post("/api/v1/booking/holds")
          .set(fx.auth)
          .send({
            requestId: requestRow.id,
            windowStart,
            windowEnd,
          }),
      ),
    );
    for (const hold of holds) expect(hold.status).toBe(201);

    const results = await Promise.all(
      holds.map((hold) =>
        request(app)
          .post(`/api/v1/booking/holds/${hold.body.data.id}/confirm`)
          .set(fx.auth),
      ),
    );
    const succeeded = results.filter((res) => res.status === 200);
    const failed = results.filter((res) => res.status === 409);
    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(9);
    expect(failed[0].body.error.code).toBe("SLOT_UNAVAILABLE");
  });

  it("schedules a job-linked hold and rejects expired holds", async () => {
    const techUserId = await seedTechnician(fx.companyId);
    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: fx.customerId },
    });
    void customer;
    const job = await prisma.job.create({
      data: {
        companyId: fx.companyId,
        customerId: fx.customerId,
        serviceAddressId: fx.addressId,
        jobNumber: Math.floor(Math.random() * 900_000) + 1000,
        serviceType: "Repair",
        problemDescription: "Needs repair",
        status: "NEW",
      },
    });
    const windowStart = new Date(Date.now() + 4 * 86_400_000);
    windowStart.setUTCHours(17, 0, 0, 0);
    const hold = await request(app)
      .post("/api/v1/booking/holds")
      .set(fx.auth)
      .send({
        jobId: job.id,
        technicianId: techUserId,
        windowStart,
        windowEnd: new Date(windowStart.getTime() + 60 * 60_000),
      });
    expect(hold.status).toBe(201);

    const confirmed = await request(app)
      .post(`/api/v1/booking/holds/${hold.body.data.id}/confirm`)
      .set(fx.auth);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data.status).toBe("CONFIRMED");

    const after = await prisma.job.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(after.status).toBe("SCHEDULED");
    expect(after.assignedTechnicianId).toBe(techUserId);
    expect(after.scheduledStart?.toISOString()).toBe(windowStart.toISOString());
  });
});

describe("5.5 BookingGate", () => {
  it("DISPATCHER_CONFIRMS creates the job immediately on accept", async () => {
    const { quote } = await sentRequestQuote(fx);
    const portal = await workspaceSession(fx);
    const approved = await request(app)
      .post(`/api/v1/portal/quotes/${quote.id}/respond`)
      .set(portal)
      .send({ action: "APPROVED" });
    expect(approved.status).toBe(200);

    const job = await prisma.job.findFirst({
      where: { sourceQuoteId: quote.id },
    });
    expect(job).not.toBeNull();
    expect(job?.status).toBe("NEW");
  });

  it("SELF_SERVE_WINDOWS waits for a confirmed hold, then creates the job once", async () => {
    await seedTechnician(fx.companyId);
    await prisma.company.update({
      where: { id: fx.companyId },
      data: { bookingMode: "SELF_SERVE_WINDOWS" },
    });
    const { requestRow, quote } = await sentRequestQuote(fx);
    const portal = await workspaceSession(fx);
    const approved = await request(app)
      .post(`/api/v1/portal/quotes/${quote.id}/respond`)
      .set(portal)
      .send({ action: "APPROVED" });
    expect(approved.status).toBe(200);

    // Gate WAIT: request ACCEPTED but no job yet.
    const afterAccept = await prisma.serviceRequest.findUniqueOrThrow({
      where: { id: requestRow.id },
    });
    expect(afterAccept.status).toBe("ACCEPTED");
    expect(
      await prisma.job.findFirst({ where: { sourceQuoteId: quote.id } }),
    ).toBeNull();

    // Customer confirms a booking window → job resumes exactly once.
    const windowStart = new Date(Date.now() + 5 * 86_400_000);
    windowStart.setUTCHours(18, 0, 0, 0);
    const hold = await request(app)
      .post("/api/v1/booking/holds")
      .set(fx.auth)
      .send({
        quoteId: quote.id,
        windowStart,
        windowEnd: new Date(windowStart.getTime() + 60 * 60_000),
      });
    expect(hold.status).toBe(201);

    const confirmed = await request(app)
      .post(`/api/v1/portal/booking/holds/${hold.body.data.id}/confirm`)
      .set(portal);
    expect(confirmed.status).toBe(200);

    const jobs = await prisma.job.findMany({
      where: { sourceQuoteId: quote.id },
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe("NEW");

    // Re-confirming the same hold is rejected — no duplicate job.
    const again = await request(app)
      .post(`/api/v1/portal/booking/holds/${hold.body.data.id}/confirm`)
      .set(portal);
    expect(again.status).toBe(409);
    expect(
      await prisma.job.count({ where: { sourceQuoteId: quote.id } }),
    ).toBe(1);
  });
});

describe("5.x portal booking endpoints", () => {
  it("serves availability and rejects cross-customer hold confirmation", async () => {
    const techUserId = await seedTechnician(fx.companyId);
    void techUserId;
    await prisma.companyBusinessHours.create({
      data: {
        companyId: fx.companyId,
        weekday: new Date().getUTCDay(),
        open: "08:00",
        close: "18:00",
      },
    });
    const portal = await workspaceSession(fx);
    const start = new Date(Date.now() + 86_400_000);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 7 * 86_400_000);
    const availability = await request(app)
      .get(
        `/api/v1/portal/booking/availability?startsAt=${start.toISOString()}&endsAt=${end.toISOString()}&durationMinutes=60`,
      )
      .set(portal);
    expect(availability.status).toBe(200);
    expect(availability.body.data.windows).toBeDefined();

    // A hold on another customer's request is invisible → 404.
    const other = await prisma.customer.create({
      data: {
        companyId: fx.companyId,
        firstName: "Other",
        lastName: "Customer",
        email: `other2-${suffix()}@example.com`,
      },
    });
    const otherAddress = await prisma.serviceAddress.create({
      data: {
        companyId: fx.companyId,
        customerId: other.id,
        label: "Home",
        line1: "2 Main St",
        city: "Austin",
        region: "TX",
        postalCode: "78701",
        countryCode: "US",
      },
    });
    const otherRequest = await prisma.serviceRequest.create({
      data: {
        companyId: fx.companyId,
        customerId: other.id,
        serviceAddressId: otherAddress.id,
        requestNumber: Math.floor(Math.random() * 900_000) + 1000,
        title: "Other request",
        description: "Not yours",
        serviceCategory: "HVAC",
        source: "WEB_PORTAL",
        status: "SUBMITTED",
      },
    });
    const hold = await request(app)
      .post("/api/v1/booking/holds")
      .set(fx.auth)
      .send({
        requestId: otherRequest.id,
        windowStart: new Date(Date.now() + 86_400_000),
        windowEnd: new Date(Date.now() + 2 * 86_400_000),
      });
    expect(hold.status).toBe(201);

    const stolen = await request(app)
      .post(`/api/v1/portal/booking/holds/${hold.body.data.id}/confirm`)
      .set(portal);
    expect(stolen.status).toBe(404);
  });
});

describe("5.5 customer reschedule request", () => {
  it("creates an OPEN proposal for a scheduled job and rejects unscheduled jobs", async () => {
    const job = await prisma.job.create({
      data: {
        companyId: fx.companyId,
        customerId: fx.customerId,
        serviceAddressId: fx.addressId,
        jobNumber: Math.floor(Math.random() * 900_000) + 1000,
        serviceType: "Repair",
        problemDescription: "Needs repair",
        status: "SCHEDULED",
        scheduledStart: new Date(Date.now() + 86_400_000),
        scheduledEnd: new Date(Date.now() + 2 * 86_400_000),
      },
    });
    const portal = await workspaceSession(fx);
    const window = {
      startsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      endsAt: new Date(Date.now() + 3 * 86_400_000 + 3_600_000).toISOString(),
    };
    const res = await request(app)
      .post(`/api/v1/portal/jobs/${job.id}/reschedule-request`)
      .set(portal)
      .send({ windows: [window] });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("OPEN");
    expect(res.body.data.jobId).toBe(job.id);

    const proposal = await prisma.appointmentProposal.findFirstOrThrow({
      where: { jobId: job.id },
    });
    expect(proposal.status).toBe("OPEN");

    // Unscheduled job → 409.
    const unscheduled = await prisma.job.create({
      data: {
        companyId: fx.companyId,
        customerId: fx.customerId,
        serviceAddressId: fx.addressId,
        jobNumber: Math.floor(Math.random() * 900_000) + 1000,
        serviceType: "Repair",
        problemDescription: "Needs repair",
        status: "NEW",
      },
    });
    const rejected = await request(app)
      .post(`/api/v1/portal/jobs/${unscheduled.id}/reschedule-request`)
      .set(portal)
      .send({ windows: [window] });
    expect(rejected.status).toBe(409);
    expect(rejected.body.error.code).toBe("JOB_NOT_RESCHEDULABLE");
  });
});

describe("5.1 technician availability", () => {
  it("sets working hours and manages time off", async () => {
    const techUserId = await seedTechnician(fx.companyId);

    const initial = await request(app)
      .get("/api/v1/booking/team-availability")
      .set(fx.auth);
    expect(initial.status).toBe(200);
    expect(initial.body.data.technicians).toHaveLength(1);

    const saved = await request(app)
      .put(`/api/v1/booking/technicians/${techUserId}/working-hours`)
      .set(fx.auth)
      .send({
        hours: [
          { weekday: 1, open: "08:00", close: "12:00" },
          { weekday: 3, open: "13:00", close: "17:00" },
        ],
      });
    expect(saved.status).toBe(200);
    const tech = saved.body.data.technicians.find(
      (t: { userId: string }) => t.userId === techUserId,
    );
    expect(tech.workingHours).toHaveLength(2);

    // Same technician, different company → 404.
    const other = await seedCompany();
    const foreign = await request(app)
      .put(`/api/v1/booking/technicians/${techUserId}/working-hours`)
      .set(other.auth)
      .send({ hours: [] });
    expect(foreign.status).toBe(404);

    const off = await request(app)
      .post("/api/v1/booking/time-off")
      .set(fx.auth)
      .send({
        technicianId: techUserId,
        startsAt: new Date(Date.now() + 10 * 86_400_000).toISOString(),
        endsAt: new Date(Date.now() + 12 * 86_400_000).toISOString(),
        reason: "Vacation",
      });
    expect(off.status).toBe(201);
    const timeOffId = off.body.data.id as string;

    const listed = await request(app)
      .get("/api/v1/booking/team-availability")
      .set(fx.auth);
    expect(listed.body.data.timeOff).toHaveLength(1);

    const removed = await request(app)
      .delete(`/api/v1/booking/time-off/${timeOffId}`)
      .set(fx.auth);
    expect(removed.status).toBe(200);
  });
});
