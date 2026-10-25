import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import {
  generateToken,
  hashToken,
} from "../src/modules/portal/portal.tokens.js";

describe("Portal API", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    app = buildApp();
    await prisma.$transaction([
      prisma.portalSession.deleteMany(),
      prisma.portalAccessGrant.deleteMany(),
      prisma.customerReview.deleteMany(),
      prisma.quoteApprovalEvent.deleteMany(),
      prisma.quoteItem.deleteMany(),
      prisma.quote.deleteMany(),
      prisma.invoiceItem.deleteMany(),
      prisma.invoice.deleteMany(),
      prisma.job.deleteMany(),
      prisma.customer.deleteMany(),
      prisma.company.deleteMany(),
    ]);
  });

  function uniqueSlug() {
    return `test-company-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  describe("POST /api/v1/portal/exchange", () => {
    it("should exchange a valid token for a session cookie", async () => {
      // Setup: create company, customer, job, and grant
      const company = await prisma.company.create({
        data: {
          name: "Test Company",
          slug: uniqueSlug(),
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
        .send({ token: linkToken, deliver: "cookie" })
        .expect(200);

      expect(response.body.data.state).toBe("ACTIVE");
      expect(response.headers["set-cookie"]).toBeDefined();
      expect(response.headers["set-cookie"][0]).toContain("__Host-aera_portal");

      // Verify grant was consumed
      const updatedGrant = await prisma.portalAccessGrant.findUnique({
        where: { id: grant.id },
      });
      expect(updatedGrant?.linkConsumedAt).not.toBeNull();

      // Verify session was created
      const session = await prisma.portalSession.findFirst({
        where: { grantId: grant.id },
      });
      expect(session).toBeDefined();
    });

    it("should return bearer token when requested", async () => {
      const company = await prisma.company.create({
        data: {
          name: "Test Company",
          slug: uniqueSlug(),
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
        .send({ token: linkToken, deliver: "bearer" })
        .expect(200);

      expect(response.body.data.state).toBe("ACTIVE");
      expect(response.body.data.sessionToken).toBeDefined();
      expect(response.headers["set-cookie"]).toBeUndefined();
    });

    it("should reject invalid token", async () => {
      const response = await request(app)
        .post("/api/v1/portal/exchange")
        .set("X-Aera-Portal", "1")
        .send({ token: "invalid" })
        .expect(422);

      expect(response.body.error.code).toBe("VALIDATION_FAILED");
    });

    it("should reject unknown token", async () => {
      const linkToken = generateToken();

      const response = await request(app)
        .post("/api/v1/portal/exchange")
        .set("X-Aera-Portal", "1")
        .send({ token: linkToken })
        .expect(401);

      expect(response.body.error.code).toBe("PORTAL_LINK_INVALID");
    });

    it("should reject already-used token", async () => {
      const company = await prisma.company.create({
        data: {
          name: "Test Company",
          slug: uniqueSlug(),
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
          linkConsumedAt: new Date(),
          status: "ACTIVE",
        },
      });

      const response = await request(app)
        .post("/api/v1/portal/exchange")
        .set("X-Aera-Portal", "1")
        .send({ token: linkToken })
        .expect(409);

      expect(response.body.error.code).toBe("PORTAL_LINK_ALREADY_USED");
    });

    it("should reject expired token", async () => {
      const company = await prisma.company.create({
        data: {
          name: "Test Company",
          slug: uniqueSlug(),
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
          linkExpiresAt: new Date(Date.now() - 1000),
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
  });

  describe("GET /api/v1/portal/session", () => {
    it("should return session state for valid session", async () => {
      const company = await prisma.company.create({
        data: {
          name: "Test Company",
          slug: uniqueSlug(),
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
        .get("/api/v1/portal/session")
        .set("Authorization", `Bearer ${sessionToken}`)
        .expect(200);

      expect(response.body.data.state).toBe("ACTIVE");
    });

    it("should reject request without session", async () => {
      const response = await request(app)
        .get("/api/v1/portal/session")
        .expect(401);

      expect(response.body.error.code).toBe("PORTAL_SESSION_REQUIRED");
    });
  });

  describe("GET /api/v1/portal/job", () => {
    it("should return job snapshot for valid session", async () => {
      const company = await prisma.company.create({
        data: {
          name: "Test Company",
          slug: uniqueSlug(),
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

      expect(response.body.data.job).toBeDefined();
      expect(response.body.data.job.jobNumber).toBe(1);
      expect(response.body.data.quotes).toBeDefined();
      expect(response.body.data.invoices).toBeDefined();
    });
  });

  describe("POST /api/v1/portal/logout", () => {
    it("should revoke session and clear cookie", async () => {
      const company = await prisma.company.create({
        data: {
          name: "Test Company",
          slug: uniqueSlug(),
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

      const session = await prisma.portalSession.create({
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
        .post("/api/v1/portal/logout")
        .set("Authorization", `Bearer ${sessionToken}`)
        .set("X-Aera-Portal", "1")
        .expect(200);

      expect(response.body.data.success).toBe(true);

      // Verify session was revoked
      const revokedSession = await prisma.portalSession.findUnique({
        where: { id: session.id },
      });
      expect(revokedSession?.revokedAt).not.toBeNull();
    });
  });
});
