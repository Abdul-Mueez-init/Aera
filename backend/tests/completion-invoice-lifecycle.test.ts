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

async function createJob(
  auth: { Authorization: string },
  customerId: string,
  serviceAddressId: string,
) {
  const job = await request(app).post("/api/v1/jobs").set(auth).send({
    customerId,
    serviceAddressId,
    serviceType: "Heat Pump Diagnostics",
    problemDescription: "Unit freezing over in heating mode",
  });
  expect(job.status).toBe(201);
  return job.body.data.id as string;
}

async function addJobPart(
  auth: { Authorization: string },
  jobId: string,
  part: { name: string; quantity: number; unitPriceMinor: number; currency?: string },
) {
  const res = await request(app)
    .post(`/api/v1/jobs/${jobId}/parts`)
    .set(auth)
    .send({
      name: part.name,
      quantity: part.quantity,
      unitPriceMinor: part.unitPriceMinor,
      currency: part.currency ?? "USD",
    });
  expect(res.status).toBe(201);
  return res.body.data;
}

async function startJob(auth: { Authorization: string }, jobId: string) {
  // NEW -> SCHEDULED -> EN_ROUTE -> IN_PROGRESS
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

describe("Phase C3 — Completion-to-Invoice Lifecycle & Concurrency", () => {
  it("executes the full customer-to-cash lifecycle: job -> parts -> completion -> invoice -> payment", async () => {
    const owner = await registerOwner("c3-flow");
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const { customerId, serviceAddressId } = await createCustomerWithAddress(auth);
    const jobId = await createJob(auth, customerId, serviceAddressId);

    await startJob(auth, jobId);

    // Technician logs parts during work
    await addJobPart(auth, jobId, {
      name: "Defrost Control Board",
      quantity: 1,
      unitPriceMinor: 14500, // $145.00
    });
    await addJobPart(auth, jobId, {
      name: "Refrigerant R-410A (lbs)",
      quantity: 2,
      unitPriceMinor: 6500, // 2 * $65.00 = $130.00
    });

    // Complete job
    const completeRes = await request(app)
      .post(`/api/v1/jobs/${jobId}/complete`)
      .set(auth)
      .send({ summary: "Replaced defrost board and topped up 2 lbs refrigerant." });
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.data.status).toBe("COMPLETED");
    expect(completeRes.body.data.completedAt).toBeTruthy();
    expect(completeRes.body.data.completionSummary).toBe(
      "Replaced defrost board and topped up 2 lbs refrigerant.",
    );

    // Generate invoice explicitly
    const invoiceRes = await request(app)
      .post(`/api/v1/invoices/from-job/${jobId}`)
      .set(auth)
      .send();
    expect(invoiceRes.status).toBe(201);
    const invoice = invoiceRes.body.data;
    expect(invoice.jobId).toBe(jobId);
    expect(invoice.status).toBe("DRAFT");
    // $145.00 + $130.00 = $275.00 = 27500 minor units
    expect(invoice.subtotalMinor).toBe("27500");
    expect(invoice.totalMinor).toBe("27500");
    expect(invoice.balanceDueMinor).toBe("27500");
    expect(invoice.items.length).toBe(2);

    // Issue invoice
    const issueRes = await request(app)
      .post(`/api/v1/invoices/${invoice.id}/issue`)
      .set(auth);
    expect(issueRes.status).toBe(200);
    expect(issueRes.body.data.status).toBe("ISSUED");

    // Pay invoice in full
    const paymentRes = await request(app)
      .post(`/api/v1/invoices/${invoice.id}/payments`)
      .set(auth)
      .set("Idempotency-Key", `pay-${Date.now()}`)
      .send({
        amountMinor: 27500,
        currency: "USD",
        method: "CARD",
        reference: "ch_test_12345",
      });
    expect(paymentRes.status).toBe(201);
    expect(paymentRes.body.data.status).toBe("PAID");
    expect(paymentRes.body.data.balanceDueMinor).toBe("0");

    // Check that GET /api/v1/jobs/:jobId reflects linked invoice
    const jobGetRes = await request(app).get(`/api/v1/jobs/${jobId}`).set(auth);
    expect(jobGetRes.status).toBe(200);
    expect(jobGetRes.body.data.invoices).toBeDefined();
    expect(jobGetRes.body.data.invoices.length).toBe(1);
    expect(jobGetRes.body.data.invoices[0].id).toBe(invoice.id);
    expect(jobGetRes.body.data.invoices[0].status).toBe("PAID");
  });

  it("performs atomic auto-invoice generation inside job completion transaction", async () => {
    const owner = await registerOwner("c3-auto");
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const { customerId, serviceAddressId } = await createCustomerWithAddress(auth);
    const jobId = await createJob(auth, customerId, serviceAddressId);

    await startJob(auth, jobId);

    await addJobPart(auth, jobId, {
      name: "Dual Run Capacitor 45/5",
      quantity: 1,
      unitPriceMinor: 8900,
    });

    // Complete with autoInvoice: true
    const completeRes = await request(app)
      .post(`/api/v1/jobs/${jobId}/complete`)
      .set(auth)
      .send({
        summary: "Installed new dual run capacitor and verified blower motor operation.",
        autoInvoice: true,
      });
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.data.status).toBe("COMPLETED");
    expect(completeRes.body.data.invoices.length).toBe(1);
    const invoice = completeRes.body.data.invoices[0];
    expect(invoice.totalMinor).toBe("8900");
    expect(invoice.status).toBe("DRAFT");

    // Check status history audit reason
    const historyRes = await request(app)
      .get(`/api/v1/jobs/${jobId}/history`)
      .set(auth);
    expect(historyRes.status).toBe(200);
    expect(historyRes.body.data[0].reason).toContain("generated draft invoice");
  });

  it("rolls back job completion atomically when auto-invoice fails on $0 amount (leaves no ambiguous state)", async () => {
    const owner = await registerOwner("c3-rollback");
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const { customerId, serviceAddressId } = await createCustomerWithAddress(auth);
    const jobId = await createJob(auth, customerId, serviceAddressId);

    await startJob(auth, jobId);

    // Job has NO quote and NO parts ($0 total). Attempt autoInvoice without allowZeroAmountInvoice:
    const completeRes = await request(app)
      .post(`/api/v1/jobs/${jobId}/complete`)
      .set(auth)
      .send({
        summary: "Checked unit, no issues found.",
        autoInvoice: true,
      });

    // Must be rejected with 422 INVOICE_ZERO_AMOUNT
    expect(completeRes.status).toBe(422);
    expect(completeRes.body.error.code).toBe("INVOICE_ZERO_AMOUNT");

    // CRITICAL: Ensure transaction rolled back completely — job must still be IN_PROGRESS
    const jobCheck = await prisma.job.findUnique({
      where: { id: jobId },
      include: { invoices: true, statusHistory: true },
    });
    expect(jobCheck?.status).toBe("IN_PROGRESS");
    expect(jobCheck?.completedAt).toBeNull();
    expect(jobCheck?.invoices.length).toBe(0);
    // History should NOT contain COMPLETED
    const completedHistory = jobCheck?.statusHistory.find(
      (h) => h.toStatus === "COMPLETED",
    );
    expect(completedHistory).toBeUndefined();
  });

  it("rejects empty/zero-value invoice generation without explicit confirmation, but allows when confirmed", async () => {
    const owner = await registerOwner("c3-zero");
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const { customerId, serviceAddressId } = await createCustomerWithAddress(auth);
    const jobId = await createJob(auth, customerId, serviceAddressId);

    await startJob(auth, jobId);

    // Complete job manually without auto-invoice
    await request(app)
      .post(`/api/v1/jobs/${jobId}/complete`)
      .set(auth)
      .send({ summary: "Courtesy system check" });

    // 1. Calling from-job without allowZeroAmount must fail
    const rejectRes = await request(app)
      .post(`/api/v1/invoices/from-job/${jobId}`)
      .set(auth)
      .send();
    expect(rejectRes.status).toBe(422);
    expect(rejectRes.body.error.code).toBe("INVOICE_ZERO_AMOUNT");

    // 2. Calling from-job with allowZeroAmount: true must succeed
    const allowRes = await request(app)
      .post(`/api/v1/invoices/from-job/${jobId}`)
      .set(auth)
      .send({ allowZeroAmount: true });
    expect(allowRes.status).toBe(201);
    expect(allowRes.body.data.totalMinor).toBe("0");
    expect(allowRes.body.data.balanceDueMinor).toBe("0");
    expect(allowRes.body.data.items[0].description).toContain("Zero-cost / Courtesy Service");
  });

  it("handles repeated completion and invoice commands idempotently without duplicating financial records", async () => {
    const owner = await registerOwner("c3-idempotent");
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const { customerId, serviceAddressId } = await createCustomerWithAddress(auth);
    const jobId = await createJob(auth, customerId, serviceAddressId);

    await startJob(auth, jobId);
    await addJobPart(auth, jobId, {
      name: "Blower Motor 1/2 HP",
      quantity: 1,
      unitPriceMinor: 32000,
    });

    // Complete job
    const res1 = await request(app)
      .post(`/api/v1/jobs/${jobId}/complete`)
      .set(auth)
      .send({ summary: "Replaced blower motor" });
    expect(res1.status).toBe(200);

    // Repeating completion is idempotent: returns 200 with completed job
    const res2 = await request(app)
      .post(`/api/v1/jobs/${jobId}/complete`)
      .set(auth)
      .send({ summary: "Replaced blower motor" });
    expect(res2.status).toBe(200);
    expect(res2.body.data.status).toBe("COMPLETED");

    // Generate invoice
    const inv1 = await request(app)
      .post(`/api/v1/invoices/from-job/${jobId}`)
      .set(auth)
      .send();
    expect(inv1.status).toBe(201);

    // Repeating invoice generation returns the exact same invoice idempotently
    const inv2 = await request(app)
      .post(`/api/v1/invoices/from-job/${jobId}`)
      .set(auth)
      .send();
    expect(inv2.status).toBe(201);
    expect(inv2.body.data.id).toBe(inv1.body.data.id);
    expect(inv2.body.data.invoiceNumber).toBe(inv1.body.data.invoiceNumber);

    // Database check: exactly ONE invoice exists for this job
    const count = await prisma.invoice.count({
      where: { companyId: owner.companyId, jobId },
    });
    expect(count).toBe(1);
  });

  it("enforces multi-tenant isolation on invoice generation from job", async () => {
    const ownerA = await registerOwner("c3-tenant-a");
    const ownerB = await registerOwner("c3-tenant-b");
    const authA = { Authorization: `Bearer ${ownerA.accessToken}` };
    const authB = { Authorization: `Bearer ${ownerB.accessToken}` };

    const { customerId, serviceAddressId } = await createCustomerWithAddress(authA);
    const jobIdA = await createJob(authA, customerId, serviceAddressId);

    await startJob(authA, jobIdA);
    await addJobPart(authA, jobIdA, {
      name: "Air Filter 16x25x1",
      quantity: 1,
      unitPriceMinor: 2500,
    });
    await request(app)
      .post(`/api/v1/jobs/${jobIdA}/complete`)
      .set(authA)
      .send({ summary: "Replaced air filter" });

    // Company B attempts to generate invoice from Company A's job
    const crossRes = await request(app)
      .post(`/api/v1/invoices/from-job/${jobIdA}`)
      .set(authB)
      .send();
    expect(crossRes.status).toBe(404);
  });
});
