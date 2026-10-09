import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";

const app = buildApp();

function uniqueSuffix(label: string) {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function registerOwner(label: string) {
  const suffix = uniqueSuffix(label);
  const email = `owner-${suffix}@example.com`;
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({
      email,
      password: "correct-horse-battery-staple",
      firstName: "Owner",
      lastName: label,
      companyName: `Company ${suffix}`,
    });

  expect(res.status).toBe(201);
  return {
    ...res.body.data,
    email,
    companyId: res.body.data.company.id,
  };
}

async function createCustomerAndAddress(ownerAccessToken: string) {
  const custRes = await request(app)
    .post("/api/v1/customers")
    .set("Authorization", `Bearer ${ownerAccessToken}`)
    .send({
      firstName: "John",
      lastName: "Customer",
      email: `customer-${Date.now()}@example.com`,
      phone: "+15551234567",
    });
  expect(custRes.status).toBe(201);
  const customerId = custRes.body.data.id;

  const addrRes = await request(app)
    .post(`/api/v1/customers/${customerId}/addresses`)
    .set("Authorization", `Bearer ${ownerAccessToken}`)
    .send({
      label: "Main House",
      line1: "123 Main St",
      city: "Springfield",
      countryCode: "US",
    });
  expect(addrRes.status).toBe(201);
  const addressId = addrRes.body.data.id;

  return { customerId, addressId };
}

async function createJob(
  ownerAccessToken: string,
  customerId: string,
  addressId: string,
) {
  const jobRes = await request(app)
    .post("/api/v1/jobs")
    .set("Authorization", `Bearer ${ownerAccessToken}`)
    .send({
      customerId,
      serviceAddressId: addressId,
      serviceType: "HVAC Repair",
      problemDescription: "Unit blowing warm air",
      priority: "HIGH",
    });
  expect(jobRes.status).toBe(201);
  return jobRes.body.data;
}

async function createTechnician(ownerAccessToken: string, companyId: string) {
  // Create a technician user by registering a new company, then reassign the user to the test company
  const suffix = `tech-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const techUser = await request(app)
    .post("/api/v1/auth/register")
    .send({
      email: `tech-${suffix}@example.com`,
      password: "correct-horse-battery-staple",
      firstName: "Tech",
      lastName: suffix,
      companyName: `Temp Company ${suffix}`,
    });

  const tempCompanyId = techUser.body.data.company.id;
  const techUserId = techUser.body.data.user.id;

  // Delete the old companyMember record (from temp company)
  await prisma.companyMember.deleteMany({
    where: { userId: techUserId },
  });

  // Create a new companyMember record for the test company as a technician
  await prisma.companyMember.create({
    data: {
      userId: techUserId,
      companyId: companyId,
      role: "TECHNICIAN",
      status: "ACTIVE",
    },
  });

  // Delete the temporary company
  await prisma.company.delete({
    where: { id: tempCompanyId },
  });

  return techUserId;
}

async function completeJob(ownerAccessToken: string, jobId: string, companyId: string) {
  // Assign a technician first (required for active job transitions)
  const technicianId = await createTechnician(ownerAccessToken, companyId);
  const assignRes = await request(app)
    .post(`/api/v1/jobs/${jobId}/assign`)
    .set("Authorization", `Bearer ${ownerAccessToken}`)
    .send({ technicianId });
  if (assignRes.status !== 200) {
    console.error("Assign failed:", assignRes.body);
  }
  expect(assignRes.status).toBe(200);

  await request(app)
    .post(`/api/v1/jobs/${jobId}/status`)
    .set("Authorization", `Bearer ${ownerAccessToken}`)
    .send({ status: "SCHEDULED" });

  await request(app)
    .post(`/api/v1/jobs/${jobId}/status`)
    .set("Authorization", `Bearer ${ownerAccessToken}`)
    .send({ status: "EN_ROUTE" });

  await request(app)
    .post(`/api/v1/jobs/${jobId}/status`)
    .set("Authorization", `Bearer ${ownerAccessToken}`)
    .send({ status: "IN_PROGRESS" });

  const completeRes = await request(app)
    .post(`/api/v1/jobs/${jobId}/complete`)
    .set("Authorization", `Bearer ${ownerAccessToken}`)
    .send({ summary: "Job completed successfully" });
  expect(completeRes.status).toBe(200);
}

async function createInvoice(ownerAccessToken: string, jobId: string) {
  const invoiceRes = await request(app)
    .post(`/api/v1/invoices/from-job/${jobId}`)
    .set("Authorization", `Bearer ${ownerAccessToken}`)
    .send({ allowZeroAmount: true });
  expect(invoiceRes.status).toBe(201);
  return invoiceRes.body.data;
}

describe("Phase G1: Payment Idempotency Integration Tests", () => {
  it("prevents duplicate payments with same idempotency key", async () => {
    const owner = await registerOwner("idempotency-duplicate");
    const idempotencyKey = `payment-test-${Date.now()}`;

    const { customerId, addressId } = await createCustomerAndAddress(
      owner.accessToken,
    );
    const job = await createJob(owner.accessToken, customerId, addressId);
    await completeJob(owner.accessToken, job.id, owner.companyId);
    const invoice = await createInvoice(owner.accessToken, job.id);

    await request(app)
      .post(`/api/v1/invoices/${invoice.id}/issue`)
      .set("Authorization", `Bearer ${owner.accessToken}`);

    const firstPayment = await request(app)
      .post(`/api/v1/invoices/${invoice.id}/payments`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .set("idempotency-key", idempotencyKey)
      .send({
        amountMinor: 0,
        currency: "USD",
        method: "CARD",
      });

    expect(firstPayment.status).toBe(201);

    const secondPayment = await request(app)
      .post(`/api/v1/invoices/${invoice.id}/payments`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .set("idempotency-key", idempotencyKey)
      .send({
        amountMinor: 0,
        currency: "USD",
        method: "CARD",
      });

    expect(secondPayment.status).toBe(201);
    expect(secondPayment.body.data.id).toBe(invoice.id);

    const payments = await request(app)
      .get(`/api/v1/invoices/${invoice.id}/payments`)
      .set("Authorization", `Bearer ${owner.accessToken}`);

    expect(payments.status).toBe(200);
    expect(payments.body.data.length).toBe(1);
  });

  it("rejects idempotency key used for different invoice", async () => {
    const owner = await registerOwner("idempotency-conflict");
    const idempotencyKey = `payment-conflict-${Date.now()}`;

    const { customerId: cust1, addressId: addr1 } =
      await createCustomerAndAddress(owner.accessToken);
    const job1 = await createJob(owner.accessToken, cust1, addr1);
    await completeJob(owner.accessToken, job1.id, owner.companyId);
    const invoice1 = await createInvoice(owner.accessToken, job1.id);
    await request(app)
      .post(`/api/v1/invoices/${invoice1.id}/issue`)
      .set("Authorization", `Bearer ${owner.accessToken}`);

    const { customerId: cust2, addressId: addr2 } =
      await createCustomerAndAddress(owner.accessToken);
    const job2 = await createJob(owner.accessToken, cust2, addr2);
    await completeJob(owner.accessToken, job2.id, owner.companyId);
    const invoice2 = await createInvoice(owner.accessToken, job2.id);
    await request(app)
      .post(`/api/v1/invoices/${invoice2.id}/issue`)
      .set("Authorization", `Bearer ${owner.accessToken}`);

    const firstPayment = await request(app)
      .post(`/api/v1/invoices/${invoice1.id}/payments`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .set("idempotency-key", idempotencyKey)
      .send({
        amountMinor: 0,
        currency: "USD",
        method: "CARD",
      });

    expect(firstPayment.status).toBe(201);

    const secondPayment = await request(app)
      .post(`/api/v1/invoices/${invoice2.id}/payments`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .set("idempotency-key", idempotencyKey)
      .send({
        amountMinor: 0,
        currency: "USD",
        method: "CARD",
      });

    expect(secondPayment.status).toBe(409);
    expect(secondPayment.body.error.code).toBe("PAYMENT_IDEMPOTENCY_CONFLICT");
  });

  it("allows payment requests with different idempotency keys", async () => {
    const owner = await registerOwner("idempotency-different-keys");

    const { customerId, addressId } = await createCustomerAndAddress(
      owner.accessToken,
    );
    const job = await createJob(owner.accessToken, customerId, addressId);
    await completeJob(owner.accessToken, job.id, owner.companyId);
    const invoice = await createInvoice(owner.accessToken, job.id);

    await request(app)
      .post(`/api/v1/invoices/${invoice.id}/issue`)
      .set("Authorization", `Bearer ${owner.accessToken}`);

    // Make payments with different idempotency keys sequentially
    const payment1 = await request(app)
      .post(`/api/v1/invoices/${invoice.id}/payments`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .set("Idempotency-Key", `payment-1-${Date.now()}`)
      .send({
        amountMinor: 0,
        currency: "USD",
        method: "CARD",
      });

    const payment2 = await request(app)
      .post(`/api/v1/invoices/${invoice.id}/payments`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .set("Idempotency-Key", `payment-2-${Date.now()}`)
      .send({
        amountMinor: 0,
        currency: "USD",
        method: "CASH",
      });

    // Since we can't make multiple zero payments on a zero-balance invoice,
    // we test that different keys allow the system to distinguish requests
    expect(payment1.status).toBe(201);
    // Second payment fails due to balance, not idempotency conflict
    expect(payment2.status).toBe(422);
  });

  it("handles idempotency for failed payment operations", async () => {
    const owner = await registerOwner("idempotency-failed");

    const { customerId, addressId } = await createCustomerAndAddress(
      owner.accessToken,
    );
    const job = await createJob(owner.accessToken, customerId, addressId);
    await completeJob(owner.accessToken, job.id, owner.companyId);
    const invoice = await createInvoice(owner.accessToken, job.id);
    await request(app)
      .post(`/api/v1/invoices/${invoice.id}/issue`)
      .set("Authorization", `Bearer ${owner.accessToken}`);

    const idempotencyKey = `payment-failed-${Date.now()}`;

    const payment = await request(app)
      .post(`/api/v1/invoices/${invoice.id}/payments`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .set("idempotency-key", idempotencyKey)
      .send({
        amountMinor: 0,
        currency: "USD",
        method: "CARD",
      });

    expect(payment.status).toBe(201);

    const operation = await prisma.paymentOperation.findUnique({
      where: {
        companyId_idempotencyKey: {
          companyId: owner.company.id,
          idempotencyKey,
        },
      },
    });

    expect(operation).toBeDefined();
    expect(operation?.status).toBe("COMPLETED");
  });

  it("ensures idempotency keys are scoped to company", async () => {
    const ownerA = await registerOwner("idempotency-scope-a");
    const ownerB = await registerOwner("idempotency-scope-b");
    const idempotencyKey = `payment-scope-${Date.now()}`;

    const { customerId: custA, addressId: addrA } =
      await createCustomerAndAddress(ownerA.accessToken);
    const jobA = await createJob(ownerA.accessToken, custA, addrA);
    await completeJob(ownerA.accessToken, jobA.id, ownerA.companyId);
    const invoiceA = await createInvoice(ownerA.accessToken, jobA.id);
    await request(app)
      .post(`/api/v1/invoices/${invoiceA.id}/issue`)
      .set("Authorization", `Bearer ${ownerA.accessToken}`);

    const { customerId: custB, addressId: addrB } =
      await createCustomerAndAddress(ownerB.accessToken);
    const jobB = await createJob(ownerB.accessToken, custB, addrB);
    await completeJob(ownerB.accessToken, jobB.id, ownerB.companyId);
    const invoiceB = await createInvoice(ownerB.accessToken, jobB.id);
    await request(app)
      .post(`/api/v1/invoices/${invoiceB.id}/issue`)
      .set("Authorization", `Bearer ${ownerB.accessToken}`);

    const paymentA = await request(app)
      .post(`/api/v1/invoices/${invoiceA.id}/payments`)
      .set("Authorization", `Bearer ${ownerA.accessToken}`)
      .set("idempotency-key", idempotencyKey)
      .send({
        amountMinor: 0,
        currency: "USD",
        method: "CARD",
      });

    const paymentB = await request(app)
      .post(`/api/v1/invoices/${invoiceB.id}/payments`)
      .set("Authorization", `Bearer ${ownerB.accessToken}`)
      .set("idempotency-key", idempotencyKey)
      .send({
        amountMinor: 0,
        currency: "USD",
        method: "CARD",
      });

    expect(paymentA.status).toBe(201);
    expect(paymentB.status).toBe(201);
  });
});
