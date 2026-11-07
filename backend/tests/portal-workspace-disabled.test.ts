/**
 * Phase 2 flag contract: with WORKSPACE_PORTAL_ENABLED unset (default false)
 * the workspace surface is dark — portal workspace routes and the customer
 * portal-access staff endpoints answer 404, while legacy JOB-scope portal
 * behavior is unchanged.
 *
 * The flag must stay unset here: env.ts parses process.env once at module
 * load, so all src imports are dynamic inside beforeAll.
 */
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

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
  delete process.env.WORKSPACE_PORTAL_ENABLED;
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

let companyId: string;
let customerId: string;
let jobId: string;
let ownerAuth: { Authorization: string };
let ownerUserId: string;

beforeEach(async () => {
  await prisma.$transaction([
    prisma.portalSession.deleteMany(),
    prisma.portalAccessGrant.deleteMany(),
    prisma.portalAuditEvent.deleteMany(),
    prisma.customerReview.deleteMany(),
    prisma.quote.deleteMany(),
    prisma.invoiceItem.deleteMany(),
    prisma.invoiceCreditApplication.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.jobStatusHistory.deleteMany(),
    prisma.job.deleteMany(),
    prisma.refreshSession.deleteMany(),
    prisma.companyMember.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.serviceAddress.deleteMany(),
    prisma.user.deleteMany(),
    prisma.company.deleteMany(),
  ]);

  const company = await prisma.company.create({
    data: {
      name: "Flag Off HVAC",
      slug: `flagoff-${suffix()}`,
      phone: "+15559990000",
    },
  });
  companyId = company.id;

  const user = await prisma.user.create({
    data: {
      email: `owner-${suffix()}@example.com`,
      passwordHash: await hashPassword("TestPassword123!"),
      firstName: "Olivia",
      lastName: "Owner",
      phone: `+1555${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`,
    },
  });
  ownerUserId = user.id;
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
  ownerAuth = { Authorization: `Bearer ${accessToken}` };

  const customer = await prisma.customer.create({
    data: {
      companyId,
      firstName: "Casey",
      lastName: "Customer",
      email: `casey-${suffix()}@example.com`,
      phone: "+15551230000",
    },
  });
  customerId = customer.id;
  const address = await prisma.serviceAddress.create({
    data: {
      companyId,
      customerId,
      label: "Home",
      line1: "1 Main St",
      city: "Austin",
      region: "TX",
      postalCode: "78701",
      countryCode: "US",
    },
  });
  const job = await prisma.job.create({
    data: {
      companyId,
      customerId,
      serviceAddressId: address.id,
      jobNumber: Math.floor(Math.random() * 900_000) + 1000,
      serviceType: "REPAIR",
      problemDescription: "Flag test job",
      status: "SCHEDULED",
      handshakeVersion: 1,
    },
  });
  jobId = job.id;
});

describe("WORKSPACE_PORTAL_ENABLED=false contract", () => {
  it("staff portal-access endpoints are 404 for every verb", async () => {
    await request(app)
      .post(`/api/v1/customers/${customerId}/portal-access`)
      .set(ownerAuth)
      .send({ channels: [] })
      .expect(404);
    await request(app)
      .post(`/api/v1/customers/${customerId}/portal-access/reissue`)
      .set(ownerAuth)
      .send({ channels: [] })
      .expect(404);
    await request(app)
      .post(`/api/v1/customers/${customerId}/portal-access/revoke`)
      .set(ownerAuth)
      .expect(404);
    await request(app)
      .get(`/api/v1/customers/${customerId}/portal-access`)
      .set(ownerAuth)
      .expect(404);
  });

  it("workspace read endpoints are 404 even with a valid WORKSPACE session", async () => {
    // Seed a workspace grant + session directly (bypassing the gated staff
    // endpoint) to prove the read surface itself is dark.
    const linkToken = generateToken();
    const grant = await prisma.portalAccessGrant.create({
      data: {
        companyId,
        customerId,
        scope: "WORKSPACE",
        issuedBy: ownerUserId,
        linkTokenHash: hashToken(linkToken),
        linkExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: "ACTIVE",
      },
    });
    const sessionToken = generateToken();
    await prisma.portalSession.create({
      data: {
        grantId: grant.id,
        companyId,
        customerId,
        jobId: null,
        scope: "WORKSPACE",
        sessionTokenHash: hashToken(sessionToken),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        lastSeenAt: new Date(),
      },
    });

    for (const path of [
      "/api/v1/portal/me",
      "/api/v1/portal/requests",
      "/api/v1/portal/quotes",
      "/api/v1/portal/jobs",
      "/api/v1/portal/invoices",
      `/api/v1/portal/jobs/${jobId}`,
    ]) {
      const res = await request(app)
        .get(path)
        .set({
          Authorization: `Bearer ${sessionToken}`,
          "X-Aera-Portal": "1",
        });
      expect(res.status, path).toBe(404);
    }
  });

  it("legacy JOB-scope portal flow is unaffected", async () => {
    const linkToken = generateToken();
    await prisma.portalAccessGrant.create({
      data: {
        companyId,
        customerId,
        jobId,
        scope: "JOB",
        issuedBy: ownerUserId,
        linkTokenHash: hashToken(linkToken),
        linkExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: "ACTIVE",
      },
    });

    const exchange = await request(app)
      .post("/api/v1/portal/exchange")
      .set("X-Aera-Portal", "1")
      .send({ token: linkToken });
    expect(exchange.status).toBe(200);
    const cookie = exchange.headers["set-cookie"]?.[0]?.split(";")[0];
    expect(cookie).toBeDefined();

    const job = await request(app)
      .get("/api/v1/portal/job")
      .set("Cookie", cookie as string);
    expect(job.status).toBe(200);
    expect(job.body.data.job).toBeDefined();
  });
});
