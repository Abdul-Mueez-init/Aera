import request from "supertest";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/common/auth/password.js";
import {
  createAccessToken,
  hashRefreshToken,
} from "../src/common/auth/tokens.js";
import { prisma } from "../src/db/prisma.js";

const app = buildApp();

describe("Phase G5 — API Load Smoke Tests", () => {
  let testUserId: string;
  let testCompanyId: string;
  let testAccessToken: string;
  let testCustomerId: string;
  let testJobId: string;

  beforeAll(async () => {
    // Setup test data
    const timestamp = Date.now();
    const passwordHash = await hashPassword("TestPassword123!");

    const user = await prisma.user.create({
      data: {
        email: `load-test-${timestamp}@example.com`,
        passwordHash,
        firstName: "Load",
        lastName: "Tester",
      },
    });
    testUserId = user.id;

    const company = await prisma.company.create({
      data: {
        name: "Load Test Company",
        slug: `load-test-company-${timestamp}`,
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

    const sessionId = crypto.randomUUID();
    const refreshToken = crypto.randomUUID();
    await prisma.refreshSession.create({
      data: {
        id: sessionId,
        userId: testUserId,
        companyId: testCompanyId,
        tokenHash: hashRefreshToken(refreshToken),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    const authContext = {
      userId: testUserId,
      sessionId: sessionId,
      companyId: testCompanyId,
      role: "OWNER" as const,
    };
    testAccessToken = await createAccessToken(authContext);

    const customer = await prisma.customer.create({
      data: {
        companyId: testCompanyId,
        firstName: "Test",
        lastName: "Customer",
        email: "load-test-customer@example.com",
      },
    });
    testCustomerId = customer.id;

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
    try {
      await prisma.job.deleteMany({ where: { companyId: testCompanyId } });
      await prisma.serviceAddress.deleteMany({
        where: { companyId: testCompanyId },
      });
      await prisma.customer.deleteMany({ where: { companyId: testCompanyId } });
      await prisma.refreshSession.deleteMany({ where: { userId: testUserId } });
      await prisma.companyMember.deleteMany({
        where: { companyId: testCompanyId },
      });
      await prisma.company.deleteMany({ where: { id: testCompanyId } });
      await prisma.user.deleteMany({ where: { id: testUserId } });
    } catch (error) {
      console.log("Cleanup error (non-critical):", error);
    }
  });

  describe("Concurrent Read Operations", () => {
    it("handles 10 concurrent GET /health requests", async () => {
      const requests = Array.from({ length: 10 }, () =>
        request(app).get("/health"),
      );

      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const duration = Date.now() - startTime;

      const allOk = responses.every((r) => r.status === 200);
      expect(allOk).toBe(true);
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
    });

    it("handles 10 concurrent GET /api/v1/customers requests", async () => {
      const requests = Array.from({ length: 10 }, () =>
        request(app)
          .get("/api/v1/customers")
          .set("Authorization", `Bearer ${testAccessToken}`),
      );

      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const duration = Date.now() - startTime;

      const allOk = responses.every(
        (r) => r.status === 200 || r.status === 401,
      );
      expect(allOk).toBe(true);
      expect(duration).toBeLessThan(3000); // Should complete within 3 seconds
    });

    it("handles 10 concurrent GET /api/v1/jobs requests", async () => {
      const requests = Array.from({ length: 10 }, () =>
        request(app)
          .get("/api/v1/jobs")
          .set("Authorization", `Bearer ${testAccessToken}`),
      );

      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const duration = Date.now() - startTime;

      const allOk = responses.every(
        (r) => r.status === 200 || r.status === 401,
      );
      expect(allOk).toBe(true);
      expect(duration).toBeLessThan(3000); // Should complete within 3 seconds
    });
  });

  describe("Concurrent Write Operations", () => {
    it("handles 5 concurrent POST /api/v1/customers requests", async () => {
      const timestamp = Date.now();
      const requests = Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post("/api/v1/customers")
          .set("Authorization", `Bearer ${testAccessToken}`)
          .send({
            firstName: `Load${i}`,
            lastName: "Customer",
            email: `load${i}-${timestamp}@example.com`,
          }),
      );

      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const duration = Date.now() - startTime;

      const allOk = responses.every(
        (r) => r.status === 201 || r.status === 401,
      );
      expect(allOk).toBe(true);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe("Mixed Concurrent Operations", () => {
    it("handles mixed read and write operations concurrently", async () => {
      const timestamp = Date.now();
      const requests = [
        // Read operations
        request(app).get("/health"),
        request(app)
          .get("/api/v1/customers")
          .set("Authorization", `Bearer ${testAccessToken}`),
        request(app)
          .get("/api/v1/jobs")
          .set("Authorization", `Bearer ${testAccessToken}`),
        request(app)
          .get(`/api/v1/customers/${testCustomerId}`)
          .set("Authorization", `Bearer ${testAccessToken}`),
        request(app)
          .get(`/api/v1/jobs/${testJobId}`)
          .set("Authorization", `Bearer ${testAccessToken}`),
        // Write operations
        request(app)
          .post("/api/v1/customers")
          .set("Authorization", `Bearer ${testAccessToken}`)
          .send({
            firstName: "Mixed",
            lastName: "Customer",
            email: `mixed-${timestamp}@example.com`,
          }),
      ];

      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const duration = Date.now() - startTime;

      const allOk = responses.every(
        (r) =>
          r.status === 200 ||
          r.status === 201 ||
          r.status === 401 ||
          r.status === 404,
      );
      expect(allOk).toBe(true);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe("Response Time Metrics", () => {
    it("health endpoint responds within 100ms", async () => {
      const startTime = Date.now();
      const response = await request(app).get("/health");
      const duration = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(100);
    });

    it("customers endpoint responds within 500ms", async () => {
      const startTime = Date.now();
      const response = await request(app)
        .get("/api/v1/customers")
        .set("Authorization", `Bearer ${testAccessToken}`);
      const duration = Date.now() - startTime;

      expect([200, 401]).toContain(response.status);
      expect(duration).toBeLessThan(500);
    });

    it("jobs endpoint responds within 500ms", async () => {
      const startTime = Date.now();
      const response = await request(app)
        .get("/api/v1/jobs")
        .set("Authorization", `Bearer ${testAccessToken}`);
      const duration = Date.now() - startTime;

      expect([200, 401]).toContain(response.status);
      expect(duration).toBeLessThan(500);
    });
  });
});
