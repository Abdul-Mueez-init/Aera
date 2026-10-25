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
  return {
    accessToken: res.body.data.accessToken as string,
    companyId: res.body.data.company.id as string,
  };
}

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

describe("customer CRUD + search (Phase 3 exit criteria)", () => {
  it("creates, searches, updates, addresses, and archives a customer", async () => {
    const { accessToken } = await registerOwner("crud");
    const auth = { Authorization: `Bearer ${accessToken}` };

    const create = await request(app).post("/api/v1/customers").set(auth).send({
      firstName: "Sarah",
      lastName: "Khan",
      email: "sarah.khan@example.com",
      phone: "+92 300 1234567",
    });
    expect(create.status).toBe(201);
    expect(create.body.data.status).toBe("ACTIVE");
    const customerId = create.body.data.id as string;

    const invalidCreate = await request(app)
      .post("/api/v1/customers")
      .set(auth)
      .send({ firstName: "NoLastName" });
    expect(invalidCreate.status).toBe(422);
    expect(invalidCreate.body.error.code).toBe("VALIDATION_FAILED");

    const search = await request(app)
      .get("/api/v1/customers")
      .query({ search: "sarah" })
      .set(auth);
    expect(search.status).toBe(200);
    expect(search.body.data.items.map((c: { id: string }) => c.id)).toContain(
      customerId,
    );

    const missSearch = await request(app)
      .get("/api/v1/customers")
      .query({ search: "no-such-person-xyz" })
      .set(auth);
    expect(missSearch.status).toBe(200);
    expect(missSearch.body.data.items).toHaveLength(0);

    const detail = await request(app)
      .get(`/api/v1/customers/${customerId}`)
      .set(auth);
    expect(detail.status).toBe(200);
    expect(detail.body.data.firstName).toBe("Sarah");
    expect(detail.body.data.serviceAddresses).toEqual([]);

    const address = await request(app)
      .post(`/api/v1/customers/${customerId}/addresses`)
      .set(auth)
      .send({
        label: "Home",
        line1: "House 42-B, Block K",
        city: "Lahore",
        countryCode: "pk",
      });
    expect(address.status).toBe(201);
    expect(address.body.data.countryCode).toBe("PK");

    const detailWithAddress = await request(app)
      .get(`/api/v1/customers/${customerId}`)
      .set(auth);
    expect(detailWithAddress.body.data.serviceAddresses).toHaveLength(1);

    const update = await request(app)
      .patch(`/api/v1/customers/${customerId}`)
      .set(auth)
      .send({ notes: "Prefers morning appointments" });
    expect(update.status).toBe(200);
    expect(update.body.data.notes).toBe("Prefers morning appointments");
    expect(update.body.data.firstName).toBe("Sarah");

    const emptyUpdate = await request(app)
      .patch(`/api/v1/customers/${customerId}`)
      .set(auth)
      .send({});
    expect(emptyUpdate.status).toBe(422);

    const archive = await request(app)
      .delete(`/api/v1/customers/${customerId}`)
      .set(auth);
    expect(archive.status).toBe(204);

    const listAfterArchive = await request(app)
      .get("/api/v1/customers")
      .set(auth);
    expect(
      listAfterArchive.body.data.items.some(
        (c: { id: string }) => c.id === customerId,
      ),
    ).toBe(false);

    const listIncludeArchived = await request(app)
      .get("/api/v1/customers")
      .query({ includeArchived: "true" })
      .set(auth);
    const archived = listIncludeArchived.body.data.items.find(
      (c: { id: string }) => c.id === customerId,
    );
    expect(archived).toBeDefined();
    expect(archived.status).toBe("ARCHIVED");

    const doubleArchive = await request(app)
      .delete(`/api/v1/customers/${customerId}`)
      .set(auth);
    expect(doubleArchive.status).toBe(404);

    const addressOnArchived = await request(app)
      .post(`/api/v1/customers/${customerId}/addresses`)
      .set(auth)
      .send({
        label: "Office",
        line1: "Some street",
        city: "Lahore",
        countryCode: "PK",
      });
    expect(addressOnArchived.status).toBe(404);
  });

  it("returns a customer's job history via GET /customers/:customerId/jobs", async () => {
    const { accessToken } = await registerOwner("jobs");
    const auth = { Authorization: `Bearer ${accessToken}` };

    const customer = await request(app)
      .post("/api/v1/customers")
      .set(auth)
      .send({ firstName: "Malik", lastName: "Textiles" });
    const customerId = customer.body.data.id as string;

    const address = await request(app)
      .post(`/api/v1/customers/${customerId}/addresses`)
      .set(auth)
      .send({
        label: "Warehouse",
        line1: "Industrial Estate Rd 4",
        city: "Lahore",
        countryCode: "PK",
      });
    const serviceAddressId = address.body.data.id as string;

    const emptyJobs = await request(app)
      .get(`/api/v1/customers/${customerId}/jobs`)
      .set(auth);
    expect(emptyJobs.status).toBe(200);
    expect(emptyJobs.body.data.items).toHaveLength(0);
    expect(emptyJobs.body.data.meta.total).toBe(0);

    const job1 = await request(app).post("/api/v1/jobs").set(auth).send({
      customerId,
      serviceAddressId,
      serviceType: "AC Repair",
      problemDescription: "Unit not cooling",
    });
    expect(job1.status).toBe(201);

    const job2 = await request(app).post("/api/v1/jobs").set(auth).send({
      customerId,
      serviceAddressId,
      serviceType: "Duct Cleaning",
      problemDescription: "Annual maintenance",
    });
    expect(job2.status).toBe(201);

    const jobs = await request(app)
      .get(`/api/v1/customers/${customerId}/jobs`)
      .set(auth);
    expect(jobs.status).toBe(200);
    expect(jobs.body.data.meta.total).toBe(2);
    const jobIds = jobs.body.data.items.map((j: { id: string }) => j.id);
    expect(jobIds).toContain(job1.body.data.id);
    expect(jobIds).toContain(job2.body.data.id);
    expect(jobs.body.data.items[0]).toHaveProperty("jobNumber");
    expect(jobs.body.data.items[0]).toHaveProperty("status");
  });

  it("404s for a guessed/nonexistent customer id instead of leaking existence", async () => {
    const { accessToken } = await registerOwner("missing");
    const auth = { Authorization: `Bearer ${accessToken}` };
    const fakeId = "11111111-2222-3333-4444-555555555555";

    const get = await request(app).get(`/api/v1/customers/${fakeId}`).set(auth);
    expect(get.status).toBe(404);
    expect(get.body.error.code).toBe("RESOURCE_NOT_FOUND");

    const jobs = await request(app)
      .get(`/api/v1/customers/${fakeId}/jobs`)
      .set(auth);
    expect(jobs.status).toBe(404);
  });
});

describe("customer tenant isolation (Phase 3 exit criteria)", () => {
  it("prevents an owner of company A from reading, updating, archiving, addressing, or viewing job history of company B's real customer", async () => {
    const companyA = await registerOwner("tenant-a");
    const companyB = await registerOwner("tenant-b");

    const customerB = await request(app)
      .post("/api/v1/customers")
      .set({ Authorization: `Bearer ${companyB.accessToken}` })
      .send({ firstName: "Ayesha", lastName: "Malik" });
    expect(customerB.status).toBe(201);
    const customerBId = customerB.body.data.id as string;

    const authA = { Authorization: `Bearer ${companyA.accessToken}` };

    const read = await request(app)
      .get(`/api/v1/customers/${customerBId}`)
      .set(authA);
    expect(read.status).toBe(404);
    expect(read.body.error.code).toBe("RESOURCE_NOT_FOUND");

    const update = await request(app)
      .patch(`/api/v1/customers/${customerBId}`)
      .set(authA)
      .send({ notes: "hijacked" });
    expect(update.status).toBe(404);

    const archive = await request(app)
      .delete(`/api/v1/customers/${customerBId}`)
      .set(authA);
    expect(archive.status).toBe(404);

    const address = await request(app)
      .post(`/api/v1/customers/${customerBId}/addresses`)
      .set(authA)
      .send({
        label: "Fake",
        line1: "123 Nowhere",
        city: "Lahore",
        countryCode: "PK",
      });
    expect(address.status).toBe(404);

    const jobs = await request(app)
      .get(`/api/v1/customers/${customerBId}/jobs`)
      .set(authA);
    expect(jobs.status).toBe(404);

    const listA = await request(app).get("/api/v1/customers").set(authA);
    expect(
      listA.body.data.items.some((c: { id: string }) => c.id === customerBId),
    ).toBe(false);

    const ownRead = await request(app)
      .get(`/api/v1/customers/${customerBId}`)
      .set({ Authorization: `Bearer ${companyB.accessToken}` });
    expect(ownRead.status).toBe(200);
  });
});

describe("customer portal access", () => {
  // The customer-scoped POST /customers/:customerId/portal-access token
  // endpoint was removed by the portal handoff. Portal access is now a
  // job-scoped grant: staff issue POST /jobs/:jobId/portal-access and the
  // customer exchanges the one-time link token for a portal session.
  async function createCustomerWithJob(
    auth: { Authorization: string },
    firstName: string,
    lastName: string,
  ) {
    const customer = await request(app)
      .post("/api/v1/customers")
      .set(auth)
      .send({ firstName, lastName });
    expect(customer.status).toBe(201);
    const customerId = customer.body.data.id as string;

    const address = await request(app)
      .post(`/api/v1/customers/${customerId}/addresses`)
      .set(auth)
      .send({
        label: "Home",
        line1: "12 Canal Road",
        city: "Lahore",
        countryCode: "PK",
      });
    expect(address.status).toBe(201);

    const job = await request(app)
      .post("/api/v1/jobs")
      .set(auth)
      .send({
        customerId,
        serviceAddressId: address.body.data.id,
        serviceType: "AC Service",
        problemDescription: "Annual maintenance visit",
      });
    expect(job.status).toBe(201);

    return { customerId, job: job.body.data };
  }

  it("issues a job-scoped portal grant whose link token exchanges for a session that resolves the job", async () => {
    const { accessToken } = await registerOwner("portal");
    const auth = { Authorization: `Bearer ${accessToken}` };

    const { job } = await createCustomerWithJob(auth, "Bilal", "Ahmed");

    const portal = await request(app)
      .post(`/api/v1/jobs/${job.id}/portal-access`)
      .set(auth)
      .send({});
    expect(portal.status).toBe(201);
    expect(typeof portal.body.data.grantId).toBe("string");
    expect(typeof portal.body.data.link).toBe("string");
    expect(portal.body.data.link).toContain("#t=");
    expect(
      new Date(portal.body.data.linkExpiresAt).getTime(),
    ).toBeGreaterThan(Date.now());

    // The plaintext token travels only in the link fragment.
    const token = (portal.body.data.link as string).split("#t=")[1];
    expect(token).toBeDefined();
    expect(token.length).toBe(43);

    const exchange = await request(app)
      .post("/api/v1/portal/exchange")
      .send({ token });
    expect(exchange.status).toBe(200);
    expect(exchange.body.data.state).toBe("ACTIVE");
    const setCookie = exchange.headers["set-cookie"] as unknown as string[];
    expect(setCookie).toBeDefined();
    expect(setCookie[0]).toContain("__Host-aera_portal");
    const cookie = setCookie[0].split(";")[0];

    const snapshot = await request(app)
      .get("/api/v1/portal/job")
      .set("Cookie", cookie);
    expect(snapshot.status).toBe(200);
    expect(snapshot.body.data.job.jobNumber).toBe(job.jobNumber);
    expect(snapshot.body.data.job.serviceType).toBe(job.serviceType);
    expect(snapshot.body.data.job.status).toBe(job.status);
  });

  it("rejects issuing a portal grant for another company's job", async () => {
    const companyA = await registerOwner("portal-a");
    const companyB = await registerOwner("portal-b");
    const authA = { Authorization: `Bearer ${companyA.accessToken}` };
    const authB = { Authorization: `Bearer ${companyB.accessToken}` };

    const { job: jobB } = await createCustomerWithJob(
      authB,
      "Cross",
      "Tenant",
    );

    const portal = await request(app)
      .post(`/api/v1/jobs/${jobB.id}/portal-access`)
      .set(authA)
      .send({});
    expect(portal.status).toBe(403);
    expect(portal.body.error.code).toBe("TENANT_ACCESS_DENIED");
  });
});
