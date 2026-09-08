import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const app = buildApp();
const customerId = "00000000-0000-0000-0000-000000000000";

describe("customer portal API boundaries", () => {
  it("requires staff authentication to create portal access", async () => {
    const response = await request(app).post(
      `/api/v1/customers/${customerId}/portal-access`,
    );

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_SESSION_EXPIRED");
  });
});
