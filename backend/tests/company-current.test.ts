import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const app = buildApp();

function uniqueSuffix(label: string) {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function registerOwner(label: string) {
  const suffix = uniqueSuffix(label);
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({
      email: `owner-${suffix}@example.com`,
      password: "correct-horse-battery-staple",
      firstName: "Owner",
      lastName: label,
      companyName: `Company ${suffix}`,
    });

  expect(res.status).toBe(201);
  return res.body.data;
}

describe("GET /api/v1/companies/current", () => {
  it("rejects requests without a token", async () => {
    const res = await request(app).get("/api/v1/companies/current");
    expect(res.status).toBe(401);
  });

  it("returns the caller's own company with only the public fields", async () => {
    const owner = await registerOwner("current-own");

    const res = await request(app)
      .get("/api/v1/companies/current")
      .set("Authorization", `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(owner.company.id);
    expect(res.body.data.name).toBe(owner.company.name);
    expect(Object.keys(res.body.data).sort()).toEqual([
      "defaultCurrency",
      "id",
      "name",
      "slug",
      "timezone",
    ]);
  });

  it("never returns another company, even with two companies in the database", async () => {
    const ownerA = await registerOwner("current-a");
    const ownerB = await registerOwner("current-b");

    const resA = await request(app)
      .get("/api/v1/companies/current")
      .set("Authorization", `Bearer ${ownerA.accessToken}`);
    const resB = await request(app)
      .get("/api/v1/companies/current")
      .set("Authorization", `Bearer ${ownerB.accessToken}`);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    expect(resA.body.data.id).toBe(ownerA.company.id);
    expect(resB.body.data.id).toBe(ownerB.company.id);
    expect(resA.body.data.id).not.toBe(resB.body.data.id);
  });

  it("ignores a company ID sent by the client", async () => {
    const ownerA = await registerOwner("current-spoof-a");
    const ownerB = await registerOwner("current-spoof-b");

    const res = await request(app)
      .get("/api/v1/companies/current")
      .query({ companyId: ownerB.company.id })
      .set("Authorization", `Bearer ${ownerA.accessToken}`)
      .set("X-Company-Id", ownerB.company.id);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(ownerA.company.id);
  });

  it("still serves the explicit /:companyId route for the caller's own company", async () => {
    const owner = await registerOwner("current-explicit");

    const res = await request(app)
      .get(`/api/v1/companies/${owner.company.id}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(owner.company.id);
  });
});

describe("PATCH /api/v1/companies/current", () => {
  it("rejects requests without a token", async () => {
    const res = await request(app)
      .patch("/api/v1/companies/current")
      .send({ name: "New Name" });
    expect(res.status).toBe(401);
  });

  it("rejects requests from non-owners", async () => {
    const owner = await registerOwner("patch-owner");
    const suffix = uniqueSuffix("patch-dispatcher");
    const dispatcherRes = await request(app)
      .post("/api/v1/companies/current/invitations")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({
        email: `dispatcher-${suffix}@example.com`,
        firstName: "Dispatcher",
        lastName: "Test",
        role: "DISPATCHER",
      });
    expect(dispatcherRes.status).toBe(201);

    // Accept the invitation to create an active dispatcher
    // The user is newly created, so they set their password
    const dispatcherAuth = await request(app)
      .post("/api/v1/auth/accept-invitation")
      .send({
        token: dispatcherRes.body.data.invitationToken,
        password: "correct-horse-battery-staple",
      });
    expect(dispatcherAuth.status).toBe(200);

    const res = await request(app)
      .patch("/api/v1/companies/current")
      .set("Authorization", `Bearer ${dispatcherAuth.body.data.accessToken}`)
      .send({ name: "New Name" });
    expect(res.status).toBe(403);
  });

  it("allows owners to update company name", async () => {
    const owner = await registerOwner("patch-name");

    const res = await request(app)
      .patch("/api/v1/companies/current")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ name: "Updated Company Name" });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Updated Company Name");
    expect(res.body.data.id).toBe(owner.company.id);
  });

  it("allows owners to update timezone", async () => {
    const owner = await registerOwner("patch-timezone");

    const res = await request(app)
      .patch("/api/v1/companies/current")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ timezone: "America/New_York" });

    expect(res.status).toBe(200);
    expect(res.body.data.timezone).toBe("America/New_York");
  });

  it("allows owners to update currency", async () => {
    const owner = await registerOwner("patch-currency");

    const res = await request(app)
      .patch("/api/v1/companies/current")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ defaultCurrency: "EUR" });

    expect(res.status).toBe(200);
    expect(res.body.data.defaultCurrency).toBe("EUR");
  });

  it("validates that at least one field is provided", async () => {
    const owner = await registerOwner("patch-validation");

    const res = await request(app)
      .patch("/api/v1/companies/current")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({});

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("validates currency is 3 characters", async () => {
    const owner = await registerOwner("patch-currency-validation");

    const res = await request(app)
      .patch("/api/v1/companies/current")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ defaultCurrency: "US" });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
  });
});
