import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../src/db/prisma.js";

describe("Tenant Referential Integrity - Current Limitations", () => {
  let companyA: any;
  let companyB: any;
  let customerA: any;
  let customerB: any;
  let serviceAddressA: any;
  let serviceAddressB: any;

  beforeAll(async () => {
    // Create two companies and customers directly via Prisma
    companyA = await prisma.company.create({
      data: {
        id: crypto.randomUUID(),
        name: "Company A",
        slug: `company-a-${Date.now()}`,
        timezone: "UTC",
        defaultCurrency: "USD",
      },
    });

    companyB = await prisma.company.create({
      data: {
        id: crypto.randomUUID(),
        name: "Company B",
        slug: `company-b-${Date.now()}`,
        timezone: "UTC",
        defaultCurrency: "USD",
      },
    });

    customerA = await prisma.customer.create({
      data: {
        id: crypto.randomUUID(),
        companyId: companyA.id,
        firstName: "Customer",
        lastName: "A",
        email: "customer-a@example.com",
        phone: "555-0001",
      },
    });

    customerB = await prisma.customer.create({
      data: {
        id: crypto.randomUUID(),
        companyId: companyB.id,
        firstName: "Customer",
        lastName: "B",
        email: "customer-b@example.com",
        phone: "555-0002",
      },
    });

    serviceAddressA = await prisma.serviceAddress.create({
      data: {
        id: crypto.randomUUID(),
        companyId: companyA.id,
        customerId: customerA.id,
        label: "Home",
        line1: "123 Main St",
        city: "Springfield",
        postalCode: "12345",
        countryCode: "US",
      },
    });

    serviceAddressB = await prisma.serviceAddress.create({
      data: {
        id: crypto.randomUUID(),
        companyId: companyB.id,
        customerId: customerB.id,
        label: "Home",
        line1: "456 Oak St",
        city: "Shelbyville",
        postalCode: "54321",
        countryCode: "US",
      },
    });
  });

  afterAll(async () => {
    // Cleanup in reverse order of dependencies
    await prisma.job.deleteMany({ where: { companyId: companyA.id } });
    await prisma.job.deleteMany({ where: { companyId: companyB.id } });
    await prisma.serviceAddress.deleteMany({ where: { companyId: companyA.id } });
    await prisma.serviceAddress.deleteMany({ where: { companyId: companyB.id } });
    await prisma.customer.deleteMany({ where: { companyId: companyA.id } });
    await prisma.customer.deleteMany({ where: { companyId: companyB.id } });
    await prisma.company.deleteMany({ where: { id: companyA.id } });
    await prisma.company.deleteMany({ where: { id: companyB.id } });
  });

  describe("Job foreign key constraints", () => {
    it("should succeed when inserting job with matching companyId for all parent references", async () => {
      const job = await prisma.job.create({
        data: {
          id: crypto.randomUUID(),
          companyId: companyA.id,
          customerId: customerA.id,
          serviceAddressId: serviceAddressA.id,
          jobNumber: 99997,
          serviceType: "Test",
          problemDescription: "Test",
        },
      });

      expect(job).toBeDefined();
      expect(job.companyId).toBe(companyA.id);

      // Cleanup
      await prisma.job.delete({ where: { id: job.id } });
    });

    it("should allow direct database insert with mismatched companyId (current schema limitation)", async () => {
      // This test documents the current limitation: the database does not have
      // composite foreign keys, so cross-company inserts are technically possible
      // at the database level. Application-level scoping must prevent this.
      const job = await prisma.job.create({
        data: {
          id: crypto.randomUUID(),
          companyId: companyA.id,
          customerId: customerB.id, // Customer from Company B - DB allows this
          serviceAddressId: serviceAddressA.id,
          jobNumber: 99996,
          serviceType: "Test",
          problemDescription: "Test",
        },
      });

      expect(job).toBeDefined();
      // This demonstrates why application-level scoping is critical

      // Cleanup
      await prisma.job.delete({ where: { id: job.id } });
    });
  });

  describe("ServiceAddress foreign key constraints", () => {
    it("should allow direct database insert with mismatched companyId (current schema limitation)", async () => {
      // This test documents the current limitation
      const address = await prisma.serviceAddress.create({
        data: {
          id: crypto.randomUUID(),
          companyId: companyA.id,
          customerId: customerB.id, // Customer from Company B - DB allows this
          label: "Test",
          line1: "Test",
          city: "Test",
          postalCode: "Test",
          countryCode: "US",
        },
      });

      expect(address).toBeDefined();

      // Cleanup
      await prisma.serviceAddress.delete({ where: { id: address.id } });
    });
  });

  describe("Job child entities", () => {
    let jobA: any;

    beforeAll(async () => {
      jobA = await prisma.job.create({
        data: {
          id: crypto.randomUUID(),
          companyId: companyA.id,
          customerId: customerA.id,
          serviceAddressId: serviceAddressA.id,
          jobNumber: 99996,
          serviceType: "Test",
          problemDescription: "Test",
        },
      });
    });

    afterAll(async () => {
      await prisma.job.delete({ where: { id: jobA.id } });
    });

    it("should fail when inserting job status history with mismatched companyId and jobId", async () => {
      try {
        await prisma.jobStatusHistory.create({
          data: {
            id: crypto.randomUUID(),
            companyId: companyB.id, // Wrong company
            jobId: jobA.id, // Job from Company A
            actorUserId: crypto.randomUUID(),
            toStatus: "IN_PROGRESS",
          },
        });
        expect.fail("Should have thrown a foreign key constraint error");
      } catch (error: any) {
        // PostgreSQL foreign key violation
        expect(error.code).toBe("P2003");
      }
    });

    it("should fail when inserting job note with mismatched companyId and jobId", async () => {
      try {
        await prisma.jobNote.create({
          data: {
            id: crypto.randomUUID(),
            companyId: companyB.id, // Wrong company
            jobId: jobA.id, // Job from Company A
            authorUserId: crypto.randomUUID(),
            body: "Test note",
          },
        });
        expect.fail("Should have thrown a foreign key constraint error");
      } catch (error: any) {
        // PostgreSQL foreign key violation
        expect(error.code).toBe("P2003");
      }
    });

    it("should allow direct database insert with mismatched companyId for job parts (current schema limitation)", async () => {
      // This test documents the current limitation for job parts
      const part = await prisma.jobPart.create({
        data: {
          id: crypto.randomUUID(),
          companyId: companyB.id, // Wrong company
          jobId: jobA.id, // Job from Company A - DB allows this
          name: "Test Part",
          quantity: 1,
          unitPriceMinor: 10000,
          currency: "USD",
        },
      });

      expect(part).toBeDefined();

      // Cleanup
      await prisma.jobPart.delete({ where: { id: part.id } });
    });
  });
});
