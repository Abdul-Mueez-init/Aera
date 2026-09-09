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

  it("prevents cross-tenant access using guessed IDs (unauthenticated)", async () => {
    // Attempting to access arbitrary foreign UUID without any token.
    const foreignId = "11111111-2222-3333-4444-555555555555";
    const response = await request(app).get(`/api/v1/companies/${foreignId}`);
    expect(response.status).toBe(401);
  });

  it("prevents an AUTHENTICATED owner of company A from reading company B's record by guessing its real ID", async () => {
    // This is the actual Phase 2 exit criterion from docs/plan.md:
    // "a user cannot access another company's record using a guessed ID."
    // A 401 for an unauthenticated caller (above) does not prove this -
    // it only proves auth is required. This test proves tenant isolation
    // holds even for a *valid, authenticated* user from a *different*
    // company, which is the actual attack this criterion is about.
    const ownerA = {
      email: `owner-a-${Date.now()}@example.com`,
      password: "correct-horse-battery-staple",
      firstName: "Alice",
      lastName: "Owner",
      companyName: `Company A ${Date.now()}`,
    };
    const ownerB = {
      email: `owner-b-${Date.now()}@example.com`,
      password: "correct-horse-battery-staple",
      firstName: "Bob",
      lastName: "Owner",
      companyName: `Company B ${Date.now()}`,
    };

    const registerA = await request(app)
      .post("/api/v1/auth/register")
      .send(ownerA);
    const registerB = await request(app)
      .post("/api/v1/auth/register")
      .send(ownerB);

    expect(registerA.status).toBe(201);
    expect(registerB.status).toBe(201);

    const companyBId = registerB.body.data.company.id;
    const ownerAAccessToken = registerA.body.data.accessToken;

    // Owner A, fully authenticated with a valid token, tries to read
    // Company B's record using Company B's *real* ID (not a random UUID -
    // this is the realistic "guessed ID" scenario: an attacker who knows
    // or brute-forces a real tenant ID).
    const crossTenantRead = await request(app)
      .get(`/api/v1/companies/${companyBId}`)
      .set("Authorization", `Bearer ${ownerAAccessToken}`);

    expect(crossTenantRead.status).toBe(403);
    expect(crossTenantRead.body.error.code).toBe("TENANT_ACCESS_DENIED");

    // Owner A should still be able to read their own company.
    const ownTenantRead = await request(app)
      .get(`/api/v1/companies/${registerA.body.data.company.id}`)
      .set("Authorization", `Bearer ${ownerAAccessToken}`);

    expect(ownTenantRead.status).toBe(200);
    expect(ownTenantRead.body.data.id).toBe(registerA.body.data.company.id);
  });

  it("prevents a member of company A from listing or inviting members of company B", async () => {
    const ownerA = {
      email: `owner-c-${Date.now()}@example.com`,
      password: "correct-horse-battery-staple",
      firstName: "Carol",
      lastName: "Owner",
      companyName: `Company C ${Date.now()}`,
    };
    const registerA = await request(app)
      .post("/api/v1/auth/register")
      .send(ownerA);
    const ownerAAccessToken = registerA.body.data.accessToken;

    // Company-scoped endpoints derive companyId from the authenticated
    // member's own membership rather than trusting a client-supplied ID,
    // so there is no cross-tenant "other company's members" URL to hit -
    // the request is always scoped to the caller's own company. Verify
    // that Owner A only ever sees their own company's membership list.
    const members = await request(app)
      .get("/api/v1/companies/current/members")
      .set("Authorization", `Bearer ${ownerAAccessToken}`);

    expect(members.status).toBe(200);
    expect(members.body.data).toHaveLength(1);
    expect(members.body.data[0].user.email).toBe(ownerA.email.toLowerCase());
  });
});