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
