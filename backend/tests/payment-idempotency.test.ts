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

async function completeJob(
  ownerAccessToken: string,
  jobId: string,
  companyId: string,
) {
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

  // EN_ROUTE -> IN_PROGRESS via /status is closed by the handshake gate
  // (422 HANDSHAKE_REQUIRED for every role); staff start the job through
  // the audited override command instead.
  const startRes = await request(app)
    .post(`/api/v1/jobs/${jobId}/start/override`)
    .set("Authorization", `Bearer ${ownerAccessToken}`)
    .send({ reason: "Test flow start override" });
  expect(startRes.status).toBe(200);

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

describe("Audit fixes: payment validation and operation recovery", () => {
  /** An ISSUED invoice with a real $100.00 balance, built on the zero-amount flow. */
  async function createIssuedInvoiceWithBalance(label: string) {
    const owner = await registerOwner(label);
    const { customerId, addressId } = await createCustomerAndAddress(
      owner.accessToken,
    );
    const job = await createJob(owner.accessToken, customerId, addressId);
    await completeJob(owner.accessToken, job.id, owner.companyId);
    const invoice = await createInvoice(owner.accessToken, job.id);
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        subtotalMinor: 10000n,
        totalMinor: 10000n,
        balanceDueMinor: 10000n,
      },
    });
    const issueRes = await request(app)
      .post(`/api/v1/invoices/${invoice.id}/issue`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({});
    expect(issueRes.status).toBe(200);
    return { owner, invoiceId: invoice.id as string };
  }

  function pay(
    accessToken: string,
    invoiceId: string,
    key: string,
    amountMinor: number,
  ) {
    return request(app)
      .post(`/api/v1/invoices/${invoiceId}/payments`)
      .set("Authorization", `Bearer ${accessToken}`)
      .set("idempotency-key", key)
      .send({ amountMinor, currency: "USD", method: "CASH" });
  }

  async function operationFor(key: string) {
    return prisma.paymentOperation.findFirst({
      where: { idempotencyKey: key },
    });
  }

  it("rejects an overpayment before creating any operation, and the same key stays usable", async () => {
    const { owner, invoiceId } = await createIssuedInvoiceWithBalance(
      "audit-overpay",
    );
    const key = `audit-overpay-${Date.now()}`;

    const overpay = await pay(owner.accessToken, invoiceId, key, 10001);
    expect(overpay.status).toBe(422);
    expect(overpay.body.error.code).toBe("PAYMENT_EXCEEDS_BALANCE_DUE");
    expect(await operationFor(key)).toBeNull();

    const exact = await pay(owner.accessToken, invoiceId, key, 10000);
    expect(exact.status).toBe(201);
    expect(exact.body.data.balanceDueMinor).toBe("0");
    expect(exact.body.data.status).toBe("PAID");
  });

  it("rejects a $0 payment while a balance is due, without touching the invoice", async () => {
    const { owner, invoiceId } = await createIssuedInvoiceWithBalance(
      "audit-zero",
    );
    const key = `audit-zero-${Date.now()}`;

    const zero = await pay(owner.accessToken, invoiceId, key, 0);
    expect(zero.status).toBe(422);
    expect(zero.body.error.code).toBe("PAYMENT_INVALID_AMOUNT");
    expect(await operationFor(key)).toBeNull();

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    expect(invoice.status).toBe("ISSUED");
    expect(invoice.balanceDueMinor).toBe(10000n);
    expect(invoice.amountPaidMinor).toBe(0n);
  });

  it("resumes a FAILED operation with no provider payment when the client retries with the same key", async () => {
    const { owner, invoiceId } = await createIssuedInvoiceWithBalance(
      "audit-resume-failed",
    );
    const key = `audit-resume-failed-${Date.now()}`;
    await prisma.paymentOperation.create({
      data: {
        companyId: owner.companyId,
        invoiceId,
        userId: owner.user.id,
        amountMinor: 4000n,
        currency: "USD",
        method: "CASH",
        provider: "manual",
        idempotencyKey: key,
        status: "FAILED",
        retryCount: 1,
        errorMessage: "simulated earlier provider failure",
      },
    });

    const retry = await pay(owner.accessToken, invoiceId, key, 4000);
    expect(retry.status).toBe(201);
    expect(retry.body.data.amountPaidMinor).toBe("4000");
    expect(retry.body.data.balanceDueMinor).toBe("6000");

    const operation = await operationFor(key);
    expect(operation?.status).toBe("COMPLETED");
    expect(operation?.ledgerPaymentId).not.toBeNull();
  });

  it("commits a PROVIDER_ACCEPTED operation on retry without re-running the provider", async () => {
    const { owner, invoiceId } = await createIssuedInvoiceWithBalance(
      "audit-resume-accepted",
    );
    const key = `audit-resume-accepted-${Date.now()}`;
    await prisma.paymentOperation.create({
      data: {
        companyId: owner.companyId,
        invoiceId,
        userId: owner.user.id,
        amountMinor: 10000n,
        currency: "USD",
        method: "CASH",
        provider: "manual",
        providerPaymentId: "provider-took-the-money",
        idempotencyKey: key,
        status: "PROVIDER_ACCEPTED",
      },
    });

    const retry = await pay(owner.accessToken, invoiceId, key, 10000);
    expect(retry.status).toBe(201);
    expect(retry.body.data.status).toBe("PAID");

    const operation = await operationFor(key);
    expect(operation?.status).toBe("COMPLETED");
    const payment = await prisma.payment.findFirst({
      where: { invoiceId, idempotencyKey: key },
    });
    expect(payment?.providerPaymentId).toBe("provider-took-the-money");
  });

  it("refuses to silently retry an operation parked for reconciliation", async () => {
    const { owner, invoiceId } = await createIssuedInvoiceWithBalance(
      "audit-recon",
    );
    const key = `audit-recon-${Date.now()}`;
    await prisma.paymentOperation.create({
      data: {
        companyId: owner.companyId,
        invoiceId,
        userId: owner.user.id,
        amountMinor: 10000n,
        currency: "USD",
        method: "CASH",
        provider: "manual",
        providerPaymentId: "provider-took-the-money",
        idempotencyKey: key,
        status: "FAILED",
        retryCount: 1,
        errorMessage: "manual reconciliation required",
      },
    });

    const retry = await pay(owner.accessToken, invoiceId, key, 10000);
    expect(retry.status).toBe(409);
    expect(retry.body.error.code).toBe(
      "PAYMENT_OPERATION_RECONCILIATION_REQUIRED",
    );
    const payments = await prisma.payment.findMany({
      where: { invoiceId, idempotencyKey: key },
    });
    expect(payments).toHaveLength(0);
  });

  it("rejects reusing a key with a different amount on a resumable operation", async () => {
    const { owner, invoiceId } = await createIssuedInvoiceWithBalance(
      "audit-payload",
    );
    const key = `audit-payload-${Date.now()}`;
    await prisma.paymentOperation.create({
      data: {
        companyId: owner.companyId,
        invoiceId,
        userId: owner.user.id,
        amountMinor: 4000n,
        currency: "USD",
        method: "CASH",
        provider: "manual",
        idempotencyKey: key,
        status: "FAILED",
        retryCount: 1,
      },
    });

    const retry = await pay(owner.accessToken, invoiceId, key, 5000);
    expect(retry.status).toBe(409);
    expect(retry.body.error.code).toBe("PAYMENT_IDEMPOTENCY_CONFLICT");
  });

  it("concurrent submissions with the same key never produce a raw 500 and credit the invoice once", async () => {
    const { owner, invoiceId } = await createIssuedInvoiceWithBalance(
      "audit-concurrent",
    );
    const key = `audit-concurrent-${Date.now()}`;

    const [first, second] = await Promise.all([
      pay(owner.accessToken, invoiceId, key, 5000),
      pay(owner.accessToken, invoiceId, key, 5000),
    ]);

    expect(first.status).not.toBe(500);
    expect(second.status).not.toBe(500);
    expect([first.status, second.status]).toContain(201);

    const payments = await prisma.payment.findMany({
      where: { invoiceId, idempotencyKey: key },
    });
    expect(payments).toHaveLength(1);
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });
    expect(invoice.amountPaidMinor).toBe(5000n);
    expect(invoice.balanceDueMinor).toBe(5000n);
  });
});
