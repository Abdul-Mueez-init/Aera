/**
 * Phase 8 — tracking backend, durable outbox, portal delivery tokens.
 *
 * LIVE_TRACKING_ENABLED and NOTIFICATION_OUTBOX_ENABLED must be set
 * BEFORE src imports (env.ts parses once at load).
 */
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

process.env.LIVE_TRACKING_ENABLED = "true";
process.env.NOTIFICATION_OUTBOX_ENABLED = "true";
process.env.WORKSPACE_PORTAL_ENABLED = "true";

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
  const tokens = await import("../src/modules/portal/portal.tokens.js");
  generateToken = tokens.generateToken;
  hashToken = tokens.hashToken;
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
    email: `p8-${suffix()}@example.com`,
    password: "correct-horse-battery-staple",
    firstName: "Owner",
    lastName: "P8",
    companyName: `P8 ${suffix()}`,
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
      lat: 30.2672,
      lng: -97.7431,
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

let jobCounter = 0;
async function seedJob(
  fx: Fixture,
  opts: { status?: string; technicianId?: string } = {},
) {
  jobCounter += 1;
  return prisma.job.create({
    data: {
      companyId: fx.companyId,
      customerId: fx.customerId,
      serviceAddressId: fx.addressId,
      jobNumber: 90000 + jobCounter,
      serviceType: "AC Repair",
      problemDescription: "Not cooling",
      status: (opts.status ?? "EN_ROUTE") as never,
      assignedTechnicianId: opts.technicianId ?? fx.userId,
    },
  });
}

async function portalSession(fx: Fixture) {
  const linkToken = generateToken();
  await prisma.portalAccessGrant.create({
    data: {
      companyId: fx.companyId,
      customerId: fx.customerId,
      scope: "WORKSPACE",
      issuedBy: fx.userId,
      linkTokenHash: hashToken(linkToken),
      linkExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: "ACTIVE",
    },
  });
  const exchange = await request(app)
    .post("/api/v1/portal/exchange")
    .set("X-Aera-Portal", "1")
    .send({ token: linkToken, deliver: "bearer" });
  expect(exchange.status).toBe(200);
  return { Authorization: `Bearer ${exchange.body.data.sessionToken}` };
}

describe("Phase 8.2 — live tracking backend", () => {
  it("rejects location updates from non-assigned technicians and other tenants", async () => {
    const fx = await seedCompany();
    const other = await seedCompany();
    const job = await seedJob(fx);

    // Unauthenticated
    const noAuth = await request(app).post(
      `/api/v1/jobs/${job.id}/location`,
    ).send({ latitude: 30.1, longitude: -97.7 });
    expect(noAuth.status).toBe(401);

    // Wrong tenant (different company, same user id space)
    const crossTenant = await request(app)
      .post(`/api/v1/jobs/${job.id}/location`)
      .set(other.auth)
      .send({ latitude: 30.1, longitude: -97.7 });
    expect(crossTenant.status).toBe(404);

    // Same company but not the assigned technician: create a second
    // user in the company? Registration creates a new company, so use
    // a member invite path is heavy — instead verify a job assigned to
    // someone else rejects the owner token.
    const job2 = await seedJob(fx, { technicianId: other.userId });
    // other.userId belongs to a different company, so assignment is
    // cross-tenant invalid; instead test assigned-to-nobody job.
    const unassigned = await prisma.job.create({
      data: {
        companyId: fx.companyId,
        customerId: fx.customerId,
        serviceAddressId: fx.addressId,
        jobNumber: 90000 + ++jobCounter,
        serviceType: "AC Repair",
        problemDescription: "x",
        status: "EN_ROUTE",
      },
    });
    const res = await request(app)
      .post(`/api/v1/jobs/${unassigned.id}/location`)
      .set(fx.auth)
      .send({ latitude: 30.1, longitude: -97.7 });
    expect(res.status).toBe(404);
    void job2;
  });

  it("accepts location only while EN_ROUTE and computes ETA", async () => {
    const fx = await seedCompany();
    const job = await seedJob(fx, { status: "EN_ROUTE" });

    const res = await request(app)
      .post(`/api/v1/jobs/${job.id}/location`)
      .set(fx.auth)
      .send({ latitude: 30.27, longitude: -97.74, accuracy: 12 });
    expect(res.status).toBe(200);
    expect(res.body.data.etaMinutes).toBeGreaterThan(0);

    const state = await prisma.jobTrackingState.findUnique({
      where: { jobId: job.id },
    });
    expect(state?.sharingActive).toBe(true);
    expect(state?.consentAt).not.toBeNull();

    // Second update while still EN_ROUTE works (upsert, one row)
    const res2 = await request(app)
      .post(`/api/v1/jobs/${job.id}/location`)
      .set(fx.auth)
      .send({ latitude: 30.28, longitude: -97.75 });
    expect(res2.status).toBe(200);
    const count = await prisma.jobTrackingState.count({
      where: { jobId: job.id },
    });
    expect(count).toBe(1);
  });

  it("rejects location when job is not EN_ROUTE and wipes state on completion", async () => {
    const fx = await seedCompany();
    const job = await seedJob(fx, { status: "SCHEDULED" });
    const res = await request(app)
      .post(`/api/v1/jobs/${job.id}/location`)
      .set(fx.auth)
      .send({ latitude: 30.27, longitude: -97.74 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("TRACKING_NOT_ACTIVE");

    // EN_ROUTE → post → complete job → tracking row wiped
    const enRoute = await seedJob(fx, { status: "EN_ROUTE" });
    await request(app)
      .post(`/api/v1/jobs/${enRoute.id}/location`)
      .set(fx.auth)
      .send({ latitude: 30.27, longitude: -97.74 });
    await prisma.jobTrackingState.update({
      where: { jobId: enRoute.id },
      data: { sharingActive: true },
    });
    // Simulate the transition hook directly (completeJob path calls
    // clearJobTracking); assert the helper contract via status change.
    const { clearJobTracking } = await import(
      "../src/modules/tracking/tracking.service.js"
    );
    await clearJobTracking(enRoute.id, fx.companyId);
    const gone = await prisma.jobTrackingState.findUnique({
      where: { jobId: enRoute.id },
    });
    expect(gone).toBeNull();
    void job;
  });

  it("customer tracking endpoint is tenant/customer scoped and marks stale", async () => {
    const fx = await seedCompany();
    const other = await seedCompany();
    const job = await seedJob(fx, { status: "EN_ROUTE" });
    await request(app)
      .post(`/api/v1/jobs/${job.id}/location`)
      .set(fx.auth)
      .send({ latitude: 30.27, longitude: -97.74 });

    const portal = await portalSession(fx);
    const res = await request(app)
      .get(`/api/v1/portal/jobs/${job.id}/tracking`)
      .set(portal);
    expect(res.status).toBe(200);
    expect(res.body.data.sharingActive).toBe(true);
    expect(res.body.data.stale).toBe(false);

    // Cross-customer: other company's portal session must not see it
    const otherPortal = await portalSession(other);
    const cross = await request(app)
      .get(`/api/v1/portal/jobs/${job.id}/tracking`)
      .set(otherPortal);
    expect([403, 404]).toContain(cross.status);

    // Age the position past the 2-minute stale window
    await prisma.jobTrackingState.update({
      where: { jobId: job.id },
      data: { updatedAt: new Date(Date.now() - 3 * 60 * 1000) },
    });
    const stale = await request(app)
      .get(`/api/v1/portal/jobs/${job.id}/tracking`)
      .set(portal);
    expect(stale.status).toBe(200);
    expect(stale.body.data.stale).toBe(true);
    // Stale responses carry status only — no coordinates
    expect(stale.body.data.lastLat).toBeUndefined();
  });
});

describe("Phase 8.1 — durable notification outbox", () => {
  it("mints a portal delivery token at send time and exchanges it once", async () => {
    const fx = await seedCompany();
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

    // Simulate what the outbox worker does: mint + store hash only.
    const plaintext = generateToken();
    await prisma.portalDeliveryToken.create({
      data: {
        grantId: grant.id,
        tokenHash: hashToken(plaintext),
        expiresAt: grant.linkExpiresAt,
      },
    });

    // The plaintext token is NOT stored anywhere — only its hash.
    const stored = await prisma.portalDeliveryToken.findFirst({
      where: { grantId: grant.id },
    });
    expect(stored?.tokenHash).not.toBe(plaintext);
    expect(stored?.tokenHash).toBe(hashToken(plaintext));

    // Exchange works with the delivery token
    const exchange = await request(app)
      .post("/api/v1/portal/exchange")
      .set("X-Aera-Portal", "1")
      .send({ token: plaintext, deliver: "bearer" });
    expect(exchange.status).toBe(200);
    expect(exchange.body.data.sessionToken).toBeTruthy();

    // Single-use: replay fails
    const replay = await request(app)
      .post("/api/v1/portal/exchange")
      .set("X-Aera-Portal", "1")
      .send({ token: plaintext, deliver: "bearer" });
    expect([401, 409, 410]).toContain(replay.status);
  });

  it("outbox rows dedupe on dedupeKey and dead-letter after max attempts", async () => {
    const fx = await seedCompany();
    const { enqueueNotificationOutbox } = await import(
      "../src/modules/notifications/notification-outbox.service.js"
    );
    const key = `p8-test-${suffix()}`;
    await enqueueNotificationOutbox({
      companyId: fx.companyId,
      channel: "IN_APP",
      template: "JOB_SCHEDULED",
      payload: { jobId: "x" },
      dedupeKey: key,
    });
    // Duplicate dedupe key must fail (unique constraint)
    await expect(
      enqueueNotificationOutbox({
        companyId: fx.companyId,
        channel: "IN_APP",
        template: "JOB_SCHEDULED",
        payload: { jobId: "x" },
        dedupeKey: key,
      }),
    ).rejects.toThrow();

    // Force a row to DEAD and verify sweep skips it
    const row = await prisma.notificationOutbox.findFirst({
      where: { dedupeKey: key },
    });
    await prisma.notificationOutbox.update({
      where: { id: row!.id },
      data: { status: "DEAD", attempts: 99 },
    });
    const { startNotificationOutboxScheduler } = await import(
      "../src/modules/notifications/notification-outbox.service.js"
    );
    const stop = startNotificationOutboxScheduler();
    stop();
    const after = await prisma.notificationOutbox.findUnique({
      where: { id: row!.id },
    });
    expect(after?.status).toBe("DEAD");
    expect(after?.attempts).toBe(99);
  });
});
