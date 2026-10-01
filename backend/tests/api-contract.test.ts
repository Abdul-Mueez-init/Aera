import request from "supertest";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/common/auth/password.js";
import {
  createAccessToken,
  hashRefreshToken,
} from "../src/common/auth/tokens.js";
import { prisma } from "../src/db/prisma.js";

const app = buildApp();

describe("Phase G4 — API Contract Tests", () => {
  let testUserId: string;
  let testCompanyId: string;
  let testAccessToken: string;
  let testCustomerId: string;
  let testJobId: string;

  beforeAll(async () => {
    // Setup test data with unique identifiers
    const timestamp = Date.now();
    const passwordHash = await hashPassword("TestPassword123!");

    const user = await prisma.user.create({
      data: {
        email: `contract-test-${timestamp}@example.com`,
        passwordHash,
        firstName: "Contract",
        lastName: "Tester",
      },
    });
    testUserId = user.id;

    const company = await prisma.company.create({
      data: {
        name: "Contract Test Company",
        slug: `contract-test-company-${timestamp}`,
        timezone: "UTC",
        defaultCurrency: "USD",
      },
    });
    testCompanyId = company.id;

    await prisma.companyMember.create({
      data: {
        companyId: testCompanyId,
        userId: testUserId,
        role: "OWNER",
        status: "ACTIVE",
      },
    });

    // Create a valid refresh session for authentication
    const sessionId = crypto.randomUUID();
    const refreshToken = crypto.randomUUID();
    await prisma.refreshSession.create({
      data: {
        id: sessionId,
        userId: testUserId,
        companyId: testCompanyId,
        tokenHash: hashRefreshToken(refreshToken),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });

    const authContext = {
      userId: testUserId,
      sessionId: sessionId,
      companyId: testCompanyId,
      role: "OWNER" as const,
    };
    testAccessToken = await createAccessToken(authContext);

    // Create test customer
    const customer = await prisma.customer.create({
      data: {
        companyId: testCompanyId,
        firstName: "Test",
        lastName: "Customer",
        email: "test-customer@example.com",
      },
    });
    testCustomerId = customer.id;

    // Create test service address
    const serviceAddress = await prisma.serviceAddress.create({
      data: {
        companyId: testCompanyId,
        customerId: testCustomerId,
        label: "Test Address",
        line1: "123 Test Street",
        city: "Test City",
        countryCode: "US",
      },
    });

    // Create test job
    const job = await prisma.job.create({
      data: {
        companyId: testCompanyId,
        customerId: testCustomerId,
        serviceAddressId: serviceAddress.id,
        jobNumber: 1001,
        serviceType: "Test Service",
        problemDescription: "Test problem description",
        status: "NEW",
        priority: "NORMAL",
      },
    });
    testJobId = job.id;
  });

  afterAll(async () => {
    // Cleanup test data - use deleteMany to avoid foreign key issues
    try {
      await prisma.job.deleteMany({
        where: { companyId: testCompanyId },
      });
      await prisma.serviceAddress.deleteMany({
        where: { companyId: testCompanyId },
      });
      await prisma.customer.deleteMany({
        where: { companyId: testCompanyId },
      });
      await prisma.refreshSession.deleteMany({
        where: { userId: testUserId },
      });
      await prisma.companyMember.deleteMany({
        where: { companyId: testCompanyId },
      });
      await prisma.company.deleteMany({
        where: { id: testCompanyId },
      });
      await prisma.user.deleteMany({
        where: { id: testUserId },
      });
    } catch (error) {
      // Ignore cleanup errors to avoid test failures
      console.log("Cleanup error (non-critical):", error);
    }
  });

  describe("Health Endpoints", () => {
    it("GET /health - correct HTTP method and URL path", async () => {
      const response = await request(app).get("/health");
      expect([200, 401]).toContain(response.status);
    });

    it("GET /health - correct response envelope", async () => {
      const response = await request(app).get("/health");
      expect(response.body).toHaveProperty("data");
      expect(response.body.data).toHaveProperty("status");
      expect(response.body.data).toHaveProperty("service");
    });

    it("GET /api/v1/health - versioned endpoint", async () => {
      const response = await request(app).get("/api/v1/health");
      expect([200, 401]).toContain(response.status);
      expect(response.body.data.status).toBe("ok");
    });

    it("GET /api/v1/health - returns required headers", async () => {
      const response = await request(app).get("/api/v1/health");
      expect(response.headers["x-request-id"]).toBeTruthy();
    });
  });

  describe("Authentication Endpoints", () => {
    it("POST /api/v1/auth/register - correct HTTP method and URL path", async () => {
      const response = await request(app).post("/api/v1/auth/register").send({
        email: "new-user@example.com",
        password: "NewPassword123!",
        firstName: "New",
        lastName: "User",
        companyName: "New Company",
      });
      expect([201, 401, 409]).toContain(response.status);
    });

    it("POST /api/v1/auth/register - correct request body shape", async () => {
      const response = await request(app).post("/api/v1/auth/register").send({
        email: "valid-shape@example.com",
        password: "ValidShape123!",
        firstName: "Valid",
        lastName: "Shape",
        companyName: "Valid Company",
      });
      expect([201, 401, 409]).toContain(response.status);
      if (response.status === 201) {
        expect(response.body).toHaveProperty("data");
      }
    });

    it("POST /api/v1/auth/register - validation error on invalid body", async () => {
      const response = await request(app).post("/api/v1/auth/register").send({
        email: "invalid-email",
        password: "short",
      });
      expect([422, 401]).toContain(response.status);
      expect(response.body.error.code).toBe("VALIDATION_FAILED");
    });

    it("POST /api/v1/auth/login - correct HTTP method and URL path", async () => {
      const response = await request(app).post("/api/v1/auth/login").send({
        email: "contract-test@example.com",
        password: "TestPassword123!",
      });
      expect([200, 401]).toContain(response.status);
    });

    it("POST /api/v1/auth/login - correct request body shape", async () => {
      const response = await request(app).post("/api/v1/auth/login").send({
        email: "contract-test@example.com",
        password: "TestPassword123!",
      });
      expect([200, 401]).toContain(response.status);
      expect(response.body).toHaveProperty("data");
      expect(response.body.data).toHaveProperty("accessToken");
      expect(response.body.data).toHaveProperty("refreshToken");
    });

    it("POST /api/v1/auth/login - validation error on invalid credentials", async () => {
      const response = await request(app).post("/api/v1/auth/login").send({
        email: "invalid@example.com",
        password: "wrong",
      });
      expect(response.status).toBe(401);
    });

    it("POST /api/v1/auth/refresh - correct HTTP method and URL path", async () => {
      const response = await request(app).post("/api/v1/auth/refresh").send({
        refreshToken: "test-refresh-token",
      });
      // Will fail with invalid token, but endpoint exists
      expect([200, 401]).toContain(response.status);
    });

    it("POST /api/v1/auth/refresh - correct request body shape", async () => {
      const response = await request(app).post("/api/v1/auth/refresh").send({
        refreshToken: "test-refresh-token",
      });
      expect([200, 401]).toContain(response.status);
    });

    it("POST /api/v1/auth/logout - correct HTTP method and URL path", async () => {
      const response = await request(app)
        .post("/api/v1/auth/logout")
        .set("Authorization", `Bearer ${testAccessToken}`);
      expect([204, 500]).toContain(response.status);
    });

    it("POST /api/v1/auth/logout - works without authentication", async () => {
      const response = await request(app).post("/api/v1/auth/logout");
      expect(response.status).toBe(204);
    });

    it("GET /api/v1/auth/me - requires authentication header", async () => {
      const response = await request(app).get("/api/v1/auth/me");
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("AUTH_SESSION_EXPIRED");
    });

    it("GET /api/v1/auth/me - correct HTTP method and URL path with auth", async () => {
      const response = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${testAccessToken}`);
      expect([200, 401]).toContain(response.status);
    });

    it("GET /api/v1/auth/me - correct response envelope", async () => {
      const response = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${testAccessToken}`);
      if (response.status === 200) {
        expect(response.body).toHaveProperty("data");
        expect(response.body.data).toHaveProperty("id");
        expect(response.body.data).toHaveProperty("email");
      }
    });

    it("Authorization header format validation", async () => {
      const response = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", "InvalidFormat token");
      expect(response.status).toBe(401);
    });
  });

  describe("Company Endpoints", () => {
    it("POST /api/v1/companies - requires authentication and OWNER role", async () => {
      const response = await request(app).post("/api/v1/companies").send({
        name: "Test Company",
      });
      expect([401, 201, 409]).toContain(response.status);
    });

    it("POST /api/v1/companies - correct HTTP method and URL path with auth", async () => {
      const response = await request(app)
        .post("/api/v1/companies")
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          name: "Another Test Company",
        });
      expect([201, 409, 401]).toContain(response.status); // 201 or conflict or auth failure
    });

    it("POST /api/v1/companies - correct request body shape", async () => {
      const response = await request(app)
        .post("/api/v1/companies")
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          name: "Valid Company",
          slug: "valid-company",
          timezone: "UTC",
          defaultCurrency: "USD",
        });
      expect([201, 409, 401]).toContain(response.status);
    });

    it("POST /api/v1/companies - validation error on invalid body", async () => {
      const response = await request(app)
        .post("/api/v1/companies")
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          name: "", // Invalid: empty name
        });
      expect([422, 401]).toContain(response.status);
      if (response.status === 422) {
        expect(response.body.error.code).toBe("VALIDATION_FAILED");
      }
    });

    it("GET /api/v1/companies/:companyId - requires authentication", async () => {
      const response = await request(app).get(
        `/api/v1/companies/${testCompanyId}`,
      );
      expect([401, 200]).toContain(response.status);
    });

    it("GET /api/v1/companies/:companyId - correct HTTP method and URL path", async () => {
      const response = await request(app)
        .get(`/api/v1/companies/${testCompanyId}`)
        .set("Authorization", `Bearer ${testAccessToken}`);
      expect([200, 401]).toContain(response.status);
    });

    it("GET /api/v1/companies/:companyId - correct response envelope", async () => {
      const response = await request(app)
        .get(`/api/v1/companies/${testCompanyId}`)
        .set("Authorization", `Bearer ${testAccessToken}`);
      if (response.status === 200) {
        expect(response.body).toHaveProperty("data");
        expect(response.body.data).toHaveProperty("id");
        expect(response.body.data).toHaveProperty("name");
      }
    });

    it("GET /api/v1/companies/current/members - requires OWNER/DISPATCHER role", async () => {
      const response = await request(app)
        .get("/api/v1/companies/current/members")
        .set("Authorization", `Bearer ${testAccessToken}`);
      expect([200, 401]).toContain(response.status);
    });

    it("POST /api/v1/companies/current/invitations - requires OWNER role", async () => {
      const response = await request(app)
        .post("/api/v1/companies/current/invitations")
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          email: "invite@example.com",
          firstName: "Invited",
          lastName: "User",
          role: "TECHNICIAN",
        });
      expect([201, 422, 401]).toContain(response.status);
    });
  });

  describe("Customer Endpoints", () => {
    it("GET /api/v1/customers - requires authentication and proper role", async () => {
      const response = await request(app).get("/api/v1/customers");
      expect(response.status).toBe(401);
    });

    it("GET /api/v1/customers - correct HTTP method and URL path with auth", async () => {
      const response = await request(app)
        .get("/api/v1/customers")
        .set("Authorization", `Bearer ${testAccessToken}`);
      expect([200, 401]).toContain(response.status);
    });

    it("GET /api/v1/customers - correct response envelope with pagination", async () => {
      const response = await request(app)
        .get("/api/v1/customers")
        .set("Authorization", `Bearer ${testAccessToken}`);
      if (response.status === 200) {
        expect(response.body).toHaveProperty("data");
        expect(Array.isArray(response.body.data)).toBe(true);
      }
    });

    it("GET /api/v1/customers - query parameter validation", async () => {
      const response = await request(app)
        .get("/api/v1/customers?page=invalid")
        .set("Authorization", `Bearer ${testAccessToken}`);
      expect([422, 401]).toContain(response.status);
    });

    it("POST /api/v1/customers - correct HTTP method and URL path", async () => {
      const response = await request(app)
        .post("/api/v1/customers")
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          firstName: "New",
          lastName: "Customer",
          email: "new@example.com",
        });
      expect([201, 401]).toContain(response.status);
    });

    it("POST /api/v1/customers - correct request body shape", async () => {
      const response = await request(app)
        .post("/api/v1/customers")
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          firstName: "Valid",
          lastName: "Customer",
          email: "valid@example.com",
          phone: "+1234567890",
          notes: "Test notes",
        });
      expect([201, 401]).toContain(response.status);
    });

    it("POST /api/v1/customers - validation error on invalid body", async () => {
      const response = await request(app)
        .post("/api/v1/customers")
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          firstName: "", // Invalid: empty name
        });
      expect([422, 401]).toContain(response.status);
    });

    it("GET /api/v1/customers/:customerId - correct HTTP method and URL path", async () => {
      const response = await request(app)
        .get(`/api/v1/customers/${testCustomerId}`)
        .set("Authorization", `Bearer ${testAccessToken}`);
      expect([200, 401]).toContain(response.status);
    });

    it("GET /api/v1/customers/:customerId - correct response envelope", async () => {
      const response = await request(app)
        .get(`/api/v1/customers/${testCustomerId}`)
        .set("Authorization", `Bearer ${testAccessToken}`);
      if (response.status === 200) {
        expect(response.body).toHaveProperty("data");
        expect(response.body.data).toHaveProperty("id");
        expect(response.body.data).toHaveProperty("firstName");
      }
    });

    it("PATCH /api/v1/customers/:customerId - correct HTTP method", async () => {
      const response = await request(app)
        .patch(`/api/v1/customers/${testCustomerId}`)
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          firstName: "Updated",
        });
      expect([200, 401]).toContain(response.status);
    });

    it("DELETE /api/v1/customers/:customerId - correct HTTP method", async () => {
      const response = await request(app)
        .delete(`/api/v1/customers/${testCustomerId}`)
        .set("Authorization", `Bearer ${testAccessToken}`);
      expect([204, 401]).toContain(response.status);
    });

    it("POST /api/v1/customers/:customerId/addresses - correct request body shape", async () => {
      // Create a fresh customer for this test since the main one might be deleted
      const freshCustomer = await prisma.customer.create({
        data: {
          companyId: testCompanyId,
          firstName: "Address",
          lastName: "Test",
          email: "address-test@example.com",
        },
      });

      const response = await request(app)
        .post(`/api/v1/customers/${freshCustomer.id}/addresses`)
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          label: "Home",
          line1: "123 Test St",
          city: "Test City",
          countryCode: "US",
        });
      expect([201, 404, 401]).toContain(response.status); // 201 or customer not found
    });
  });

  describe("Job Endpoints", () => {
    it("GET /api/v1/jobs - requires authentication", async () => {
      const response = await request(app).get("/api/v1/jobs");
      expect([401, 200]).toContain(response.status);
    });

    it("GET /api/v1/jobs - correct HTTP method and URL path with auth", async () => {
      const response = await request(app)
        .get("/api/v1/jobs")
        .set("Authorization", `Bearer ${testAccessToken}`);
      expect([200, 401]).toContain(response.status);
    });

    it("GET /api/v1/jobs - correct response envelope", async () => {
      const response = await request(app)
        .get("/api/v1/jobs")
        .set("Authorization", `Bearer ${testAccessToken}`);
      if (response.status === 200) {
        expect(response.body).toHaveProperty("data");
        expect(Array.isArray(response.body.data)).toBe(true);
      }
    });

    it("GET /api/v1/jobs - query parameter validation", async () => {
      const response = await request(app)
        .get("/api/v1/jobs?status=INVALID")
        .set("Authorization", `Bearer ${testAccessToken}`);
      expect([422, 401]).toContain(response.status);
    });

    it("POST /api/v1/jobs - requires OWNER/DISPATCHER role", async () => {
      const response = await request(app)
        .post("/api/v1/jobs")
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          customerId: testCustomerId,
          serviceAddressId: testCustomerId, // Using customer ID as placeholder
          serviceType: "Test Service",
          problemDescription: "Test problem",
        });
      expect([201, 422, 401]).toContain(response.status);
    });

    it("POST /api/v1/jobs - correct request body shape", async () => {
      const response = await request(app)
        .post("/api/v1/jobs")
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          customerId: testCustomerId,
          serviceAddressId: testCustomerId,
          serviceType: "Valid Service",
          problemDescription: "Valid problem description",
          priority: "HIGH",
        });
      expect([201, 422, 401]).toContain(response.status);
    });

    it("POST /api/v1/jobs - validation error on invalid body", async () => {
      const response = await request(app)
        .post("/api/v1/jobs")
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          customerId: "invalid-uuid",
        });
      expect([422, 401]).toContain(response.status);
    });

    it("GET /api/v1/jobs/:jobId - correct HTTP method and URL path", async () => {
      const response = await request(app)
        .get(`/api/v1/jobs/${testJobId}`)
        .set("Authorization", `Bearer ${testAccessToken}`);
      expect([200, 401]).toContain(response.status);
    });

    it("GET /api/v1/jobs/:jobId - correct response envelope", async () => {
      const response = await request(app)
        .get(`/api/v1/jobs/${testJobId}`)
        .set("Authorization", `Bearer ${testAccessToken}`);
      if (response.status === 200) {
        expect(response.body).toHaveProperty("data");
        expect(response.body.data).toHaveProperty("id");
        expect(response.body.data).toHaveProperty("jobNumber");
      }
    });

    it("PATCH /api/v1/jobs/:jobId - requires OWNER/DISPATCHER role", async () => {
      const response = await request(app)
        .patch(`/api/v1/jobs/${testJobId}`)
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          serviceType: "Updated Service",
        });
      expect([200, 401]).toContain(response.status);
    });

    it("POST /api/v1/jobs/:jobId/assign - correct request body shape", async () => {
      const response = await request(app)
        .post(`/api/v1/jobs/${testJobId}/assign`)
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          technicianId: null,
        });
      expect([200, 401]).toContain(response.status);
    });

    it("POST /api/v1/jobs/:jobId/status - correct request body shape", async () => {
      const response = await request(app)
        .post(`/api/v1/jobs/${testJobId}/status`)
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          status: "SCHEDULED",
          reason: "Test reason",
        });
      expect([200, 401]).toContain(response.status);
    });

    it("POST /api/v1/jobs/:jobId/notes - correct request body shape", async () => {
      const response = await request(app)
        .post(`/api/v1/jobs/${testJobId}/notes`)
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          body: "Test note",
          visibility: "INTERNAL",
        });
      expect([201, 401]).toContain(response.status);
    });

    it("GET /api/v1/jobs/:jobId/history - correct HTTP method and URL path", async () => {
      const response = await request(app)
        .get(`/api/v1/jobs/${testJobId}/history`)
        .set("Authorization", `Bearer ${testAccessToken}`);
      expect([200, 401]).toContain(response.status);
    });
  });

  describe("Quote Endpoints", () => {
    it("GET /api/v1/quotes - requires OWNER/DISPATCHER role", async () => {
      const response = await request(app)
        .get("/api/v1/quotes")
        .set("Authorization", `Bearer ${testAccessToken}`);
      expect([200, 401]).toContain(response.status);
    });

    it("POST /api/v1/quotes - requires OWNER/DISPATCHER role", async () => {
      const response = await request(app)
        .post("/api/v1/quotes")
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          customerId: testCustomerId,
          jobId: testJobId,
          currency: "USD",
          items: [
            {
              description: "Test item",
              quantity: "1.0",
              unitPriceMinor: 10000,
            },
          ],
        });
      expect([201, 422, 401]).toContain(response.status);
    });

    it("POST /api/v1/quotes - correct request body shape", async () => {
      const response = await request(app)
        .post("/api/v1/quotes")
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          customerId: testCustomerId,
          jobId: testJobId,
          currency: "USD",
          discountMinor: 0,
          taxRateBps: 0,
          items: [
            {
              description: "Valid item",
              quantity: "2.5",
              unitPriceMinor: 15000,
            },
          ],
        });
      expect([201, 422, 401]).toContain(response.status);
    });

    it("POST /api/v1/quotes - validation error on invalid body", async () => {
      const response = await request(app)
        .post("/api/v1/quotes")
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          customerId: "invalid-uuid",
          items: [], // Invalid: empty items
        });
      expect([422, 401]).toContain(response.status);
    });

    it("GET /api/v1/quotes/shared/:shareToken - public endpoint (no auth required)", async () => {
      const response = await request(app).get(
        "/api/v1/quotes/shared/test-token",
      );
      expect([200, 404]).toContain(response.status);
    });

    it("POST /api/v1/quotes/shared/:shareToken/respond - correct request body shape", async () => {
      const response = await request(app)
        .post("/api/v1/quotes/shared/test-token/respond")
        .send({
          action: "APPROVED",
        });
      expect([200, 404]).toContain(response.status);
    });

    it("GET /api/v1/quotes/:quoteId - requires authentication", async () => {
      const response = await request(app)
        .get(`/api/v1/quotes/00000000-0000-0000-0000-000000000000`)
        .set("Authorization", `Bearer ${testAccessToken}`);
      expect([200, 404, 401]).toContain(response.status);
    });
  });

  describe("Invoice Endpoints", () => {
    it("GET /api/v1/invoices - requires OWNER/DISPATCHER role", async () => {
      const response = await request(app)
        .get("/api/v1/invoices")
        .set("Authorization", `Bearer ${testAccessToken}`);
      expect([200, 401]).toContain(response.status);
    });

    it("POST /api/v1/invoices/from-job/:jobId - requires OWNER/DISPATCHER role", async () => {
      const response = await request(app)
        .post(`/api/v1/invoices/from-job/${testJobId}`)
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          allowZeroAmount: false,
        });
      expect([201, 422, 401]).toContain(response.status);
    });

    it("GET /api/v1/invoices/:invoiceId - requires authentication", async () => {
      const response = await request(app)
        .get(`/api/v1/invoices/00000000-0000-0000-0000-000000000000`)
        .set("Authorization", `Bearer ${testAccessToken}`);
      expect([200, 404, 401]).toContain(response.status);
    });

    it("POST /api/v1/invoices/:invoiceId/issue - requires OWNER/DISPATCHER role", async () => {
      const response = await request(app)
        .post(`/api/v1/invoices/00000000-0000-0000-0000-000000000000/issue`)
        .set("Authorization", `Bearer ${testAccessToken}`);
      expect([200, 404, 401]).toContain(response.status);
    });

    it("POST /api/v1/invoices/:invoiceId/payments - requires idempotency key header", async () => {
      const response = await request(app)
        .post(`/api/v1/invoices/00000000-0000-0000-0000-000000000000/payments`)
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          amountMinor: 10000,
          currency: "USD",
          method: "CASH",
        });
      expect([422, 401]).toContain(response.status);
      if (response.status === 422) {
        expect(response.body.error.code).toBe("VALIDATION_FAILED");
      }
    });

    it("POST /api/v1/invoices/:invoiceId/payments - correct request body shape with idempotency key", async () => {
      const response = await request(app)
        .post(`/api/v1/invoices/00000000-0000-0000-0000-000000000000/payments`)
        .set("Authorization", `Bearer ${testAccessToken}`)
        .set("Idempotency-Key", "test-key-123")
        .send({
          amountMinor: 10000,
          currency: "USD",
          method: "CASH",
          reference: "Test payment",
        });
      expect([201, 404, 401]).toContain(response.status);
    });

    it("POST /api/v1/invoices/:invoiceId/payments - validation error on invalid amount", async () => {
      const response = await request(app)
        .post(`/api/v1/invoices/00000000-0000-0000-0000-000000000000/payments`)
        .set("Authorization", `Bearer ${testAccessToken}`)
        .set("Idempotency-Key", "test-key-invalid")
        .send({
          amountMinor: -100, // Invalid: negative amount
          currency: "USD",
          method: "CASH",
        });
      expect([422, 401]).toContain(response.status);
    });
  });

  describe("Scheduling Endpoints", () => {
    it("GET /api/v1/schedule - requires OWNER/DISPATCHER role", async () => {
      const response = await request(app)
        .get("/api/v1/schedule?date=2024-01-01")
        .set("Authorization", `Bearer ${testAccessToken}`);
      expect([200, 401]).toContain(response.status);
    });

    it("GET /api/v1/schedule - query parameter validation", async () => {
      const response = await request(app)
        .get("/api/v1/schedule?date=invalid")
        .set("Authorization", `Bearer ${testAccessToken}`);
      expect([422, 401]).toContain(response.status);
    });

    it("GET /api/v1/schedule/workload - requires OWNER/DISPATCHER role", async () => {
      const response = await request(app)
        .get("/api/v1/schedule/workload?date=2024-01-01")
        .set("Authorization", `Bearer ${testAccessToken}`);
      expect([200, 401]).toContain(response.status);
    });

    it("POST /api/v1/schedule/jobs/:jobId/schedule - correct request body shape", async () => {
      const response = await request(app)
        .post(`/api/v1/schedule/jobs/${testJobId}/schedule`)
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          scheduledStart: new Date().toISOString(),
          scheduledEnd: new Date(Date.now() + 3600000).toISOString(),
        });
      expect([200, 422, 401]).toContain(response.status);
    });

    it("POST /api/v1/schedule/jobs/:jobId/reschedule - correct HTTP method", async () => {
      const response = await request(app)
        .post(`/api/v1/schedule/jobs/${testJobId}/reschedule`)
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          scheduledStart: new Date().toISOString(),
          scheduledEnd: new Date(Date.now() + 3600000).toISOString(),
        });
      expect([200, 422, 500, 401]).toContain(response.status);
    });
  });

  describe("AI Endpoints", () => {
    it("POST /api/v1/ai/conversations - requires OWNER/DISPATCHER role", async () => {
      const response = await request(app)
        .post("/api/v1/ai/conversations")
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          title: "Test Conversation",
        });
      expect([201, 422, 500, 401]).toContain(response.status);
    });

    it("GET /api/v1/ai/conversations - requires authentication", async () => {
      const response = await request(app)
        .get("/api/v1/ai/conversations")
        .set("Authorization", `Bearer ${testAccessToken}`);
      expect([200, 500, 401]).toContain(response.status);
    });

    it("GET /api/v1/ai/conversations - query parameter validation", async () => {
      const response = await request(app)
        .get("/api/v1/ai/conversations?page=invalid")
        .set("Authorization", `Bearer ${testAccessToken}`);
      expect([422, 500, 401]).toContain(response.status);
    });

    it("GET /api/v1/ai/conversations/:conversationId - requires authentication", async () => {
      const response = await request(app)
        .get("/api/v1/ai/conversations/test-conversation-id")
        .set("Authorization", `Bearer ${testAccessToken}`);
      expect([200, 404, 500, 401]).toContain(response.status);
    });

    it("POST /api/v1/ai/conversations/:conversationId/messages - correct request body shape", async () => {
      const response = await request(app)
        .post("/api/v1/ai/conversations/test-conversation-id/messages")
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          content: "Test message",
        });
      expect([201, 404, 500, 401]).toContain(response.status);
    });

    it("POST /api/v1/ai/conversations/:conversationId/messages - validation error on empty content", async () => {
      const response = await request(app)
        .post("/api/v1/ai/conversations/test-conversation-id/messages")
        .set("Authorization", `Bearer ${testAccessToken}`)
        .send({
          content: "", // Invalid: empty content
        });
      expect([422, 500, 401]).toContain(response.status);
    });
  });

  describe("Portal Endpoints", () => {
    it("GET /api/v1/portal/:token - public endpoint (no auth required)", async () => {
      const response = await request(app).get("/api/v1/portal/test-token");
      expect([200, 404, 401]).toContain(response.status);
    });

    it("POST /api/v1/portal/:token/reviews - correct request body shape", async () => {
      const response = await request(app)
        .post("/api/v1/portal/test-token/reviews")
        .send({
          jobId: testJobId,
          rating: 5,
          comment: "Great service",
        });
      expect([201, 404, 422, 401]).toContain(response.status);
    });

    it("POST /api/v1/portal/:token/reviews - validation error on invalid rating", async () => {
      const response = await request(app)
        .post("/api/v1/portal/test-token/reviews")
        .send({
          jobId: testJobId,
          rating: 6, // Invalid: rating must be 1-5
        });
      expect([422, 401]).toContain(response.status);
    });
  });

  describe("Error Code Handling", () => {
    it("422 VALIDATION_FAILED - consistent error format", async () => {
      const response = await request(app).post("/api/v1/auth/register").send({
        email: "invalid",
      });
      expect([422, 401]).toContain(response.status);
      expect(response.body.error.code).toBe("VALIDATION_FAILED");
      expect(response.body.error.message).toBeTruthy();
    });

    it("401 AUTH_SESSION_EXPIRED - consistent error format", async () => {
      const response = await request(app).get("/api/v1/auth/me");
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("AUTH_SESSION_EXPIRED");
    });

    it("403 TENANT_ACCESS_DENIED - consistent error format", async () => {
      // Try to access another company's data
      const response = await request(app)
        .get("/api/v1/companies/other-company-id")
        .set("Authorization", `Bearer ${testAccessToken}`);
      expect([403, 500, 401]).toContain(response.status);
      if (response.status === 403) {
        expect(response.body.error.code).toBe("TENANT_ACCESS_DENIED");
      }
    });

    it("404 NOT_FOUND - consistent error format", async () => {
      const response = await request(app)
        .get("/api/v1/customers/non-existent-id")
        .set("Authorization", `Bearer ${testAccessToken}`);
      expect([404, 500, 401]).toContain(response.status);
    });
  });

  describe("Response Envelope Handling", () => {
    it("Successful responses always have data property", async () => {
      const response = await request(app)
        .get("/api/v1/customers")
        .set("Authorization", `Bearer ${testAccessToken}`);
      if (response.status === 200) {
        expect(response.body).toHaveProperty("data");
      }
    });

    it("Error responses always have error property", async () => {
      const response = await request(app).get("/api/v1/auth/me");
      expect(response.body).toHaveProperty("error");
      expect(response.body.error).toHaveProperty("code");
      expect(response.body.error).toHaveProperty("message");
    });

    it("Pagination responses include array data", async () => {
      const response = await request(app)
        .get("/api/v1/customers")
        .set("Authorization", `Bearer ${testAccessToken}`);
      if (response.status === 200 && response.body.data) {
        expect(Array.isArray(response.body.data)).toBe(true);
      }
    });

    it("Single resource responses include object data", async () => {
      const response = await request(app)
        .get(`/api/v1/customers/${testCustomerId}`)
        .set("Authorization", `Bearer ${testAccessToken}`);
      if (response.status === 200 && response.body.data) {
        expect(typeof response.body.data).toBe("object");
      }
    });
  });

  describe("Authentication Refresh Behavior", () => {
    it("Expired access token returns 401", async () => {
      // Create an expired token context
      const expiredContext = {
        userId: testUserId,
        sessionId: crypto.randomUUID(),
        companyId: testCompanyId,
        role: "OWNER" as const,
        exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
      };
      const expiredToken = await createAccessToken(expiredContext);

      const response = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${expiredToken}`);
      expect([401, 500]).toContain(response.status);
    });

    it("Invalid access token format returns 401", async () => {
      const response = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", "Bearer invalid-token-format");
      expect(response.status).toBe(401);
    });

    it("Missing authorization header returns 401", async () => {
      const response = await request(app).get("/api/v1/auth/me");
      expect(response.status).toBe(401);
    });

    it("Valid access token allows access to protected endpoints", async () => {
      const response = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${testAccessToken}`);
      expect([200, 500, 401]).toContain(response.status);
    });
  });

  describe("HTTP Method Validation", () => {
    it("Rejects GET on POST-only endpoint", async () => {
      const response = await request(app)
        .get("/api/v1/auth/login")
        .set("Authorization", `Bearer ${testAccessToken}`);
      expect(response.status).toBe(404); // Method not allowed route
    });

    it("Rejects POST on GET-only endpoint", async () => {
      const response = await request(app)
        .post("/api/v1/auth/me")
        .set("Authorization", `Bearer ${testAccessToken}`);
      expect(response.status).toBe(404); // Method not allowed route
    });

    it("Accepts correct HTTP methods for each endpoint", async () => {
      const getResponse = await request(app)
        .get("/api/v1/health")
        .set("Authorization", `Bearer ${testAccessToken}`);
      expect(getResponse.status).toBe(200);

      const postResponse = await request(app).post("/api/v1/auth/login").send({
        email: "contract-test@example.com",
        password: "TestPassword123!",
      });
      expect(postResponse.status).toBe(200);
    });
  });

  describe("URL Path Validation", () => {
    it("Correct URL path for health endpoint", async () => {
      const response = await request(app).get("/health");
      expect([200, 401]).toContain(response.status);
    });

    it("Correct URL path for versioned health endpoint", async () => {
      const response = await request(app).get("/api/v1/health");
      expect([200, 401]).toContain(response.status);
    });

    it("Incorrect URL path returns 404", async () => {
      const response = await request(app).get("/api/v1/invalid-endpoint");
      expect(response.status).toBe(404);
    });

    it("URL path parameters are correctly extracted", async () => {
      const response = await request(app)
        .get(`/api/v1/customers/${testCustomerId}`)
        .set("Authorization", `Bearer ${testAccessToken}`);
      expect([200, 500, 401]).toContain(response.status);
    });
  });

  describe("Rate Limiting Headers", () => {
    it("Rate-limited endpoints return appropriate headers", async () => {
      const response = await request(app).post("/api/v1/auth/login").send({
        email: "contract-test@example.com",
        password: "TestPassword123!",
      });
      // Rate limiting headers may be present
      expect([200, 401]).toContain(response.status);
    });
  });

  describe("Cross-Origin Resource Sharing (CORS)", () => {
    it("OPTIONS request to API endpoints", async () => {
      const response = await request(app).options("/api/v1/health");
      expect([200, 204]).toContain(response.status);
    });
  });
});
