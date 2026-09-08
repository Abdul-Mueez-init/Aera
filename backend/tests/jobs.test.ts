import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const app = buildApp();

describe("job API boundaries", () => {
  it("rejects unauthenticated job listing", async () => {
    const response = await request(app).get("/api/v1/jobs");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_SESSION_EXPIRED");
  });

  it("rejects unauthenticated status commands", async () => {
    const response = await request(app)
      .post("/api/v1/jobs/00000000-0000-0000-0000-000000000000/status")
      .send({ status: "SCHEDULED" });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_SESSION_EXPIRED");
  });

  it("rejects unauthenticated technician Today requests", async () => {
    const response = await request(app)
      .get("/api/v1/jobs/today")
      .query({ date: "2026-09-08" });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_SESSION_EXPIRED");
  });

  it("rejects unauthenticated execution commands", async () => {
    const jobId = "00000000-0000-0000-0000-000000000000";
    const [photo, parts, completion] = await Promise.all([
      request(app).post(`/api/v1/jobs/${jobId}/photos`).send({}),
      request(app).post(`/api/v1/jobs/${jobId}/parts`).send({}),
      request(app).post(`/api/v1/jobs/${jobId}/complete`).send({}),
    ]);

    for (const response of [photo, parts, completion]) {
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("AUTH_SESSION_EXPIRED");
    }
  });
});
