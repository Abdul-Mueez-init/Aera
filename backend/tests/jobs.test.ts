import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
 
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
  return { accessToken: res.body.data.accessToken as string };
}
 
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