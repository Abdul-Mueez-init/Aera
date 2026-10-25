import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/common/auth/password.js";
import {
  createAccessToken,
  hashRefreshToken,
} from "../src/common/auth/tokens.js";
import { prisma } from "../src/db/prisma.js";
import { closePortalIfDone } from "../src/modules/portal/portal.grants.js";
import { runPortalSweep } from "../src/modules/portal/portal-sweep.service.js";
import { generateToken, hashToken } from "../src/modules/portal/portal.tokens.js";

const app = buildApp();

let companyId: string;
let customerId: string;
let serviceAddressId: string;
let ownerAuth: { Authorization: string };
let ownerId: string;

function suffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

async function createOwnerAuth(targetCompanyId: string) {
  const user = await prisma.user.create({
    data: {
      email: `owner-${suffix()}@example.com`,
      passwordHash: await hashPassword("TestPassword123!"),
      firstName: "Olivia",
      lastName: "Owner",
      phone: "+15550001111",
    },
  });
  await prisma.companyMember.create({
    data: {
      companyId: targetCompanyId,
      userId: user.id,
      role: "OWNER",
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
    role: "OWNER",
  });
  ownerId = user.id;
  return { Authorization: `Bearer ${accessToken}` };
}

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
    prisma.refreshSession.deleteMany(),
    prisma.companyMember.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.user.deleteMany(),
    prisma.company.deleteMany(),
  ]);

  const company = await prisma.company.create({
    data: {
      name: "Lifecycle HVAC",
      slug: `lifecycle-${suffix()}`,
      phone: "+15559998888",
    },
  });
  companyId = company.id;
  ownerAuth = await createOwnerAuth(companyId);

  const customer = await prisma.customer.create({
    data: {
      companyId,
      firstName: "Casey",
      lastName: "Customer",
      email: "casey@example.com",
      phone: "+15551234567",
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
  serviceAddressId = address.id;
});

async function seedJob(overrides: Record<string, unknown> = {}) {
  return prisma.job.create({
    data: {
      companyId,
      customerId,
      serviceAddressId,
      jobNumber: Math.floor(Math.random() * 900_000) + 1000,
      serviceType: "REPAIR",
      problemDescription: "Lifecycle test job",
      status: "SCHEDULED",
      handshakeVersion: 1,
      ...overrides,
    },
  });
}

async function seedGrant(
  jobId: string,
  overrides: Record<string, unknown> = {},
) {
  const linkToken = generateToken();
  const grant = await prisma.portalAccessGrant.create({
    data: {
      companyId,
      customerId,
      jobId,
      issuedBy: ownerId,
      linkTokenHash: hashToken(linkToken),
      linkExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: "ACTIVE",
      ...overrides,
    },
  });
  return { grant, linkToken };
}

async function exchangeForCookie(linkToken: string) {
  const res = await request(app)
    .post("/api/v1/portal/exchange")
    .set("x-aera-portal", "1")
    .send({ token: linkToken });
  expect(res.status).toBe(200);
  const cookie = res.headers["set-cookie"]?.[0]?.split(";")[0];
  expect(cookie).toBeDefined();
  return cookie as string;
}

async function seedInvoice(
  jobId: string,
  status: "ISSUED" | "PAID",
  overrides: Record<string, unknown> = {},
) {
  return prisma.invoice.create({
    data: {
      companyId,
      customerId,
      jobId,
      invoiceNumber: `INV-${Math.floor(Math.random() * 900_000) + 1000}`,
      currency: "USD",
      status,
      subtotalMinor: 10000n,
      taxMinor: 0n,
      totalMinor: 10000n,
      amountPaidMinor: status === "PAID" ? 10000n : 0n,
      balanceDueMinor: status === "PAID" ? 0n : 10000n,
      ...overrides,
    },
  });
}

describe("Portal lifecycle — auto-close and sweep", () => {
  it("completing job with unpaid invoice keeps portal active", async () => {
    const job = await seedJob({ status: "COMPLETED" });
    const { grant } = await seedGrant(job.id);
    await seedInvoice(job.id, "ISSUED");

    await closePortalIfDone(job.id);

    const after = await prisma.portalAccessGrant.findUnique({
      where: { id: grant.id },
    });
    expect(after?.status).toBe("ACTIVE");
  });

  it("portal auto-closes when job completed + invoice paid + review submitted", async () => {
    const job = await seedJob({ status: "COMPLETED" });
    const { grant, linkToken } = await seedGrant(job.id);
    const cookie = await exchangeForCookie(linkToken);
    await seedInvoice(job.id, "PAID");

    // No review yet: still open.
    await closePortalIfDone(job.id);
    let after = await prisma.portalAccessGrant.findUnique({
      where: { id: grant.id },
    });
    expect(after?.status).toBe("ACTIVE");

    const review = await request(app)
      .post("/api/v1/portal/reviews")
      .set("Cookie", cookie)
      .set("x-aera-portal", "1")
      .send({ rating: 5, comment: "Great work" });
    expect(review.status).toBe(201);

    after = await prisma.portalAccessGrant.findUnique({
      where: { id: grant.id },
    });
    expect(after?.status).toBe("DEACTIVATED");
    expect(after?.deactivatedReason).toBe("AUTO_COMPLETED");

    const session = await prisma.portalSession.findFirst({
      where: { grantId: grant.id },
    });
    expect(session?.revokedAt).not.toBeNull();
  });

  it("portal auto-closes on job cancel", async () => {
    const job = await seedJob({ status: "SCHEDULED" });
    const { grant, linkToken } = await seedGrant(job.id);
    await exchangeForCookie(linkToken);

    const cancel = await request(app)
      .post(`/api/v1/jobs/${job.id}/status`)
      .set(ownerAuth)
      .send({ status: "CANCELLED" });
    expect(cancel.status).toBe(200);

    const after = await prisma.portalAccessGrant.findUnique({
      where: { id: grant.id },
    });
    expect(after?.status).toBe("DEACTIVATED");
    expect(after?.deactivatedReason).toBe("AUTO_CANCELLED");
  });

  it("sweep closes completed jobs after PORTAL_POST_COMPLETION_MAX_DAYS", async () => {
    const old = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    const job = await seedJob({ status: "COMPLETED", completedAt: old });
    const { grant } = await seedGrant(job.id);

    const result = await runPortalSweep(new Date());
    expect(result.completedJobsClosed).toBe(1);

    const after = await prisma.portalAccessGrant.findUnique({
      where: { id: grant.id },
    });
    expect(after?.status).toBe("DEACTIVATED");
    expect(after?.deactivatedReason).toBe("AUTO_MAX_AGE");
  });

  it("sweep keeps portal open for old completed job with unpaid invoice", async () => {
    const old = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    const job = await seedJob({ status: "COMPLETED", completedAt: old });
    const { grant } = await seedGrant(job.id);
    await seedInvoice(job.id, "ISSUED");

    const result = await runPortalSweep(new Date());
    expect(result.completedJobsClosed).toBe(0);

    const after = await prisma.portalAccessGrant.findUnique({
      where: { id: grant.id },
    });
    expect(after?.status).toBe("ACTIVE");
  });

  it("sweep closes never-opened links after TTL", async () => {
    const job = await seedJob({ status: "SCHEDULED" });
    const { grant } = await seedGrant(job.id, {
      linkExpiresAt: new Date(Date.now() - 60 * 1000),
    });

    const result = await runPortalSweep(new Date());
    expect(result.neverOpenedLinksClosed).toBe(1);

    const after = await prisma.portalAccessGrant.findUnique({
      where: { id: grant.id },
    });
    expect(after?.status).toBe("DEACTIVATED");
    expect(after?.deactivatedReason).toBe("AUTO_LINK_UNUSED");
  });

  it("deactivated session returns 410 with company + owner/dispatcher contacts", async () => {
    const job = await seedJob({ status: "SCHEDULED" });
    const { linkToken } = await seedGrant(job.id);
    const cookie = await exchangeForCookie(linkToken);

    await request(app)
      .post(`/api/v1/jobs/${job.id}/portal-access/deactivate`)
      .set(ownerAuth)
      .send({});
    const probe = await request(app)
      .get("/api/v1/portal/session")
      .set("Cookie", cookie);
    expect(probe.status).toBe(410);
    expect(probe.body.error.code).toBe("PORTAL_ACCESS_DEACTIVATED");
    expect(probe.body.data.state).toBe("DEACTIVATED");
    expect(probe.body.data.company.name).toBe("Lifecycle HVAC");
    expect(probe.body.data.contacts.length).toBeGreaterThan(0);
    expect(probe.body.data.contacts[0].role).toBe("OWNER");
  });

  it("deactivated link exchange returns 410 with contacts", async () => {
    const job = await seedJob({ status: "SCHEDULED" });
    const { linkToken } = await seedGrant(job.id);

    await request(app)
      .post(`/api/v1/jobs/${job.id}/portal-access/deactivate`)
      .set(ownerAuth)
      .send({});

    const res = await request(app)
      .post("/api/v1/portal/exchange")
      .set("x-aera-portal", "1")
      .send({ token: linkToken });
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe("PORTAL_ACCESS_DEACTIVATED");
    expect(res.body.data.company.name).toBe("Lifecycle HVAC");
    expect(res.body.data.contacts.length).toBeGreaterThan(0);
  });

  it("manual deactivate revokes sessions immediately", async () => {
    const job = await seedJob({ status: "SCHEDULED" });
    const { grant, linkToken } = await seedGrant(job.id);
    const cookie = await exchangeForCookie(linkToken);

    const before = await request(app)
      .get("/api/v1/portal/job")
      .set("Cookie", cookie);
    expect(before.status).toBe(200);

    const deact = await request(app)
      .post(`/api/v1/jobs/${job.id}/portal-access/deactivate`)
      .set(ownerAuth)
      .send({});
    expect(deact.status).toBe(200);

    const session = await prisma.portalSession.findFirst({
      where: { grantId: grant.id },
    });
    expect(session?.revokedAt).not.toBeNull();

    const after = await request(app)
      .get("/api/v1/portal/job")
      .set("Cookie", cookie);
    expect(after.status).toBe(410);
  });

  it("reissue kills old link and sessions and creates a new ACTIVE grant", async () => {
    const job = await seedJob({ status: "SCHEDULED" });
    const { grant, linkToken } = await seedGrant(job.id);
    const cookie = await exchangeForCookie(linkToken);

    const reissue = await request(app)
      .post(`/api/v1/jobs/${job.id}/portal-access/reissue`)
      .set(ownerAuth)
      .send({ channels: ["SMS", "EMAIL"] });
    expect(reissue.status).toBe(201);
    const newLink = reissue.body.data.link as string;
    expect(newLink).toContain("#t=");

    const oldGrant = await prisma.portalAccessGrant.findUnique({
      where: { id: grant.id },
    });
    expect(oldGrant?.status).toBe("DEACTIVATED");
    expect(oldGrant?.deactivatedReason).toBe("REISSUED");

    const oldSessionProbe = await request(app)
      .get("/api/v1/portal/job")
      .set("Cookie", cookie);
    expect(oldSessionProbe.status).toBe(410);

    const active = await prisma.portalAccessGrant.findMany({
      where: { jobId: job.id, status: "ACTIVE" },
    });
    expect(active.length).toBe(1);
    expect(active[0].id).not.toBe(grant.id);

    const newToken = newLink.split("#t=")[1];
    const exchange = await request(app)
      .post("/api/v1/portal/exchange")
      .set("x-aera-portal", "1")
      .send({ token: newToken });
    expect(exchange.status).toBe(200);
  });

  it("only one ACTIVE grant per job", async () => {
    const job = await seedJob({ status: "SCHEDULED" });

    const first = await request(app)
      .post(`/api/v1/jobs/${job.id}/portal-access`)
      .set(ownerAuth)
      .send({ channels: ["SMS"] });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post(`/api/v1/jobs/${job.id}/portal-access`)
      .set(ownerAuth)
      .send({ channels: ["SMS"] });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("PORTAL_ACCESS_ALREADY_ACTIVE");

    // Concurrent issuance: exactly one wins.
    const job2 = await seedJob({ status: "SCHEDULED" });
    const results = await Promise.all([
      request(app)
        .post(`/api/v1/jobs/${job2.id}/portal-access`)
        .set(ownerAuth)
        .send({ channels: ["SMS"] }),
      request(app)
        .post(`/api/v1/jobs/${job2.id}/portal-access`)
        .set(ownerAuth)
        .send({ channels: ["SMS"] }),
      request(app)
        .post(`/api/v1/jobs/${job2.id}/portal-access`)
        .set(ownerAuth)
        .send({ channels: ["SMS"] }),
    ]);
    const created = results.filter((r) => r.status === 201);
    expect(created.length).toBe(1);
    for (const loser of results.filter((r) => r.status !== 201)) {
      expect(loser.status).toBe(409);
    }
    const activeCount = await prisma.portalAccessGrant.count({
      where: { jobId: job2.id, status: "ACTIVE" },
    });
    expect(activeCount).toBe(1);
  });
});
