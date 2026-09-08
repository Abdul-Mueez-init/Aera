import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const app = buildApp();
const invoiceId = "00000000-0000-0000-0000-000000000000";
const jobId = "00000000-0000-0000-0000-000000000001";

describe("invoice and payment API boundaries", () => {
  it("requires manager authentication to generate an invoice", async () => {
    const response = await request(app).post(`/api/v1/invoices/from-job/${jobId}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_SESSION_EXPIRED");
  });

  it("requires manager authentication to issue an invoice", async () => {
    const response = await request(app).post(`/api/v1/invoices/${invoiceId}/issue`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_SESSION_EXPIRED");
  });

  it("requires manager authentication to read payment history", async () => {
    const response = await request(app).get(
      `/api/v1/invoices/${invoiceId}/payments`,
    );

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_SESSION_EXPIRED");
  });

  it("requires manager authentication before accepting payments", async () => {
    const response = await request(app)
      .post(`/api/v1/invoices/${invoiceId}/payments`)
      .set("Idempotency-Key", "payment-test-001")
      .send({
        amountMinor: 1000,
        currency: "USD",
        method: "CARD",
      });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_SESSION_EXPIRED");
  });
});
