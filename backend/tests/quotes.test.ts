import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const app = buildApp();

const quoteId = "00000000-0000-0000-0000-000000000000";

describe("quote API boundaries", () => {
  it("requires manager authentication to create quotes", async () => {
    const response = await request(app).post("/api/v1/quotes").send({});

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_SESSION_EXPIRED");
  });

  it("requires manager authentication to read quote details", async () => {
    const response = await request(app).get(`/api/v1/quotes/${quoteId}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_SESSION_EXPIRED");
  });

  it("validates public approval commands before accessing persistence", async () => {
    const response = await request(app)
      .post("/api/v1/quotes/shared/example-token/respond")
      .send({ action: "MAYBE" });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_FAILED");
  });
});
