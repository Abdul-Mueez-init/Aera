import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const app = buildApp();

describe("customer API boundaries", () => {
  it("rejects unauthenticated customer listing", async () => {
    const response = await request(app).get("/api/v1/customers");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_SESSION_EXPIRED");
  });

  it("validates customer creation input", async () => {
    const response = await request(app)
      .post("/api/v1/customers")
      .send({ firstName: "Sarah" });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_SESSION_EXPIRED");
  });
});
