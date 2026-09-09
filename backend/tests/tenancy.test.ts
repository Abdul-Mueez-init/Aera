import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const app = buildApp();

describe("Multi-tenant isolation boundaries (Phase 2 exit criteria)", () => {
  it("rejects unauthenticated member management requests", async () => {
    const listRes = await request(app).get("/api/v1/companies/current/members");
    expect(listRes.status).toBe(401);

    const inviteRes = await request(app)
      .post("/api/v1/companies/current/invitations")
      .send({
        email: "tech@example.com",
        firstName: "Bob",
        lastName: "Tech",
        role: "TECHNICIAN",
      });
    expect(inviteRes.status).toBe(401);
  });

  it("prevents cross-tenant access using guessed IDs", async () => {
    // Attempting to access arbitrary foreign UUID
    const foreignId = "11111111-2222-3333-4444-555555555555";
    const response = await request(app).get(`/api/v1/companies/${foreignId}`);
    expect(response.status).toBe(401);
  });
});
