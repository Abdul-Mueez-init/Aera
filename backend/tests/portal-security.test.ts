import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import {
  generateToken,
  hashToken,
} from "../src/modules/portal/portal.tokens.js";
import { hashPassword } from "../src/common/auth/password.js";
import {
  createAccessToken,
  hashRefreshToken,
} from "../src/common/auth/tokens.js";

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
        data: {
          name: "Test Company",
          slug: "test-company",
          phone: "+1234567890",
        },
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
        .set("X-Aera-Portal", "1")
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
        data: {
          name: "Test Company",
          slug: "test-company",
          phone: "+1234567890",
        },
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
      await request(app)
        .post("/api/v1/portal/exchange")
        .set("X-Aera-Portal", "1")
        .send({ token: linkToken })
        .expect(200);

      // Second exchange with same token
      const response = await request(app)
        .post("/api/v1/portal/exchange")
        .set("X-Aera-Portal", "1")
        .send({ token: linkToken })
        .expect(409);

      expect(response.body.error.code).toBe("PORTAL_LINK_ALREADY_USED");
    });

    it("concurrent exchanges: exactly one succeeds", async () => {
      const company = await prisma.company.create({
        data: {
          name: "Test Company",
          slug: "test-company",
          phone: "+1234567890",
        },
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
          request(app)
            .post("/api/v1/portal/exchange")
            .set("X-Aera-Portal", "1")
            .send({ token: linkToken }),
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
        .set("X-Aera-Portal", "1")
        .send({ token: linkToken })
        .expect(401);

      expect(response.body.error.code).toBe("PORTAL_LINK_INVALID");
      expect(response.body.error.message).not.toContain("company");
    });

    it("expired unused link returns 410 with contact payload", async () => {
      const company = await prisma.company.create({
        data: {
          name: "Test Company",
          slug: "test-company",
          phone: "+1234567890",
        },
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
        .set("X-Aera-Portal", "1")
        .send({ token: linkToken })
        .expect(410);

      expect(response.body.error.code).toBe("PORTAL_LINK_EXPIRED");
    });

    it("token is stored only as a hash", async () => {
      const company = await prisma.company.create({
        data: {
          name: "Test Company",
          slug: "test-company",
          phone: "+1234567890",
        },
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
        data: {
          name: "Test Company",
          slug: "test-company",
          phone: "+1234567890",
        },
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
        data: {
          name: "Test Company",
          slug: "test-company",
          phone: "+1234567890",
        },
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
        data: {
          name: "Test Company",
          slug: "test-company",
          phone: "+1234567890",
        },
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
        data: {
          name: "Test Company",
          slug: "test-company",
          phone: "+1234567890",
        },
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
        .set("X-Aera-Portal", "1")
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
        data: {
          name: "Test Company",
          slug: "test-company",
          phone: "+1234567890",
        },
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
        data: {
          name: "Test Company",
          slug: "test-company",
          phone: "+1234567890",
        },
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
  describe("Exchange transaction, closed-payload contacts & CSRF (R3)", () => {
    async function fixture() {
      const company = await prisma.company.create({
        data: {
          name: "Contact Co",
          slug: `contact-co-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
          phone: "+15550001111",
        },
      });
      const owner = await prisma.user.create({
        data: {
          firstName: "Olivia",
          lastName: "Owner",
          // users.phone is unique and users are not wiped between tests in
          // this file, so the number must be unique per fixture run.
          phone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
          email: `owner-${company.id}@example.com`,
        },
      });
      await prisma.companyMember.create({
        data: {
          companyId: company.id,
          userId: owner.id,
          role: "OWNER",
          status: "ACTIVE",
        },
      });
      const customer = await prisma.customer.create({
        data: {
          companyId: company.id,
          firstName: "Carl",
          lastName: "Customer",
          email: "carl@example.com",
          phone: `+1444${Math.floor(1000000 + Math.random() * 9000000)}`,
        },
      });
      const serviceAddress = await prisma.serviceAddress.create({
        data: {
          companyId: company.id,
          customerId: customer.id,
          label: "Home",
          line1: "1 Main St",
          city: "Austin",
          region: "TX",
          postalCode: "73301",
          countryCode: "US",
        },
      });
      const job = await prisma.job.create({
        data: {
          companyId: company.id,
          customerId: customer.id,
          serviceAddressId: serviceAddress.id,
          jobNumber: 7,
          serviceType: "REPAIR",
          problemDescription: "No cooling",
          status: "NEW",
          handshakeVersion: 1,
        },
      });
      const linkToken = generateToken();
      const grant = await prisma.portalAccessGrant.create({
        data: {
          companyId: company.id,
          customerId: customer.id,
          jobId: job.id,
          linkTokenHash: hashToken(linkToken),
          linkExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          status: "ACTIVE",
        },
      });
      return { company, owner, customer, job, linkToken, grant };
    }

    it("exchange rolls the burn back when session creation fails", async () => {
      const { grant, linkToken } = await fixture();

      // Force every portal_sessions insert to fail at the database level,
      // inside whatever transaction the exchange runs in.
      await prisma.$executeRawUnsafe(
        `CREATE OR REPLACE FUNCTION fail_portal_session_insert() RETURNS trigger AS $fn$ BEGIN RAISE EXCEPTION 'forced session failure'; END; $fn$ LANGUAGE plpgsql`,
      );
      await prisma.$executeRawUnsafe(
        `CREATE TRIGGER trg_fail_portal_session BEFORE INSERT ON portal_sessions FOR EACH ROW EXECUTE FUNCTION fail_portal_session_insert()`,
      );
      try {
        await request(app)
          .post("/api/v1/portal/exchange")
          .set("X-Aera-Portal", "1")
          .send({ token: linkToken })
          .expect(500);
      } finally {
        await prisma.$executeRawUnsafe(
          `DROP TRIGGER IF EXISTS trg_fail_portal_session ON portal_sessions`,
        );
        await prisma.$executeRawUnsafe(
          `DROP FUNCTION IF EXISTS fail_portal_session_insert()`,
        );
      }

      const after = await prisma.portalAccessGrant.findFirst({
        where: { id: grant.id },
      });
      expect(after?.linkConsumedAt).toBeNull();
      expect(
        await prisma.portalSession.count({ where: { grantId: grant.id } }),
      ).toBe(0);
      expect(
        await prisma.portalAuditEvent.count({
          where: { grantId: grant.id, action: "PORTAL_LINK_EXCHANGED" },
        }),
      ).toBe(0);

      // The link survived: a retry succeeds, writes the audit event and
      // stores the User-Agent hash on the session.
      await request(app)
        .post("/api/v1/portal/exchange")
        .set("X-Aera-Portal", "1")
        .set("User-Agent", "AeraTest/1.0")
        .send({ token: linkToken })
        .expect(200);
      expect(
        await prisma.portalAuditEvent.count({
          where: { grantId: grant.id, action: "PORTAL_LINK_EXCHANGED" },
        }),
      ).toBe(1);
      const session = await prisma.portalSession.findFirst({
        where: { grantId: grant.id },
      });
      expect(session?.userAgentHash).toBe(hashToken("AeraTest/1.0"));
    });

    it("second exchange (409) returns the company contact payload", async () => {
      const { company, linkToken } = await fixture();

      await request(app)
        .post("/api/v1/portal/exchange")
        .set("X-Aera-Portal", "1")
        .send({ token: linkToken })
        .expect(200);

      const response = await request(app)
        .post("/api/v1/portal/exchange")
        .set("X-Aera-Portal", "1")
        .send({ token: linkToken })
        .expect(409);

      expect(response.body.error.code).toBe("PORTAL_LINK_ALREADY_USED");
      expect(response.body.data.company.name).toBe(company.name);
      expect(Array.isArray(response.body.data.contacts)).toBe(true);
      expect(response.body.data.contacts[0].name).toContain("Olivia");
    });

    it("expired session returns 401 PORTAL_SESSION_EXPIRED with contact payload", async () => {
      const { company, customer, job, grant } = await fixture();

      const sessionToken = generateToken();
      await prisma.portalSession.create({
        data: {
          grantId: grant.id,
          companyId: company.id,
          customerId: customer.id,
          jobId: job.id,
          sessionTokenHash: hashToken(sessionToken),
          expiresAt: new Date(Date.now() - 60 * 1000),
          lastSeenAt: new Date(),
        },
      });

      const response = await request(app)
        .get("/api/v1/portal/job")
        .set("Authorization", `Bearer ${sessionToken}`)
        .expect(401);

      expect(response.body.error.code).toBe("PORTAL_SESSION_EXPIRED");
      expect(response.body.data.company.name).toBe(company.name);
      expect(Array.isArray(response.body.data.contacts)).toBe(true);
    });

    it("exchange without X-Aera-Portal header is rejected and does not burn the link", async () => {
      const { grant, linkToken } = await fixture();

      const response = await request(app)
        .post("/api/v1/portal/exchange")
        .send({ token: linkToken })
        .expect(403);

      expect(response.body.error.code).toBe("CSRF_HEADER_REQUIRED");
      const after = await prisma.portalAccessGrant.findFirst({
        where: { id: grant.id },
      });
      expect(after?.linkConsumedAt).toBeNull();
    });

    it("snapshot exposes technician first name + last initial only, and bounds quotes to 20", async () => {
      const { company, customer, job, grant } = await fixture();

      const tech = await prisma.user.create({
        data: {
          firstName: "Mike",
          lastName: "Techson",
          email: `tech-${company.id}@example.com`,
        },
      });
      await prisma.job.update({
        where: { id: job.id },
        data: { assignedTechnicianId: tech.id, status: "SCHEDULED" },
      });

      for (let i = 0; i < 25; i++) {
        await prisma.quote.create({
          data: {
            companyId: company.id,
            customerId: customer.id,
            jobId: job.id,
            status: "SENT",
            subtotalMinor: 1000n,
            totalMinor: 1000n,
            currency: "USD",
          },
        });
      }

      const sessionToken = generateToken();
      await prisma.portalSession.create({
        data: {
          grantId: grant.id,
          companyId: company.id,
          customerId: customer.id,
          jobId: job.id,
          sessionTokenHash: hashToken(sessionToken),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          lastSeenAt: new Date(),
        },
      });

      const response = await request(app)
        .get("/api/v1/portal/job")
        .set("Authorization", `Bearer ${sessionToken}`)
        .expect(200);

      expect(response.body.data.job.technician.firstName).toBe("Mike");
      expect(response.body.data.job.technician.lastInitial).toBe("T");
      expect(JSON.stringify(response.body)).not.toContain("Techson");
      expect(response.body.data.quotes).toHaveLength(20);
    });
  });
  describe("Cross-company isolation & snapshot scoping (R7)", () => {
    async function twoCompanyFixture() {
      async function makeCompany(label: string) {
        const company = await prisma.company.create({
          data: {
            name: `${label} Co`,
            slug: `${label.toLowerCase()}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
            phone: "+15550001111",
          },
        });
        const customer = await prisma.customer.create({
          data: {
            companyId: company.id,
            firstName: "Pat",
            lastName: "Client",
            email: `pat-${company.id}@example.com`,
            phone: "+15550003333",
          },
        });
        const address = await prisma.serviceAddress.create({
          data: {
            companyId: company.id,
            customerId: customer.id,
            label: "Home",
            line1: label === "A" ? "1 Alpha St" : "999 Other St",
            city: "Austin",
            region: "TX",
            postalCode: "73301",
            countryCode: "US",
          },
        });
        return { company, customer, address };
      }

      const a = await makeCompany("A");
      const b = await makeCompany("B");

      const jobA = await prisma.job.create({
        data: {
          companyId: a.company.id,
          customerId: a.customer.id,
          serviceAddressId: a.address.id,
          jobNumber: 101,
          serviceType: "REPAIR",
          problemDescription: "A job",
          status: "SCHEDULED",
          handshakeVersion: 1,
        },
      });
      const jobB = await prisma.job.create({
        data: {
          companyId: b.company.id,
          customerId: b.customer.id,
          serviceAddressId: b.address.id,
          jobNumber: 202,
          serviceType: "REPAIR",
          problemDescription: "B job",
          status: "SCHEDULED",
          handshakeVersion: 1,
        },
      });

      const grantA = await prisma.portalAccessGrant.create({
        data: {
          companyId: a.company.id,
          customerId: a.customer.id,
          jobId: jobA.id,
          linkTokenHash: hashToken(generateToken()),
          linkExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          status: "ACTIVE",
        },
      });

      const sessionTokenA = generateToken();
      await prisma.portalSession.create({
        data: {
          grantId: grantA.id,
          companyId: a.company.id,
          customerId: a.customer.id,
          jobId: jobA.id,
          sessionTokenHash: hashToken(sessionTokenA),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          lastSeenAt: new Date(),
        },
      });

      return { a, b, jobA, jobB, sessionTokenA };
    }

    function sentQuote(companyId: string, customerId: string, jobId: string) {
      return prisma.quote.create({
        data: {
          companyId,
          customerId,
          jobId,
          status: "SENT",
          subtotalMinor: 5000n,
          totalMinor: 5000n,
          currency: "USD",
        },
      });
    }

    it("session of company A cannot respond to company B quote", async () => {
      const { a, b, jobB, sessionTokenA } = await twoCompanyFixture();
      const quoteB = await sentQuote(b.company.id, b.customer.id, jobB.id);
      void a;

      const response = await request(app)
        .post(`/api/v1/portal/quotes/${quoteB.id}/respond`)
        .set("Authorization", `Bearer ${sessionTokenA}`)
        .set("X-Aera-Portal", "1")
        .send({ action: "APPROVED" })
        .expect(404);

      expect(response.body.error.code).toBe("RESOURCE_NOT_FOUND");
      const after = await prisma.quote.findFirst({ where: { id: quoteB.id } });
      expect(after?.status).toBe("SENT");
    });

    it("portal snapshot contains only the session job, quote and invoice ids", async () => {
      const { a, b, jobA, jobB, sessionTokenA } = await twoCompanyFixture();

      // A second job for the SAME customer in company A, plus company B data.
      const addressA2 = await prisma.serviceAddress.create({
        data: {
          companyId: a.company.id,
          customerId: a.customer.id,
          label: "Office",
          line1: "2 Second St",
          city: "Austin",
          region: "TX",
          postalCode: "73301",
          countryCode: "US",
        },
      });
      const jobA2 = await prisma.job.create({
        data: {
          companyId: a.company.id,
          customerId: a.customer.id,
          serviceAddressId: addressA2.id,
          jobNumber: 303,
          serviceType: "MAINTENANCE",
          problemDescription: "Other A job",
          status: "SCHEDULED",
          handshakeVersion: 1,
        },
      });

      const quoteA = await sentQuote(a.company.id, a.customer.id, jobA.id);
      await sentQuote(a.company.id, a.customer.id, jobA2.id);
      await sentQuote(b.company.id, b.customer.id, jobB.id);

      const invoiceA = await prisma.invoice.create({
        data: {
          companyId: a.company.id,
          customerId: a.customer.id,
          jobId: jobA.id,
          invoiceNumber: "INV-A-1",
          status: "ISSUED",
          subtotalMinor: 5000n,
          totalMinor: 5000n,
          balanceDueMinor: 5000n,
          currency: "USD",
        },
      });
      await prisma.invoice.create({
        data: {
          companyId: a.company.id,
          customerId: a.customer.id,
          jobId: jobA2.id,
          invoiceNumber: "INV-A-2",
          status: "ISSUED",
          subtotalMinor: 9000n,
          totalMinor: 9000n,
          balanceDueMinor: 9000n,
          currency: "USD",
        },
      });

      const response = await request(app)
        .get("/api/v1/portal/job")
        .set("Authorization", `Bearer ${sessionTokenA}`)
        .expect(200);

      expect(response.body.data.job.jobNumber).toBe(101);
      expect(
        response.body.data.quotes.map((q: { id: string }) => q.id),
      ).toEqual([quoteA.id]);
      expect(
        response.body.data.invoices.map((i: { id: string }) => i.id),
      ).toEqual([invoiceA.id]);
    });

    it("snapshot never includes other jobs, other addresses, internal notes or photo keys", async () => {
      const { a, jobA, sessionTokenA } = await twoCompanyFixture();

      const author = await prisma.user.create({
        data: {
          firstName: "Staff",
          lastName: "Member",
          email: `staff-${a.company.id}@example.com`,
        },
      });
      await prisma.jobNote.create({
        data: {
          companyId: a.company.id,
          jobId: jobA.id,
          authorUserId: author.id,
          body: "INTERNAL-SECRET-NOTE",
          visibility: "INTERNAL",
        },
      });
      await prisma.jobPhoto.create({
        data: {
          companyId: a.company.id,
          jobId: jobA.id,
          uploadedBy: author.id,
          objectKey: "private/photo-key-abc.jpg",
          mimeType: "image/jpeg",
          sizeBytes: 1234n,
          kind: "BEFORE",
        },
      });

      const response = await request(app)
        .get("/api/v1/portal/job")
        .set("Authorization", `Bearer ${sessionTokenA}`)
        .expect(200);

      const body = JSON.stringify(response.body);
      expect(body).not.toContain("999 Other St");
      expect(body).not.toContain("INTERNAL-SECRET-NOTE");
      expect(body).not.toContain("photo-key-abc");
      expect(body).not.toContain("objectKey");
    });

    it("client-supplied jobId/companyId/customerId in body/query is ignored", async () => {
      const { a, b, jobA, jobB, sessionTokenA } = await twoCompanyFixture();
      void a;

      await prisma.job.update({
        where: { id: jobA.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });

      // Query params naming another job/company change nothing.
      const snapshot = await request(app)
        .get(
          `/api/v1/portal/job?jobId=${jobB.id}&companyId=${b.company.id}&customerId=${b.customer.id}`,
        )
        .set("Authorization", `Bearer ${sessionTokenA}`)
        .expect(200);
      expect(snapshot.body.data.job.jobNumber).toBe(101);

      // A review whose body names company B's job still lands on the
      // session's job — scoping comes from the session, never the body.
      const review = await request(app)
        .post("/api/v1/portal/reviews")
        .set("Authorization", `Bearer ${sessionTokenA}`)
        .set("X-Aera-Portal", "1")
        .send({
          rating: 5,
          comment: "Great work",
          jobId: jobB.id,
          companyId: b.company.id,
          customerId: b.customer.id,
        })
        .expect(201);
      expect(review.body.data.jobId ?? jobA.id).toBe(jobA.id);

      const stored = await prisma.customerReview.findFirst({
        where: { jobId: jobA.id },
      });
      expect(stored).not.toBeNull();
      const foreign = await prisma.customerReview.findFirst({
        where: { jobId: jobB.id },
      });
      expect(foreign).toBeNull();

      // And the review submission was audited (PORTAL_REVIEW_SUBMITTED).
      const audit = await prisma.portalAuditEvent.findFirst({
        where: { jobId: jobA.id, action: "PORTAL_REVIEW_SUBMITTED" },
      });
      expect(audit).not.toBeNull();
    });
  });
});
