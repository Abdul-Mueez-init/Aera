/**
 * Phase 5 — BOOKING_ENABLED=false contract. The staff router is not
 * mounted and every portal booking endpoint 404s; other portal routes
 * are unaffected.
 */
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

process.env.REQUESTS_ENABLED = "true";
process.env.WORKSPACE_PORTAL_ENABLED = "true";
process.env.PORTAL_REQUESTS_ENABLED = "true";
// BOOKING_ENABLED intentionally unset (default false).

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

describe("booking disabled", () => {
  it("staff booking routes are not mounted", async () => {
    const res = await request(app).get("/api/v1/booking/config");
    expect(res.status).toBe(404);
  });

  it("portal booking endpoints 404 even with a workspace session", async () => {
    const company = await prisma.company.create({
      data: { name: `NoBook ${Date.now()}`, slug: `nobook-${Date.now()}` },
    });
    const user = await prisma.user.create({
      data: {
        email: `nobook-${Date.now()}@example.com`,
        passwordHash: "x",
        firstName: "No",
        lastName: "Book",
      },
    });
    const customer = await prisma.customer.create({
      data: {
        companyId: company.id,
        firstName: "Casey",
        lastName: "Customer",
        email: `nc-${Date.now()}@example.com`,
      },
    });
    await prisma.companyMember.create({
      data: {
        userId: user.id,
        companyId: company.id,
        role: "OWNER",
        status: "ACTIVE",
      },
    });
    const grant = await prisma.portalAccessGrant.create({
      data: {
        companyId: company.id,
        customerId: customer.id,
        scope: "WORKSPACE",
        issuedBy: user.id,
        linkTokenHash: hashToken(generateToken()),
        linkExpiresAt: new Date(Date.now() + 86_400_000),
        linkConsumedAt: new Date(),
        status: "ACTIVE",
      },
    });
    const token = generateToken();
    await prisma.portalSession.create({
      data: {
        grantId: grant.id,
        companyId: company.id,
        customerId: customer.id,
        scope: "WORKSPACE",
        sessionTokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 86_400_000),
        lastSeenAt: new Date(),
      },
    });
    const headers = {
      Authorization: `Bearer ${token}`,
      "X-Aera-Portal": "1",
    };

    for (const path of [
      "/api/v1/portal/booking/proposals",
      "/api/v1/portal/booking/availability?startsAt=2026-01-01T00:00:00Z&endsAt=2026-01-02T00:00:00Z&durationMinutes=60",
    ]) {
      const res = await request(app).get(path).set(headers);
      expect(res.status).toBe(404);
    }
    const post = await request(app)
      .post("/api/v1/portal/booking/holds")
      .set(headers)
      .send({});
    expect(post.status).toBe(404);

    await prisma.portalSession.deleteMany({
      where: { companyId: company.id },
    });
    await prisma.portalAccessGrant.deleteMany({
      where: { companyId: company.id },
    });
    // Clean dependents first — other suites' rows may share this DB.
    await prisma.serviceRequestMessage.deleteMany({
      where: { companyId: company.id },
    });
    await prisma.serviceRequestAttachment.deleteMany({
      where: { companyId: company.id },
    });
    await prisma.serviceRequestUpload.deleteMany({
      where: { companyId: company.id },
    });
    await prisma.serviceRequestEvent.deleteMany({
      where: { companyId: company.id },
    });
    await prisma.serviceRequest.deleteMany({
      where: { companyId: company.id },
    });
    await prisma.serviceAddress.deleteMany({
      where: { companyId: company.id },
    });
    await prisma.customer.deleteMany({ where: { companyId: company.id } });
    await prisma.companyMember.deleteMany({
      where: { companyId: company.id },
    });
    await prisma.user.deleteMany({ where: { id: user.id } });
    await prisma.company.deleteMany({ where: { id: company.id } });
  });
});
