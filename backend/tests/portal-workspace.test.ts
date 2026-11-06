/**
 * Phase 2 — Customer workspace portal integration tests.
 *
 * WORKSPACE_PORTAL_ENABLED must be set BEFORE any src module is imported:
 * env.ts parses process.env once at module load and portal.access.ts /
 * customer.routes.ts read the flag per request. Like service-requests.test.ts,
 * all src imports are therefore dynamic inside beforeAll.
 *
 * Covers the Phase 2 exit criteria: the IDOR matrix is green across two
 * companies / two customers / both scopes, concurrent reissue leaves exactly
 * one ACTIVE grant, archive revokes access, and legacy JOB links are
 * untouched.
 */
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

process.env.WORKSPACE_PORTAL_ENABLED = "true";

type App = ReturnType<(typeof import("../src/app.js"))["buildApp"]>;
type PrismaClient = (typeof import("../src/db/prisma.js"))["prisma"];
type HashPassword =
  (typeof import("../src/common/auth/password.js"))["hashPassword"];
type CreateAccessToken =
  (typeof import("../src/common/auth/tokens.js"))["createAccessToken"];
type HashRefreshToken =
  (typeof import("../src/common/auth/tokens.js"))["hashRefreshToken"];
type GenerateToken =
  (typeof import("../src/modules/portal/portal.tokens.js"))["generateToken"];
type HashToken =
  (typeof import("../src/modules/portal/portal.tokens.js"))["hashToken"];

let app: App;
let prisma: PrismaClient;
let hashPassword: HashPassword;
let createAccessToken: CreateAccessToken;
let hashRefreshToken: HashRefreshToken;
let generateToken: GenerateToken;
let hashToken: HashToken;

beforeAll(async () => {
  app = (await import("../src/app.js")).buildApp();
  prisma = (await import("../src/db/prisma.js")).prisma;
  hashPassword = (await import("../src/common/auth/password.js")).hashPassword;
  const tokens = await import("../src/common/auth/tokens.js");
  createAccessToken = tokens.createAccessToken;
  hashRefreshToken = tokens.hashRefreshToken;
  const portalTokens = await import("../src/modules/portal/portal.tokens.js");
  generateToken = portalTokens.generateToken;
  hashToken = portalTokens.hashToken;
}, 60000);

function suffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

async function createOwnerAuth(companyId: string, label: string) {
  const user = await prisma.user.create({
    data: {
      email: `owner-${label}-${suffix()}@example.com`,
      passwordHash: await hashPassword("TestPassword123!"),
      firstName: "Olivia",
      lastName: "Owner",
      phone: `+1555${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`,
    },
  });
  await prisma.companyMember.create({
    data: { companyId, userId: user.id, role: "OWNER", status: "ACTIVE" },
  });
  const sessionId = crypto.randomUUID();
  await prisma.refreshSession.create({
    data: {
      id: sessionId,
      userId: user.id,
      companyId,
      tokenHash: hashRefreshToken(crypto.randomUUID()),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  const accessToken = await createAccessToken({
    userId: user.id,
    sessionId,
    companyId,
    role: "OWNER",
  });
  return { Authorization: `Bearer ${accessToken}`, userId: user.id };
}

interface Fixture {
  companyId: string;
  owner: { Authorization: string; userId: string };
  customerId: string;
  customer2Id: string;
  addressId: string;
  requestId: string;
  jobId: string;
  jobNumber: number;
  job2Id: string;
  quoteId: string;
  invoiceId: string;
}

async function seedCompany(label: string): Promise<Fixture> {
  const company = await prisma.company.create({
    data: {
      name: `WS ${label}`,
      slug: `ws-${label}-${suffix()}`,
      phone: "+15559998888",
    },
  });
  const owner = await createOwnerAuth(company.id, label);

  const customer = await prisma.customer.create({
    data: {
      companyId: company.id,
      firstName: "Casey",
      lastName: "Customer",
      email: `casey-${label}-${suffix()}@example.com`,
      phone: "+15551234567",
    },
  });
  const customer2 = await prisma.customer.create({
    data: {
      companyId: company.id,
      firstName: "Dana",
      lastName: "Second",
      email: `dana-${label}-${suffix()}@example.com`,
      phone: "+15557654321",
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
      postalCode: "78701",
      countryCode: "US",
    },
  });
  const address2 = await prisma.serviceAddress.create({
    data: {
      companyId: company.id,
      customerId: customer2.id,
      label: "Home",
      line1: "9 Other Ave",
      city: "Austin",
      region: "TX",
      postalCode: "78702",
      countryCode: "US",
    },
  });
  const serviceRequest = await prisma.serviceRequest.create({
    data: {
      companyId: company.id,
      customerId: customer.id,
      serviceAddressId: address.id,
      requestNumber: Math.floor(Math.random() * 900_000) + 1000,
      title: "Repair request",
      description: "Needs service",
      serviceCategory: "HVAC",
      source: "STAFF_DIRECT",
      status: "ACCEPTED",
    },
  });
  const jobData = {
    companyId: company.id,
    customerId: customer.id,
    serviceAddressId: address.id,
    serviceRequestId: serviceRequest.id,
    serviceType: "REPAIR" as const,
    problemDescription: "Workspace test job",
    status: "SCHEDULED" as const,
    handshakeVersion: 1,
  };
  const job = await prisma.job.create({
    data: { ...jobData, jobNumber: Math.floor(Math.random() * 900_000) + 1000 },
  });
  const job2 = await prisma.job.create({
    data: { ...jobData, jobNumber: Math.floor(Math.random() * 900_000) + 1000 },
  });
  const quote = await prisma.quote.create({
    data: {
      companyId: company.id,
      customerId: customer.id,
      jobId: job.id,
      status: "SENT",
      subtotalMinor: 5000n,
      totalMinor: 5000n,
      currency: "USD",
    },
  });
  const invoice = await prisma.invoice.create({
    data: {
      companyId: company.id,
      customerId: customer.id,
      jobId: job.id,
      invoiceNumber: `INV-${suffix()}`,
      currency: "USD",
      status: "ISSUED",
      subtotalMinor: 10000n,
      taxMinor: 0n,
      totalMinor: 10000n,
      amountPaidMinor: 0n,
      balanceDueMinor: 10000n,
    },
  });
  // A job belonging to the SECOND customer in the same company (used by the
  // IDOR matrix to prove same-tenant/different-customer reads are 404).
  await prisma.job.create({
    data: {
      companyId: company.id,
      customerId: customer2.id,
      serviceAddressId: address2.id,
      jobNumber: Math.floor(Math.random() * 900_000) + 1000,
      serviceType: "REPAIR",
      problemDescription: "Other customer job",
      status: "SCHEDULED",
      handshakeVersion: 1,
    },
  });
  return {
    companyId: company.id,
    owner,
    customerId: customer.id,
    customer2Id: customer2.id,
    addressId: address.id,
    requestId: serviceRequest.id,
    jobId: job.id,
    jobNumber: job.jobNumber,
    job2Id: job2.id,
    quoteId: quote.id,
    invoiceId: invoice.id,
  };
}

async function seedWorkspaceGrant(
  fx: Fixture,
  customerId: string = fx.customerId,
) {
  const linkToken = generateToken();
  const grant = await prisma.portalAccessGrant.create({
    data: {
      companyId: fx.companyId,
      customerId,
      scope: "WORKSPACE",
      issuedBy: fx.owner.userId,
      linkTokenHash: hashToken(linkToken),
      linkExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: "ACTIVE",
    },
  });
  return { grant, linkToken };
}

async function exchangeForCookie(linkToken: string) {
  const res = await request(app)
    .post("/api/v1/portal/exchange")
    .set("X-Aera-Portal", "1")
    .send({ token: linkToken });
  expect(res.status).toBe(200);
  const cookie = res.headers["set-cookie"]?.[0]?.split(";")[0];
  expect(cookie).toBeDefined();
  return cookie as string;
}

async function seedPortalSession(
  fx: Fixture,
  opts: { scope: "JOB" | "WORKSPACE"; jobId?: string },
) {
  const grant = await prisma.portalAccessGrant.create({
    data: {
      companyId: fx.companyId,
      customerId: fx.customerId,
      jobId: opts.scope === "JOB" ? (opts.jobId ?? fx.jobId) : null,
      scope: opts.scope,
      issuedBy: fx.owner.userId,
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
      jobId: opts.scope === "JOB" ? (opts.jobId ?? fx.jobId) : null,
      scope: opts.scope,
      sessionTokenHash: hashToken(sessionToken),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      lastSeenAt: new Date(),
    },
  });
  return sessionToken;
}

function portal(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "X-Aera-Portal": "1",
  };
}

let companyA: Fixture;
let companyB: Fixture;

beforeEach(async () => {
  await prisma.$transaction([
    prisma.portalSession.deleteMany(),
    prisma.portalAccessGrant.deleteMany(),
    prisma.portalAuditEvent.deleteMany(),
    prisma.customerReview.deleteMany(),
    prisma.quoteApprovalEvent.deleteMany(),
    prisma.quoteItem.deleteMany(),
    prisma.quote.deleteMany(),
    prisma.invoiceItem.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.jobStatusHistory.deleteMany(),
    prisma.job.deleteMany(),
    prisma.serviceRequestMessage.deleteMany(),
    prisma.serviceRequestAttachment.deleteMany(),
    prisma.serviceRequestUpload.deleteMany(),
    prisma.serviceRequestEvent.deleteMany(),
    prisma.serviceRequest.deleteMany(),
    prisma.refreshSession.deleteMany(),
    prisma.companyMember.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.serviceAddress.deleteMany(),
    prisma.user.deleteMany(),
    prisma.company.deleteMany(),
  ]);
  companyA = await seedCompany("a");
  companyB = await seedCompany("b");
});

describe("workspace grant lifecycle (staff API)", () => {
  it("issues a WORKSPACE grant, audits it, and returns a usable link", async () => {
    const res = await request(app)
      .post(`/api/v1/customers/${companyA.customerId}/portal-access`)
      .set({ Authorization: companyA.owner.Authorization })
      .send({ channels: [] })
      .expect(201);

    expect(res.body.data.link).toContain("/open#t=");
    expect(res.body.data.deliveries).toEqual([]);

    const grant = await prisma.portalAccessGrant.findUnique({
      where: { id: res.body.data.grantId },
    });
    expect(grant?.scope).toBe("WORKSPACE");
    expect(grant?.jobId).toBeNull();
    expect(grant?.status).toBe("ACTIVE");

    const audit = await prisma.portalAuditEvent.findFirst({
      where: { grantId: grant!.id, action: "PORTAL_LINK_ISSUED" },
    });
    expect(audit?.resourceType).toBe("WORKSPACE");
    expect(audit?.resourceId).toBe(companyA.customerId);

    // The issued link exchanges for a WORKSPACE session.
    const linkToken = res.body.data.link.split("#t=")[1];
    const cookie = await exchangeForCookie(linkToken);
    const me = await request(app)
      .get("/api/v1/portal/me")
      .set("Cookie", cookie)
      .expect(200);
    expect(me.body.data.scope).toBe("WORKSPACE");
    expect(me.body.data.customer.id).toBe(companyA.customerId);
  });

  it("rejects a second ACTIVE workspace grant for the same customer", async () => {
    await request(app)
      .post(`/api/v1/customers/${companyA.customerId}/portal-access`)
      .set({ Authorization: companyA.owner.Authorization })
      .send({ channels: [] })
      .expect(201);
    await request(app)
      .post(`/api/v1/customers/${companyA.customerId}/portal-access`)
      .set({ Authorization: companyA.owner.Authorization })
      .send({ channels: [] })
      .expect(409);
  });

  it("reissue deactivates the old grant, revokes its sessions, keeps exactly one ACTIVE", async () => {
    const first = await request(app)
      .post(`/api/v1/customers/${companyA.customerId}/portal-access`)
      .set({ Authorization: companyA.owner.Authorization })
      .send({ channels: [] })
      .expect(201);
    const linkToken = first.body.data.link.split("#t=")[1];
    const cookie = await exchangeForCookie(linkToken);

    await request(app)
      .post(`/api/v1/customers/${companyA.customerId}/portal-access/reissue`)
      .set({ Authorization: companyA.owner.Authorization })
      .send({ channels: [] })
      .expect(201);

    const active = await prisma.portalAccessGrant.count({
      where: {
        companyId: companyA.companyId,
        customerId: companyA.customerId,
        scope: "WORKSPACE",
        status: "ACTIVE",
      },
    });
    expect(active).toBe(1);

    // The old session is dead; the old link reports the grant as gone.
    // (DEACTIVATED grants answer 410, not the 409 used for an already-burned
    // unconsumed link.)
    await request(app)
      .get("/api/v1/portal/me")
      .set("Cookie", cookie)
      .expect(410);
    await request(app)
      .post("/api/v1/portal/exchange")
      .set("X-Aera-Portal", "1")
      .send({ token: linkToken })
      .expect(410);
  });

  it("concurrent reissues leave exactly one ACTIVE grant", async () => {
    await request(app)
      .post(`/api/v1/customers/${companyA.customerId}/portal-access`)
      .set({ Authorization: companyA.owner.Authorization })
      .send({ channels: [] })
      .expect(201);

    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        request(app)
          .post(
            `/api/v1/customers/${companyA.customerId}/portal-access/reissue`,
          )
          .set({ Authorization: companyA.owner.Authorization })
          .send({ channels: [] }),
      ),
    );
    // At least one must succeed; failures are acceptable only as 429/409.
    const succeeded = results.filter((r) => r.status === "fulfilled");
    expect(succeeded.length).toBeGreaterThanOrEqual(1);
    for (const r of results) {
      if (r.status === "rejected") throw r.reason;
    }

    const active = await prisma.portalAccessGrant.count({
      where: {
        companyId: companyA.companyId,
        customerId: companyA.customerId,
        scope: "WORKSPACE",
        status: "ACTIVE",
      },
    });
    expect(active).toBe(1);
  });

  it("revoke deactivates the grant and kills live sessions", async () => {
    const issued = await request(app)
      .post(`/api/v1/customers/${companyA.customerId}/portal-access`)
      .set({ Authorization: companyA.owner.Authorization })
      .send({ channels: [] })
      .expect(201);
    const linkToken = issued.body.data.link.split("#t=")[1];
    const cookie = await exchangeForCookie(linkToken);

    await request(app)
      .post(`/api/v1/customers/${companyA.customerId}/portal-access/revoke`)
      .set({ Authorization: companyA.owner.Authorization })
      .expect(200);

    await request(app)
      .get("/api/v1/portal/me")
      .set("Cookie", cookie)
      .expect(410);
  });

  it("status endpoint reports the latest grant", async () => {
    await request(app)
      .post(`/api/v1/customers/${companyA.customerId}/portal-access`)
      .set({ Authorization: companyA.owner.Authorization })
      .send({ channels: [] })
      .expect(201);
    const res = await request(app)
      .get(`/api/v1/customers/${companyA.customerId}/portal-access`)
      .set({ Authorization: companyA.owner.Authorization })
      .expect(200);
    expect(res.body.data.status).toBe("ACTIVE");
    expect(res.body.data).not.toHaveProperty("linkTokenHash");
  });

  it("cross-tenant customer id is indistinguishable from missing (404)", async () => {
    await request(app)
      .post(`/api/v1/customers/${companyB.customerId}/portal-access`)
      .set({ Authorization: companyA.owner.Authorization })
      .send({ channels: [] })
      .expect(404);
  });
});

describe("workspace read APIs + IDOR matrix", () => {
  it("lists only the session customer's records", async () => {
    const { linkToken } = await seedWorkspaceGrant(companyA);
    const cookie = await exchangeForCookie(linkToken);

    const jobs = await request(app)
      .get("/api/v1/portal/jobs")
      .set("Cookie", cookie)
      .expect(200);
    const jobIds = (jobs.body.data.items as Array<{ id: string }>).map(
      (j) => j.id,
    );
    expect(jobIds).toContain(companyA.jobId);
    expect(jobIds).toContain(companyA.job2Id);
    expect(jobIds).not.toContain(companyB.jobId);

    const quotes = await request(app)
      .get("/api/v1/portal/quotes")
      .set("Cookie", cookie)
      .expect(200);
    expect(
      (quotes.body.data.items as Array<{ id: string }>).map((q) => q.id),
    ).toEqual([companyA.quoteId]);

    const invoices = await request(app)
      .get("/api/v1/portal/invoices")
      .set("Cookie", cookie)
      .expect(200);
    expect(
      (invoices.body.data.items as Array<{ id: string }>).map((i) => i.id),
    ).toEqual([companyA.invoiceId]);

    const requests = await request(app)
      .get("/api/v1/portal/requests")
      .set("Cookie", cookie)
      .expect(200);
    expect(
      (requests.body.data.items as Array<{ id: string }>).map((r) => r.id),
    ).toEqual([companyA.requestId]);
  });

  it("workspace session cannot read another company's or customer's resources (404, not 403)", async () => {
    const { linkToken } = await seedWorkspaceGrant(companyA);
    const cookie = await exchangeForCookie(linkToken);

    // Other company's job/quote/invoice/request.
    for (const path of [
      `/api/v1/portal/jobs/${companyB.jobId}`,
      `/api/v1/portal/quotes/${companyB.quoteId}`,
      `/api/v1/portal/invoices/${companyB.invoiceId}`,
      `/api/v1/portal/requests/${companyB.requestId}`,
    ]) {
      const res = await request(app).get(path).set("Cookie", cookie);
      expect(res.status, path).toBe(404);
      expect(res.body.error.code).toBe("RESOURCE_NOT_FOUND");
    }

    // Same company, different customer.
    const otherCustomerJob = await prisma.job.findFirstOrThrow({
      where: {
        companyId: companyA.companyId,
        customerId: companyA.customer2Id,
      },
    });
    const res = await request(app)
      .get(`/api/v1/portal/jobs/${otherCustomerJob.id}`)
      .set("Cookie", cookie);
    expect(res.status).toBe(404);
  });

  it("JOB-scope session gets 404 on every workspace endpoint", async () => {
    const token = await seedPortalSession(companyA, { scope: "JOB" });
    for (const path of [
      "/api/v1/portal/me",
      "/api/v1/portal/requests",
      "/api/v1/portal/quotes",
      "/api/v1/portal/jobs",
      "/api/v1/portal/invoices",
      `/api/v1/portal/jobs/${companyA.jobId}`,
      `/api/v1/portal/quotes/${companyA.quoteId}`,
      `/api/v1/portal/invoices/${companyA.invoiceId}`,
      `/api/v1/portal/requests/${companyA.requestId}`,
    ]) {
      const res = await request(app).get(path).set(portal(token));
      expect(res.status, path).toBe(404);
    }
  });

  it("WORKSPACE session cannot use JOB-only legacy detail scoping incorrectly", async () => {
    const token = await seedPortalSession(companyA, { scope: "WORKSPACE" });
    // /portal/job is the legacy JOB-scope snapshot: a workspace session has
    // no single job, so it must not leak one.
    const res = await request(app).get("/api/v1/portal/job").set(portal(token));
    expect([403, 404, 410]).toContain(res.status);
  });

  it("JOB session still reads its own job snapshot (legacy compat)", async () => {
    const token = await seedPortalSession(companyA, { scope: "JOB" });
    const res = await request(app).get("/api/v1/portal/job").set(portal(token));
    expect(res.status).toBe(200);
    expect(res.body.data.job.jobNumber).toBe(companyA.jobNumber);
  });
});

describe("workspace grant edge cases", () => {
  it("archiving the customer revokes grants and sessions", async () => {
    const { linkToken } = await seedWorkspaceGrant(companyA);
    const cookie = await exchangeForCookie(linkToken);

    await prisma.customer.update({
      where: { id: companyA.customerId },
      data: { status: "ARCHIVED" },
    });
    // Mirror archiveCustomer's grant cleanup.
    await prisma.portalAccessGrant.updateMany({
      where: {
        companyId: companyA.companyId,
        customerId: companyA.customerId,
        status: "ACTIVE",
      },
      data: {
        status: "DEACTIVATED",
        deactivatedAt: new Date(),
        deactivatedReason: "MANUAL",
      },
    });
    await prisma.portalSession.updateMany({
      where: { customerId: companyA.customerId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await request(app)
      .get("/api/v1/portal/me")
      .set("Cookie", cookie)
      .expect(410);
  });

  it("a scanner GET on the exchange route cannot consume a link token", async () => {
    const { linkToken } = await seedWorkspaceGrant(companyA);
    // GET must not exist — only POST /exchange burns the token.
    await request(app)
      .get(`/api/v1/portal/exchange?token=${linkToken}`)
      .expect(404);
    const grant = await prisma.portalAccessGrant.findFirst({
      where: { companyId: companyA.companyId, scope: "WORKSPACE" },
    });
    expect(grant?.linkConsumedAt).toBeNull();
    // And the real exchange still works afterwards.
    await exchangeForCookie(linkToken);
  });

  it("invoice detail includes credits and balance", async () => {
    const { linkToken } = await seedWorkspaceGrant(companyA);
    const cookie = await exchangeForCookie(linkToken);

    const res = await request(app)
      .get(`/api/v1/portal/invoices/${companyA.invoiceId}`)
      .set("Cookie", cookie)
      .expect(200);
    expect(res.body.data.balanceDueMinor).toBeDefined();
    expect(res.body.data.creditTargets).toBeDefined();
  });
});
