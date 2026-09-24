import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";

const app = buildApp();

async function registerOwner(label: string) {
  const suffix = `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const payload = {
    email: `owner-${suffix}@example.com`,
    password: "correct-horse-battery-staple",
    firstName: "Owner",
    lastName: label,
    companyName: `Company ${suffix}`,
  };
  const res = await request(app).post("/api/v1/auth/register").send(payload);
  expect(res.status).toBe(201);
  return {
    accessToken: res.body.data.accessToken as string,
    companyId: res.body.data.company.id as string,
    userId: res.body.data.user.id as string,
  };
}

async function createCustomerWithAddress(auth: { Authorization: string }) {
  const customer = await request(app)
    .post("/api/v1/customers")
    .set(auth)
    .send({ firstName: "John", lastName: "Connor" });
  expect(customer.status).toBe(201);

  const address = await request(app)
    .post(`/api/v1/customers/${customer.body.data.id}/addresses`)
    .set(auth)
    .send({
      label: "HQ",
      line1: "100 Skyline Blvd",
      city: "San Francisco",
      countryCode: "US",
    });
  expect(address.status).toBe(201);

  return {
    customerId: customer.body.data.id as string,
    serviceAddressId: address.body.data.id as string,
  };
}

async function startJob(auth: { Authorization: string }, jobId: string) {
  const s1 = await request(app)
    .post(`/api/v1/jobs/${jobId}/status`)
    .set(auth)
    .send({ status: "SCHEDULED" });
  expect(s1.status).toBe(200);

  const s2 = await request(app)
    .post(`/api/v1/jobs/${jobId}/status`)
    .set(auth)
    .send({ status: "EN_ROUTE" });
  expect(s2.status).toBe(200);

  const s3 = await request(app)
    .post(`/api/v1/jobs/${jobId}/status`)
    .set(auth)
    .send({ status: "IN_PROGRESS" });
  expect(s3.status).toBe(200);
}

describe("Phase C4 — Job and Invoice Number Allocation Concurrency", () => {
  it("generates unique job numbers under concurrent creation", async () => {
    const owner = await registerOwner("c4-job-concurrent");
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const { customerId, serviceAddressId } = await createCustomerWithAddress(auth);

    // Create 10 jobs concurrently
    const concurrentRequests = Array.from({ length: 10 }, () =>
      request(app)
        .post("/api/v1/jobs")
        .set(auth)
        .send({
          customerId,
          serviceAddressId,
          serviceType: "AC Maintenance",
          problemDescription: "Routine maintenance check",
        }),
    );

    const responses = await Promise.all(concurrentRequests);
    
    // All should succeed
    responses.forEach((res) => {
      expect(res.status).toBe(201);
      expect(res.body.data.jobNumber).toBeDefined();
    });

    // Extract job numbers
    const jobNumbers = responses.map((res) => res.body.data.jobNumber as number);
    
    // All job numbers should be unique
    const uniqueNumbers = new Set(jobNumbers);
    expect(uniqueNumbers.size).toBe(10);
    
    // Job numbers should be sequential (1-10)
    const sortedNumbers = [...uniqueNumbers].sort((a, b) => a - b);
    expect(sortedNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    // Verify database state
    const jobs = await prisma.job.findMany({
      where: { companyId: owner.companyId },
      select: { jobNumber: true },
      orderBy: { jobNumber: "asc" },
    });
    expect(jobs.length).toBe(10);
    expect(jobs.map((j) => j.jobNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("generates unique invoice numbers under concurrent creation", async () => {
    const owner = await registerOwner("c4-invoice-concurrent");
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const { customerId, serviceAddressId } = await createCustomerWithAddress(auth);

    // Create 5 jobs first
    const jobIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const job = await request(app)
        .post("/api/v1/jobs")
        .set(auth)
        .send({
          customerId,
          serviceAddressId,
          serviceType: "AC Repair",
          problemDescription: `Repair job ${i + 1}`,
        });
      expect(job.status).toBe(201);
      jobIds.push(job.body.data.id);
      
      // Start and complete each job
      await startJob(auth, job.body.data.id);
      await request(app)
        .post(`/api/v1/jobs/${job.body.data.id}/complete`)
        .set(auth)
        .send({ summary: "Completed" });
    }

    // Create invoices for all jobs concurrently
    const concurrentRequests = jobIds.map((jobId) =>
      request(app)
        .post(`/api/v1/invoices/from-job/${jobId}`)
        .set(auth)
        .send({ allowZeroAmount: true }),
    );

    const responses = await Promise.all(concurrentRequests);
    
    // All should succeed
    responses.forEach((res) => {
      expect(res.status).toBe(201);
      expect(res.body.data.invoiceNumber).toBeDefined();
    });

    // Extract invoice numbers
    const invoiceNumbers = responses.map((res) => {
      const match = res.body.data.invoiceNumber.match(/\d+/);
      return match ? Number.parseInt(match[0], 10) : 0;
    });
    
    // All invoice numbers should be unique
    const uniqueNumbers = new Set(invoiceNumbers);
    expect(uniqueNumbers.size).toBe(5);
    
    // Invoice numbers should be sequential (1-5)
    const sortedNumbers = [...uniqueNumbers].sort((a, b) => a - b);
    expect(sortedNumbers).toEqual([1, 2, 3, 4, 5]);

    // Verify database state
    const invoices = await prisma.invoice.findMany({
      where: { companyId: owner.companyId },
      select: { invoiceNumber: true },
      orderBy: { invoiceNumber: "asc" },
    });
    expect(invoices.length).toBe(5);
    
    const extractedNumbers = invoices.map((inv) => {
      const match = inv.invoiceNumber.match(/\d+/);
      return match ? Number.parseInt(match[0], 10) : 0;
    });
    expect(extractedNumbers).toEqual([1, 2, 3, 4, 5]);
  });

  it("maintains counter state correctly after sequential and concurrent operations", async () => {
    const owner = await registerOwner("c4-counter-state");
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const { customerId, serviceAddressId } = await createCustomerWithAddress(auth);

    // Create 3 jobs sequentially
    for (let i = 0; i < 3; i++) {
      const job = await request(app)
        .post("/api/v1/jobs")
        .set(auth)
        .send({
          customerId,
          serviceAddressId,
          serviceType: "Sequential Job",
          problemDescription: `Sequential ${i + 1}`,
        });
      expect(job.status).toBe(201);
      expect(job.body.data.jobNumber).toBe(i + 1);
    }

    // Create 5 jobs concurrently
    const concurrentRequests = Array.from({ length: 5 }, () =>
      request(app)
        .post("/api/v1/jobs")
        .set(auth)
        .send({
          customerId,
          serviceAddressId,
          serviceType: "Concurrent Job",
          problemDescription: "Concurrent creation",
        }),
    );

    const concurrentResponses = await Promise.all(concurrentRequests);
    concurrentResponses.forEach((res) => {
      expect(res.status).toBe(201);
    });

    // Verify counter state - should be 8 total jobs (3 sequential + 5 concurrent)
    const jobs = await prisma.job.findMany({
      where: { companyId: owner.companyId },
      select: { jobNumber: true },
      orderBy: { jobNumber: "asc" },
    });
    expect(jobs.length).toBe(8);
    expect(jobs.map((j) => j.jobNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    // Verify counter table state
    const jobCounter = await prisma.companyCounter.findUnique({
      where: {
        companyId_kind: {
          companyId: owner.companyId,
          kind: "JOB_NUMBER",
        },
      },
    });
    expect(jobCounter?.lastValue).toBe(8);
  });

  it("ensures tenant isolation in counter allocation", async () => {
    const ownerA = await registerOwner("c4-tenant-a");
    const ownerB = await registerOwner("c4-tenant-b");
    const authA = { Authorization: `Bearer ${ownerA.accessToken}` };
    const authB = { Authorization: `Bearer ${ownerB.accessToken}` };

    const { customerId: customerIdA, serviceAddressId: serviceAddressIdA } = 
      await createCustomerWithAddress(authA);
    const { customerId: customerIdB, serviceAddressId: serviceAddressIdB } = 
      await createCustomerWithAddress(authB);

    // Create jobs for both companies concurrently
    const requestsA = Array.from({ length: 3 }, () =>
      request(app)
        .post("/api/v1/jobs")
        .set(authA)
        .send({
          customerId: customerIdA,
          serviceAddressId: serviceAddressIdA,
          serviceType: "Company A Job",
          problemDescription: "Company A work",
        }),
    );

    const requestsB = Array.from({ length: 3 }, () =>
      request(app)
        .post("/api/v1/jobs")
        .set(authB)
        .send({
          customerId: customerIdB,
          serviceAddressId: serviceAddressIdB,
          serviceType: "Company B Job",
          problemDescription: "Company B work",
        }),
    );

    const [responsesA, responsesB] = await Promise.all([
      Promise.all(requestsA),
      Promise.all(requestsB),
    ]);

    // All should succeed
    responsesA.forEach((res) => expect(res.status).toBe(201));
    responsesB.forEach((res) => expect(res.status).toBe(201));

    // Each company should have job numbers 1-3
    const jobNumbersA = responsesA.map((res) => res.body.data.jobNumber).sort();
    const jobNumbersB = responsesB.map((res) => res.body.data.jobNumber).sort();
    
    expect(jobNumbersA).toEqual([1, 2, 3]);
    expect(jobNumbersB).toEqual([1, 2, 3]);

    // Verify counter states
    const counterA = await prisma.companyCounter.findUnique({
      where: {
        companyId_kind: {
          companyId: ownerA.companyId,
          kind: "JOB_NUMBER",
        },
      },
    });
    const counterB = await prisma.companyCounter.findUnique({
      where: {
        companyId_kind: {
          companyId: ownerB.companyId,
          kind: "JOB_NUMBER",
        },
      },
    });

    expect(counterA?.lastValue).toBe(3);
    expect(counterB?.lastValue).toBe(3);
  });

  it("handles unique constraint conflicts gracefully with retry logic", async () => {
    const owner = await registerOwner("c4-conflict");
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const { customerId, serviceAddressId } = await createCustomerWithAddress(auth);

    // Create a job first to establish counter
    const firstJob = await request(app)
      .post("/api/v1/jobs")
      .set(auth)
      .send({
        customerId,
        serviceAddressId,
        serviceType: "First Job",
        problemDescription: "Initial job",
      });
    expect(firstJob.status).toBe(201);
    expect(firstJob.body.data.jobNumber).toBe(1);

    // Create more jobs concurrently - should not cause conflicts
    const concurrentRequests = Array.from({ length: 5 }, () =>
      request(app)
        .post("/api/v1/jobs")
        .set(auth)
        .send({
          customerId,
          serviceAddressId,
          serviceType: "Concurrent Job",
          problemDescription: "Concurrent creation",
        }),
    );

    const responses = await Promise.all(concurrentRequests);
    
    // All should succeed without conflicts
    responses.forEach((res) => {
      expect(res.status).toBe(201);
    });

    // Verify unique job numbers
    const jobNumbers = responses.map((res) => res.body.data.jobNumber).sort();
    expect(jobNumbers).toEqual([2, 3, 4, 5, 6]);
  });
});
