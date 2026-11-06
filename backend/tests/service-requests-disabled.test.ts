/**
 * Phase 1 flag-off contract: with REQUESTS_ENABLED unset (default false) the
 * service-requests router is not mounted and staff job creation behaves
 * exactly as before — no ServiceRequest rows are written.
 */
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

// No REQUESTS_ENABLED override: env.ts defaults it to false.

type App = ReturnType<(typeof import("../src/app.js"))["buildApp"]>;
type PrismaClient = (typeof import("../src/db/prisma.js"))["prisma"];

let app: App;
let prisma: PrismaClient;

beforeAll(async () => {
  app = (await import("../src/app.js")).buildApp();
  prisma = (await import("../src/db/prisma.js")).prisma;
}, 60000);

function uniqueSuffix(label: string) {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

describe("service requests disabled (REQUESTS_ENABLED=false)", () => {
  it("does not mount the service-requests router", async () => {
    const res = await request(app).get("/api/v1/service-requests");
    expect(res.status).toBe(404);
  });

  it("creates jobs without writing service requests", async () => {
    const suffix = uniqueSuffix("flagoff");
    const register = await request(app)
      .post("/api/v1/auth/register")
      .send({
        email: `owner-${suffix}@example.com`,
        password: "correct-horse-battery-staple",
        firstName: "Owner",
        lastName: "FlagOff",
        companyName: `Company ${suffix}`,
      });
    expect(register.status).toBe(201);
    const accessToken = register.body.data.accessToken as string;
    const companyId = register.body.data.company.id as string;

    const custRes = await request(app)
      .post("/api/v1/customers")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        firstName: "Jane",
        lastName: "Customer",
        email: `customer-${suffix}@example.com`,
        phone: "+15551234567",
      });
    expect(custRes.status).toBe(201);
    const customerId = custRes.body.data.id as string;

    const addrRes = await request(app)
      .post(`/api/v1/customers/${customerId}/addresses`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        label: "Main House",
        line1: "123 Main St",
        city: "Springfield",
        countryCode: "US",
      });
    expect(addrRes.status).toBe(201);

    const jobRes = await request(app)
      .post("/api/v1/jobs")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        customerId,
        serviceAddressId: addrRes.body.data.id,
        serviceType: "HVAC Repair",
        problemDescription: "No heat",
      });
    expect(jobRes.status).toBe(201);
    expect(jobRes.body.data.serviceRequest ?? null).toBeNull();

    const requestCount = await prisma.serviceRequest.count({
      where: { companyId },
    });
    expect(requestCount).toBe(0);
  });
});
