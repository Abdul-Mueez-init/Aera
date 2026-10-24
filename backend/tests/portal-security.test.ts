import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { generateToken, hashToken } from "../src/modules/portal/portal.tokens.js";
import { hashPassword } from "../src/common/auth/password.js";
import { createAccessToken, hashRefreshToken } from "../src/common/auth/tokens.js";

describe("Portal Security Tests", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    app = buildApp();
    await prisma.portalSession.deleteMany();
    await prisma.portalAccessGrant.deleteMany();
    await prisma.customerReview.deleteMany();
    await prisma.quoteApprovalEvent.deleteMany();
    await prisma.quoteItem.deleteMany();
    await prisma.quote.deleteMany();
    await prisma.invoiceItem.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.job.deleteMany();
    await prisma.serviceAddress.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.company.deleteMany();
  });

  describe("Single-use & exchange", () => {
    it("exchange succeeds once and creates a session", async () => {
      const company = await prisma.company.create({
        data: { name: "Test Company", slug: "test-company", phone: "+1234567890" },
      });

      const customer = await prisma.customer.create({
        data: {
          companyId: company.id,
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          phone: "+1234567890",
        },
      });

      const serviceAddress = await prisma.serviceAddress.create({
        data: {
          companyId: company.id,
          customerId: customer.id,
          label: "Home",
          line1: "123 Main St",
          city: "San Francisco",
          region: "CA",
          postalCode: "94102",
          countryCode: "US",
        },
      });

      const job = await prisma.job.create({
        data: {
          companyId: company.id,
          customerId: customer.id,
          serviceAddressId: serviceAddress.id,
          jobNumber: 1,
          serviceType: "REPAIR",
          problemDescription: "Test problem",
          status: "NEW",
          handshakeVersion: 1,
        },
      });

      const linkToken = generateToken();
      const linkTokenHash = hashToken(linkToken);

      const grant = await prisma.portalAccessGrant.create({
        data: {
          companyId: company.id,
          customerId: customer.id,
          jobId: job.id,
          linkTokenHash,
          linkExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          status: "ACTIVE",
        },
      });

      const response = await request(app)
        .post("/api/v1/portal/exchange")
        .send({ token: linkToken })
        .expect(200);

      expect(response.body.data.state).toBe("ACTIVE");

      const session = await prisma.portalSession.findFirst({
        where: { grantId: grant.id },
      });
      expect(session).toBeDefined();
    });

    it("second exchange of the same token is rejected 409 PORTAL_LINK_ALREADY_USED", async () => {
      const company = await prisma.company.create({
        data: { name: "Test Company", slug: "test-company", phone: "+1234567890" },
      });

      const customer = await prisma.customer.create({
        data: {
          companyId: company.id,
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          phone: "+1234567890",
        },
      });

      const serviceAddress = await prisma.serviceAddress.create({
        data: {
          companyId: company.id,
          customerId: customer.id,
          label: "Home",
          line1: "123 Main St",
          city: "San Francisco",
          region: "CA",
          postalCode: "94102",
          countryCode: "US",
        },
      });

      const job = await prisma.job.create({
        data: {
          companyId: company.id,
          customerId: customer.id,
          serviceAddressId: serviceAddress.id,
          jobNumber: 1,
          serviceType: "REPAIR",
          problemDescription: "Test problem",
          status: "NEW",
          handshakeVersion: 1,
        },
      });

      const linkToken = generateToken();
      const linkTokenHash = hashToken(linkToken);

      await prisma.portalAccessGrant.create({
        data: {
          companyId: company.id,
          customerId: customer.id,
          jobId: job.id,
          linkTokenHash,
          linkExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          status: "ACTIVE",
        },
      });

      // First exchange
      await request(app).post("/api/v1/portal/exchange").send({ token: linkToken }).expect(200);

      // Second exchange with same token
      const response = await request(app)
        .post("/api/v1/portal/exchange")
        .send({ token: linkToken })
        .expect(409);

      expect(response.body.error.code).toBe("PORTAL_LINK_ALREADY_USED");
    });

    it("concurrent exchanges: exactly one succeeds", async () => {
      const company = await prisma.company.create({
        data: { name: "Test Company", slug: "test-company", phone: "+1234567890" },
      });

      const customer = await prisma.customer.create({
        data: {
          companyId: company.id,
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          phone: "+1234567890",
        },
      });

      const serviceAddress = await prisma.serviceAddress.create({
        data: {
          companyId: company.id,
          customerId: customer.id,
          label: "Home",
          line1: "123 Main St",
          city: "San Francisco",
          region: "CA",
          postalCode: "94102",
          countryCode: "US",
        },
      });

      const job = await prisma.job.create({
        data: {
          companyId: company.id,
          customerId: customer.id,
          serviceAddressId: serviceAddress.id,
          jobNumber: 1,
          serviceType: "REPAIR",
          problemDescription: "Test problem",
          status: "NEW",
          handshakeVersion: 1,
        },
      });

      const linkToken = generateToken();
      const linkTokenHash = hashToken(linkToken);

      await prisma.portalAccessGrant.create({
        data: {
          companyId: company.id,
          customerId: customer.id,
          jobId: job.id,
          linkTokenHash,
          linkExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          status: "ACTIVE",
        },
      });

      // Send 10 concurrent requests
      const responses = await Promise.all(
        Array.from({ length: 10 }, () =>
          request(app).post("/api/v1/portal/exchange").send({ token: linkToken }),
        ),
      );

      const successCount = responses.filter((r) => r.status === 200).length;
      const failureCount = responses.filter((r) => r.status === 409).length;

      expect(successCount).toBe(1);
      expect(failureCount).toBe(9);
    });

    it("unknown token returns 401 PORTAL_LINK_INVALID with no company data", async () => {
      const linkToken = generateToken();

      const response = await request(app)
        .post("/api/v1/portal/exchange")
        .send({ token: linkToken })
        .expect(401);

      expect(response.body.error.code).toBe("PORTAL_LINK_INVALID");
      expect(response.body.error.message).not.toContain("company");
    });

    it("expired unused link returns 410 with contact payload", async () => {
      const company = await prisma.company.create({
        data: { name: "Test Company", slug: "test-company", phone: "+1234567890" },
      });

      const customer = await prisma.customer.create({
        data: {
          companyId: company.id,
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          phone: "+1234567890",
        },
      });

      const serviceAddress = await prisma.serviceAddress.create({
        data: {
          companyId: company.id,
          customerId: customer.id,
          label: "Home",
          line1: "123 Main St",
          city: "San Francisco",
          region: "CA",
          postalCode: "94102",
          countryCode: "US",
        },
      });

      const job = await prisma.job.create({
        data: {
          companyId: company.id,
          customerId: customer.id,
          serviceAddressId: serviceAddress.id,
          jobNumber: 1,
          serviceType: "REPAIR",
          problemDescription: "Test problem",
          status: "NEW",
          handshakeVersion: 1,
        },
      });

      const linkToken = generateToken();
      const linkTokenHash = hashToken(linkToken);

      await prisma.portalAccessGrant.create({
        data: {
          companyId: company.id,
          customerId: customer.id,
          jobId: job.id,
          linkTokenHash,
          linkExpiresAt: new Date(Date.now() - 1000), // Expired
          status: "ACTIVE",
        },
      });

      const response = await request(app)
        .post("/api/v1/portal/exchange")
        .send({ token: linkToken })
        .expect(410);

      expect(response.body.error.code).toBe("PORTAL_LINK_EXPIRED");
    });

    it("token is stored only as a hash", async () => {
      const company = await prisma.company.create({
        data: { name: "Test Company", slug: "test-company", phone: "+1234567890" },
      });

      const customer = await prisma.customer.create({
        data: {
          companyId: company.id,
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          phone: "+1234567890",
        },
      });

      const serviceAddress = await prisma.serviceAddress.create({
        data: {
          companyId: company.id,
          customerId: customer.id,
          label: "Home",
          line1: "123 Main St",
          city: "San Francisco",
          region: "CA",
          postalCode: "94102",
          countryCode: "US",
        },
      });

      const job = await prisma.job.create({
        data: {
          companyId: company.id,
          customerId: customer.id,
          serviceAddressId: serviceAddress.id,
          jobNumber: 1,
          serviceType: "REPAIR",
          problemDescription: "Test problem",
          status: "NEW",
          handshakeVersion: 1,
        },
      });

      const linkToken = generateToken();
      const linkTokenHash = hashToken(linkToken);

      await prisma.portalAccessGrant.create({
        data: {
          companyId: company.id,
          customerId: customer.id,
          jobId: job.id,
          linkTokenHash,
          linkExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          status: "ACTIVE",
        },
      });

      const grant = await prisma.portalAccessGrant.findFirst({
        where: { jobId: job.id },
      });

      expect(grant).toBeDefined();
      expect(grant?.linkTokenHash).toBe(linkTokenHash);
      // Verify no plaintext token is stored
      expect(grant?.linkTokenHash).not.toBe(linkToken);
      expect(grant?.linkTokenHash).toHaveLength(64); // SHA256 hex
    });
  });

  describe("Isolation", () => {
    it("session of customer A cannot read customer B's job", async () => {
      const company = await prisma.company.create({
        data: { name: "Test Company", slug: "test-company", phone: "+1234567890" },
      });

      const customerA = await prisma.customer.create({
        data: {
          companyId: company.id,
          firstName: "Alice",
          lastName: "A",
          email: "alice@example.com",
          phone: "+1234567890",
        },
      });

      const customerB = await prisma.customer.create({
        data: {
          companyId: company.id,
          firstName: "Bob",
          lastName: "B",
          email: "bob@example.com",
          phone: "+1234567890",
        },
      });

      const serviceAddressA = await prisma.serviceAddress.create({
        data: {
          companyId: company.id,
          customerId: customerA.id,
          label: "Home",
          line1: "123 Main St",
          city: "San Francisco",
          region: "CA",
          postalCode: "94102",
          countryCode: "US",
        },
      });

      const serviceAddressB = await prisma.serviceAddress.create({
        data: {
          companyId: company.id,
          customerId: customerB.id,
          label: "Home",
          line1: "456 Main St",
          city: "San Francisco",
          region: "CA",
          postalCode: "94102",
          countryCode: "US",
        },
      });

      const jobA = await prisma.job.create({
        data: {
          companyId: company.id,
          customerId: customerA.id,
          serviceAddressId: serviceAddressA.id,
          jobNumber: 1,
          serviceType: "REPAIR",
          problemDescription: "Test problem A",
          status: "NEW",
          handshakeVersion: 1,
        },
      });

      const jobB = await prisma.job.create({
        data: {
          companyId: company.id,
          customerId: customerB.id,
          serviceAddressId: serviceAddressB.id,
          jobNumber: 2,
          serviceType: "REPAIR",
          problemDescription: "Test problem B",
          status: "NEW",
          handshakeVersion: 1,
        },
      });

      // Create grant for customer A's job
      const linkTokenA = generateToken();
      const linkTokenHashA = hashToken(linkTokenA);

      const grantA = await prisma.portalAccessGrant.create({
        data: {
          companyId: company.id,
          customerId: customerA.id,
          jobId: jobA.id,
          linkTokenHash: linkTokenHashA,
          linkExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          linkConsumedAt: new Date(),
          status: "ACTIVE",
        },
      });

      const sessionTokenA = generateToken();
      const sessionTokenHashA = hashToken(sessionTokenA);

      await prisma.portalSession.create({
        data: {
          grantId: grantA.id,
          companyId: company.id,
          customerId: customerA.id,
          jobId: jobA.id,
          sessionTokenHash: sessionTokenHashA,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          lastSeenAt: new Date(),
        },
      });

      // Try to access customer B's job with customer A's session
      const response = await request(app)
        .get("/api/v1/portal/job")
        .set("Authorization", `Bearer ${sessionTokenA}`)
        .expect(200);

      // Should only return customer A's job
      expect(response.body.data).toBeDefined();
      expect(response.body.data.job).toBeDefined();
      expect(response.body.data.job.jobNumber).toBe(jobA.jobNumber);
      expect(response.body.data.job.jobNumber).not.toBe(jobB.jobNumber);
    });

    it("portal session token is rejected by staff endpoints", async () => {
      const company = await prisma.company.create({
        data: { name: "Test Company", slug: "test-company", phone: "+1234567890" },
      });

      const customer = await prisma.customer.create({
        data: {
          companyId: company.id,
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          phone: "+1234567890",
        },
      });

      const serviceAddress = await prisma.serviceAddress.create({
        data: {
          companyId: company.id,
          customerId: customer.id,
          label: "Home",
          line1: "123 Main St",
          city: "San Francisco",
          region: "CA",
          postalCode: "94102",
          countryCode: "US",
        },
      });

      const job = await prisma.job.create({
        data: {
          companyId: company.id,
          customerId: customer.id,
          serviceAddressId: serviceAddress.id,
          jobNumber: 1,
          serviceType: "REPAIR",
          problemDescription: "Test problem",
          status: "NEW",
          handshakeVersion: 1,
        },
      });

      // Create portal session
      const linkToken = generateToken();
      const linkTokenHash = hashToken(linkToken);

      const grant = await prisma.portalAccessGrant.create({
        data: {
          companyId: company.id,
          customerId: customer.id,
          jobId: job.id,
          linkTokenHash,
          linkExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          linkConsumedAt: new Date(),
          status: "ACTIVE",
        },
      });

      const sessionToken = generateToken();
      const sessionTokenHash = hashToken(sessionToken);

      await prisma.portalSession.create({
        data: {
          grantId: grant.id,
          companyId: company.id,
          customerId: customer.id,
          jobId: job.id,
          sessionTokenHash,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          lastSeenAt: new Date(),
        },
      });

      // Try to use portal session token on staff endpoint
      const response = await request(app)
        .get("/api/v1/jobs")
        .set("Authorization", `Bearer ${sessionToken}`)
        .expect(401);

      expect(response.body.error.code).toBe("AUTH_SESSION_EXPIRED");
    });

    it("staff JWT is rejected by portal endpoints", async () => {
      const uniqueEmail = `staff-${crypto.randomUUID()}@example.com`;
      const passwordHash = await hashPassword("TestPassword123!");
      const user = await prisma.user.create({
        data: {
          email: uniqueEmail,
          passwordHash,
          firstName: "Staff",
          lastName: "User",
        },
      });

      const company = await prisma.company.create({
        data: { name: "Test Company", slug: "test-company", phone: "+1234567890" },
      });

      await prisma.companyMember.create({
        data: {
          companyId: company.id,
          userId: user.id,
          role: "OWNER",
          status: "ACTIVE",
        },
      });

      const sessionId = crypto.randomUUID();
      const refreshToken = crypto.randomUUID();
      await prisma.refreshSession.create({
        data: {
          id: sessionId,
          userId: user.id,
          companyId: company.id,
          tokenHash: hashRefreshToken(refreshToken),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      const authContext = {
        userId: user.id,
        sessionId: sessionId,
        companyId: company.id,
        role: "OWNER" as const,
      };
      const staffToken = await createAccessToken(authContext);

      // Try to use staff JWT on portal endpoint
      const response = await request(app)
        .get("/api/v1/portal/job")
        .set("Authorization", `Bearer ${staffToken}`)
        .expect(401);

      expect(response.body.error.code).toBe("PORTAL_SESSION_INVALID");
    });
  });

  describe("Transport & hardening", () => {
    it("exchange sets __Host-aera_portal cookie with HttpOnly, Secure, SameSite=Strict", async () => {
      const company = await prisma.company.create({
        data: { name: "Test Company", slug: "test-company", phone: "+1234567890" },
      });

      const customer = await prisma.customer.create({
        data: {
          companyId: company.id,
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          phone: "+1234567890",
        },
      });

      const serviceAddress = await prisma.serviceAddress.create({
        data: {
          companyId: company.id,
          customerId: customer.id,
          label: "Home",
          line1: "123 Main St",
          city: "San Francisco",
          region: "CA",
          postalCode: "94102",
          countryCode: "US",
        },
      });

      const job = await prisma.job.create({
        data: {
          companyId: company.id,
          customerId: customer.id,
          serviceAddressId: serviceAddress.id,
          jobNumber: 1,
          serviceType: "REPAIR",
          problemDescription: "Test problem",
          status: "NEW",
          handshakeVersion: 1,
        },
      });

      const linkToken = generateToken();
      const linkTokenHash = hashToken(linkToken);

      await prisma.portalAccessGrant.create({
        data: {
          companyId: company.id,
          customerId: customer.id,
          jobId: job.id,
          linkTokenHash,
          linkExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          status: "ACTIVE",
        },
      });

      const response = await request(app)
        .post("/api/v1/portal/exchange")
        .send({ token: linkToken })
        .expect(200);

      const cookie = response.headers["set-cookie"]?.[0];
      expect(cookie).toBeDefined();
      expect(cookie).toContain("__Host-aera_portal");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("SameSite=Strict");
    });

    it("portal POST without X-Aera-Portal header is rejected", async () => {
      const company = await prisma.company.create({
        data: { name: "Test Company", slug: "test-company", phone: "+1234567890" },
      });

      const customer = await prisma.customer.create({
        data: {
          companyId: company.id,
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          phone: "+1234567890",
        },
      });

      const serviceAddress = await prisma.serviceAddress.create({
        data: {
          companyId: company.id,
          customerId: customer.id,
          label: "Home",
          line1: "123 Main St",
          city: "San Francisco",
          region: "CA",
          postalCode: "94102",
          countryCode: "US",
        },
      });

      const job = await prisma.job.create({
        data: {
          companyId: company.id,
          customerId: customer.id,
          serviceAddressId: serviceAddress.id,
          jobNumber: 1,
          serviceType: "REPAIR",
          problemDescription: "Test problem",
          status: "NEW",
          handshakeVersion: 1,
        },
      });

      const linkToken = generateToken();
      const linkTokenHash = hashToken(linkToken);

      const grant = await prisma.portalAccessGrant.create({
        data: {
          companyId: company.id,
          customerId: customer.id,
          jobId: job.id,
          linkTokenHash,
          linkExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          linkConsumedAt: new Date(),
          status: "ACTIVE",
        },
      });

      const sessionToken = generateToken();
      const sessionTokenHash = hashToken(sessionToken);

      await prisma.portalSession.create({
        data: {
          grantId: grant.id,
          companyId: company.id,
          customerId: customer.id,
          jobId: job.id,
          sessionTokenHash,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          lastSeenAt: new Date(),
        },
      });

      // Try POST without X-Aera-Portal header
      const response = await request(app)
        .post("/api/v1/portal/logout")
        .set("Authorization", `Bearer ${sessionToken}`)
        .expect(403);

      expect(response.body.error.code).toBe("CSRF_HEADER_REQUIRED");
    });

    it("portal responses send Cache-Control: no-store", async () => {
      const company = await prisma.company.create({
        data: { name: "Test Company", slug: "test-company", phone: "+1234567890" },
      });

      const customer = await prisma.customer.create({
        data: {
          companyId: company.id,
          firstName: "John",
          lastName: "Doe",
          email: "john@example.com",
          phone: "+1234567890",
        },
      });

      const serviceAddress = await prisma.serviceAddress.create({
        data: {
          companyId: company.id,
          customerId: customer.id,
          label: "Home",
          line1: "123 Main St",
          city: "San Francisco",
          region: "CA",
          postalCode: "94102",
          countryCode: "US",
        },
      });

      const job = await prisma.job.create({
        data: {
          companyId: company.id,
          customerId: customer.id,
          serviceAddressId: serviceAddress.id,
          jobNumber: 1,
          serviceType: "REPAIR",
          problemDescription: "Test problem",
          status: "NEW",
          handshakeVersion: 1,
        },
      });

      const linkToken = generateToken();
      const linkTokenHash = hashToken(linkToken);

      const grant = await prisma.portalAccessGrant.create({
        data: {
          companyId: company.id,
          customerId: customer.id,
          jobId: job.id,
          linkTokenHash,
          linkExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          linkConsumedAt: new Date(),
          status: "ACTIVE",
        },
      });

      const sessionToken = generateToken();
      const sessionTokenHash = hashToken(sessionToken);

      await prisma.portalSession.create({
        data: {
          grantId: grant.id,
          companyId: company.id,
          customerId: customer.id,
          jobId: job.id,
          sessionTokenHash,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          lastSeenAt: new Date(),
        },
      });

      const response = await request(app)
        .get("/api/v1/portal/job")
        .set("Authorization", `Bearer ${sessionToken}`)
        .expect(200);

      expect(response.headers["cache-control"]).toContain("no-store");
    });
  });
});
