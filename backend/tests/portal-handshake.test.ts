import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../src/db/prisma.js";
import {
  verifyHandshakeCode,
  overrideHandshake,
  regenerateHandshakeCode,
} from "../src/modules/portal/portal-handshake.service.js";
import { deriveHandshakeCode } from "../src/modules/portal/portal.tokens.js";
import { env } from "../src/config/env.js";

describe("Handshake Service", () => {
  let companyId: string;
  let customerId: string;
  let serviceAddressId: string;

  beforeEach(async () => {
    await prisma.$transaction([
      prisma.portalAuditEvent.deleteMany(),
      prisma.job.deleteMany(),
      prisma.customer.deleteMany(),
      prisma.company.deleteMany(),
    ]);

    const company = await prisma.company.create({
      data: {
        name: "Test Company",
        slug: "test-company",
        phone: "+1234567890",
      },
    });
    companyId = company.id;

    const customer = await prisma.customer.create({
      data: {
        companyId: company.id,
        firstName: "John",
        lastName: "Doe",
        email: "john@example.com",
        phone: "+1234567890",
      },
    });
    customerId = customer.id;

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
    serviceAddressId = serviceAddress.id;
  });

  async function createJob(overrides: Record<string, unknown> = {}) {
    return prisma.job.create({
      data: {
        companyId,
        customerId,
        serviceAddressId,
        jobNumber: 1,
        serviceType: "REPAIR",
        problemDescription: "Test problem",
        status: "EN_ROUTE",
        handshakeVersion: 1,
        ...overrides,
      },
    });
  }

  describe("verifyHandshakeCode", () => {
    it("should verify correct handshake code", async () => {
      const job = await createJob();
      const expectedCode = deriveHandshakeCode(
        env.PORTAL_CODE_SECRET || "fallback-secret-for-testing",
        companyId,
        job.id,
        1,
      );

      const result = await verifyHandshakeCode(
        companyId,
        customerId,
        job.id,
        expectedCode,
      );

      expect(result.success).toBe(true);

      // Verify job is marked as verified
      const updatedJob = await prisma.job.findUnique({
        where: { id: job.id },
        select: { handshakeVerifiedAt: true, handshakeFailedAttempts: true },
      });
      expect(updatedJob?.handshakeVerifiedAt).not.toBeNull();
      expect(updatedJob?.handshakeFailedAttempts).toBe(0);
    });

    it("should reject incorrect code", async () => {
      const job = await createJob();
      await expect(
        verifyHandshakeCode(companyId, customerId, job.id, "000000"),
      ).rejects.toThrow();

      // Verify failed attempt was recorded
      const updatedJob = await prisma.job.findUnique({
        where: { id: job.id },
        select: { handshakeFailedAttempts: true },
      });
      expect(updatedJob?.handshakeFailedAttempts).toBe(1);
    });

    it("should lock after 5 failed attempts", async () => {
      const job = await createJob();
      for (let i = 0; i < 5; i++) {
        try {
          await verifyHandshakeCode(companyId, customerId, job.id, "000000");
        } catch {
          // Expected to fail
        }
      }

      // Should be locked now
      await expect(
        verifyHandshakeCode(companyId, customerId, job.id, "000000"),
      ).rejects.toThrow();

      const updatedJob = await prisma.job.findUnique({
        where: { id: job.id },
        select: { handshakeLockedUntil: true },
      });
      expect(updatedJob?.handshakeLockedUntil).not.toBeNull();
    });

    it("should reject if job is not EN_ROUTE", async () => {
      const job = await createJob({ status: "IN_PROGRESS" });
      const expectedCode = deriveHandshakeCode(
        env.PORTAL_CODE_SECRET || "fallback-secret-for-testing",
        companyId,
        job.id,
        1,
      );

      await expect(
        verifyHandshakeCode(companyId, customerId, job.id, expectedCode),
      ).rejects.toThrow();
    });

    it("should reject if already verified", async () => {
      const job = await createJob();
      const expectedCode = deriveHandshakeCode(
        env.PORTAL_CODE_SECRET || "fallback-secret-for-testing",
        companyId,
        job.id,
        1,
      );

      await verifyHandshakeCode(companyId, customerId, job.id, expectedCode);

      // Try to verify again
      await expect(
        verifyHandshakeCode(companyId, customerId, job.id, expectedCode),
      ).rejects.toThrow();
    });
  });

  describe("overrideHandshake", () => {
    it("should override handshake verification", async () => {
      const job = await createJob();
      const context = {
        companyId,
        userId: crypto.randomUUID(),
        sessionId: "session-123",
        role: "OWNER" as const,
      };

      const result = await overrideHandshake(context, job.id, "Customer could not access phone");

      expect(result.success).toBe(true);

      // Verify job is marked as verified
      const updatedJob = await prisma.job.findUnique({
        where: { id: job.id },
        select: { handshakeVerifiedAt: true },
      });
      expect(updatedJob?.handshakeVerifiedAt).not.toBeNull();

      // Verify audit event was created
      const audit = await prisma.portalAuditEvent.findFirst({
        where: { jobId: job.id, action: "HANDSHAKE_OVERRIDE" },
      });
      expect(audit).toBeDefined();
      expect(audit?.actorUserId).toBe(context.userId);
    });

    it("should reject if job is not EN_ROUTE", async () => {
      const job = await createJob({ status: "IN_PROGRESS" });
      const context = {
        companyId,
        userId: crypto.randomUUID(),
        sessionId: "session-123",
        role: "OWNER" as const,
      };

      await expect(overrideHandshake(context, job.id)).rejects.toThrow();
    });
  });

  describe("regenerateHandshakeCode", () => {
    it("should regenerate handshake code", async () => {
      const job = await createJob();
      const context = {
        companyId,
        userId: crypto.randomUUID(),
        sessionId: "session-123",
        role: "OWNER" as const,
      };

      const result = await regenerateHandshakeCode(context, job.id);

      expect(result.success).toBe(true);
      expect(result.newVersion).toBe(2);

      // Verify job version was incremented
      const updatedJob = await prisma.job.findUnique({
        where: { id: job.id },
        select: { handshakeVersion: true, handshakeVerifiedAt: true },
      });
      expect(updatedJob?.handshakeVersion).toBe(2);
      expect(updatedJob?.handshakeVerifiedAt).toBeNull();

      // Verify audit event was created
      const audit = await prisma.portalAuditEvent.findFirst({
        where: { jobId: job.id, action: "HANDSHAKE_REGENERATED" },
      });
      expect(audit).toBeDefined();
    });

    it("should reject if job is not EN_ROUTE", async () => {
      const job = await createJob({ status: "IN_PROGRESS" });
      const context = {
        companyId,
        userId: crypto.randomUUID(),
        sessionId: "session-123",
        role: "OWNER" as const,
      };

      await expect(regenerateHandshakeCode(context, job.id)).rejects.toThrow();
    });
  });
});
