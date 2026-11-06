/**
 * Phase 7 flag-off contract: with ONLINE_PAYMENTS_ENABLED and
 * DEPOSITS_ENABLED unset (default false), portal pay, webhooks and the
 * deposit gate are all dark.
 */
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

process.env.QUOTE_BEFORE_JOB_ENABLED = "true";
process.env.REQUESTS_ENABLED = "true";
process.env.WORKSPACE_PORTAL_ENABLED = "true";

type App = ReturnType<(typeof import("../src/app.js"))["buildApp"]>;
type PrismaClient = (typeof import("../src/db/prisma.js"))["prisma"];

let app: App;
let prisma: PrismaClient;

beforeAll(async () => {
  app = (await import("../src/app.js")).buildApp();
  prisma = (await import("../src/db/prisma.js")).prisma;
}, 60000);

describe("phase 7 disabled", () => {
  it("portal pay and webhook routes are 404", async () => {
    const pay = await request(app)
      .post("/api/v1/portal/invoices/00000000-0000-0000-0000-000000000000/pay")
      .set({ "X-Aera-Portal": "1" })
      .send({});
    expect(pay.status).toBe(401); // no session at all

    const webhook = await request(app)
      .post("/api/v1/payments/webhook/sandbox")
      .set("content-type", "application/json")
      .send("{}");
    expect(webhook.status).toBe(404);
  });

  it("deposit terms are ignored by the acceptance gate", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({
        email: `p7off-${Date.now()}@example.com`,
        password: "correct-horse-battery-staple",
        firstName: "Off",
        lastName: "Flags",
        companyName: `P7Off ${Date.now()}`,
      });
    expect(res.status).toBe(201);
    const companyId = res.body.data.company.id as string;
    const auth = { Authorization: `Bearer ${res.body.data.accessToken}` };
    const customer = await prisma.customer.create({
      data: {
        companyId,
        firstName: "C",
        lastName: "U",
        email: `cu-${Date.now()}@example.com`,
      },
    });
    const address = await prisma.serviceAddress.create({
      data: {
        companyId,
        customerId: customer.id,
        label: "Home",
        line1: "1 Main",
        city: "Austin",
        countryCode: "US",
      },
    });
    const req = await prisma.serviceRequest.create({
      data: {
        companyId,
        customerId: customer.id,
        serviceAddressId: address.id,
        requestNumber: 1,
        title: "t",
        description: "d",
        serviceCategory: "HVAC",
        source: "STAFF_DIRECT",
        status: "SUBMITTED",
      },
    });
    const quote = await request(app)
      .post("/api/v1/quotes")
      .set(auth)
      .send({
        customerId: customer.id,
        serviceRequestId: req.id,
        currency: "USD",
        depositType: "FIXED",
        depositValue: 1000,
        items: [{ description: "x", quantity: "1", unitPriceMinor: 5000 }],
      });
    expect(quote.status).toBe(201);
    await request(app)
      .post(`/api/v1/quotes/${quote.body.data.id}/send`)
      .set(auth);
    // Staff-side approval bypasses portal gates anyway; the DepositGate
    // must not fire with the flag off — acceptance creates the job
    // immediately instead of a DEPOSIT invoice.
    const approved = await request(app)
      .post(`/api/v1/quotes/${quote.body.data.id}/respond`)
      .set(auth)
      .send({ action: "APPROVED", reason: "ok" });
    expect(approved.status).toBe(200);
    const depositInvoices = await prisma.invoice.count({
      where: { companyId, kind: "DEPOSIT" },
    });
    expect(depositInvoices).toBe(0);
    const job = await prisma.job.findFirst({
      where: { sourceQuoteId: quote.body.data.id },
    });
    expect(job).not.toBeNull();
  });
});
