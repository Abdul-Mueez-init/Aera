import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";

const app = buildApp();
const customerId = "00000000-0000-0000-0000-000000000000";

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

async function createCustomerWithAddress(auth: { Authorization: string }) {
  const customer = await request(app)
    .post("/api/v1/customers")
    .set(auth)
    .send({ firstName: "Bilal", lastName: "Ahmed" });
  expect(customer.status).toBe(201);
  const address = await request(app)
    .post(`/api/v1/customers/${customer.body.data.id}/addresses`)
    .set(auth)
    .send({
      label: "Home",
      line1: "House 9, Block C",
      city: "Lahore",
      countryCode: "PK",
    });
  expect(address.status).toBe(201);
  return {
    customerId: customer.body.data.id as string,
    serviceAddressId: address.body.data.id as string,
  };
}

async function createJob(
  auth: { Authorization: string },
  customerId: string,
  serviceAddressId: string,
) {
  const job = await request(app)
    .post("/api/v1/jobs")
    .set(auth)
    .send({
      customerId,
      serviceAddressId,
      serviceType: "AC Repair",
      problemDescription: "Unit not cooling",
    });
  expect(job.status).toBe(201);
  return job.body.data.id as string;
}

async function completeJobFlow(auth: { Authorization: string }, jobId: string) {
  for (const status of ["SCHEDULED", "EN_ROUTE", "IN_PROGRESS"]) {
    const transition = await request(app)
      .post(`/api/v1/jobs/${jobId}/status`)
      .set(auth)
      .send({ status });
    expect(transition.status).toBe(200);
  }
  const completion = await request(app)
    .post(`/api/v1/jobs/${jobId}/complete`)
    .set(auth)
    .send({ summary: "Replaced capacitor, verified cooling restored." });
  expect(completion.status).toBe(200);
}

async function issuePortalToken(
  auth: { Authorization: string },
  customerId: string,
) {
  const portal = await request(app)
    .post(`/api/v1/customers/${customerId}/portal-access`)
    .set(auth)
    .send({});
  expect(portal.status).toBe(201);
  return portal.body.data.token as string;
}

describe("customer portal API boundaries", () => {
  it("requires staff authentication to create portal access", async () => {
    const response = await request(app).post(
      `/api/v1/customers/${customerId}/portal-access`,
    );

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_SESSION_EXPIRED");
  });
});

describe("public portal access (Phase 9)", () => {
  it("resolves a valid token with customer, job, quote, and invoice data", async () => {
    const { accessToken } = await registerOwner("portal-happy");
    const auth = { Authorization: `Bearer ${accessToken}` };
    const { customerId, serviceAddressId } =
      await createCustomerWithAddress(auth);
    await createJob(auth, customerId, serviceAddressId);
    const token = await issuePortalToken(auth, customerId);

    const publicPortal = await request(app).get(`/api/v1/portal/${token}`);
    expect(publicPortal.status).toBe(200);
    expect(publicPortal.body.data.id).toBe(customerId);
    expect(Array.isArray(publicPortal.body.data.jobs)).toBe(true);
    expect(publicPortal.body.data.jobs.length).toBeGreaterThan(0);
    expect(Array.isArray(publicPortal.body.data.serviceAddresses)).toBe(true);
  });

  it("rejects a garbage/nonexistent token", async () => {
    const response = await request(app).get("/api/v1/portal/not-a-real-token");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("PORTAL_ACCESS_EXPIRED");
  });

  it("rejects an expired token", async () => {
    const { accessToken } = await registerOwner("portal-expired");
    const auth = { Authorization: `Bearer ${accessToken}` };
    const { customerId } = await createCustomerWithAddress(auth);
    const token = await issuePortalToken(auth, customerId);

    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + 31 * 24 * 60 * 60 * 1000);
      const response = await request(app).get(`/api/v1/portal/${token}`);
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("PORTAL_ACCESS_EXPIRED");
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects issuing a portal token for another company's customer", async () => {
    const companyA = await registerOwner("portal-a");
    const companyB = await registerOwner("portal-b");
    const { customerId: customerBId } = await createCustomerWithAddress({
      Authorization: `Bearer ${companyB.accessToken}`,
    });

    const portal = await request(app)
      .post(`/api/v1/customers/${customerBId}/portal-access`)
      .set({ Authorization: `Bearer ${companyA.accessToken}` })
      .send({});
    expect(portal.status).toBe(404);
  });
});

describe("public review submission (Phase 9)", () => {
  it("accepts a review for a completed job via a valid portal token", async () => {
    const { accessToken } = await registerOwner("review-happy");
    const auth = { Authorization: `Bearer ${accessToken}` };
    const { customerId, serviceAddressId } =
      await createCustomerWithAddress(auth);
    const jobId = await createJob(auth, customerId, serviceAddressId);
    await completeJobFlow(auth, jobId);
    const token = await issuePortalToken(auth, customerId);

    const review = await request(app)
      .post(`/api/v1/portal/${token}/reviews`)
      .send({ jobId, rating: 5, comment: "Fast and professional." });
    expect(review.status).toBe(201);
    expect(review.body.data.rating).toBe(5);
    expect(review.body.data.comment).toBe("Fast and professional.");
  });

  it("rejects a duplicate review for the same job", async () => {
    const { accessToken } = await registerOwner("review-duplicate");
    const auth = { Authorization: `Bearer ${accessToken}` };
    const { customerId, serviceAddressId } =
      await createCustomerWithAddress(auth);
    const jobId = await createJob(auth, customerId, serviceAddressId);
    await completeJobFlow(auth, jobId);
    const token = await issuePortalToken(auth, customerId);

    const first = await request(app)
      .post(`/api/v1/portal/${token}/reviews`)
      .send({ jobId, rating: 4 });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post(`/api/v1/portal/${token}/reviews`)
      .send({ jobId, rating: 2, comment: "Changed my mind" });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("REVIEW_ALREADY_SUBMITTED");
  });

  it("rejects a review for a job that is not completed", async () => {
    const { accessToken } = await registerOwner("review-ineligible");
    const auth = { Authorization: `Bearer ${accessToken}` };
    const { customerId, serviceAddressId } =
      await createCustomerWithAddress(auth);
    const jobId = await createJob(auth, customerId, serviceAddressId);
    const token = await issuePortalToken(auth, customerId);

    const review = await request(app)
      .post(`/api/v1/portal/${token}/reviews`)
      .send({ jobId, rating: 3 });
    expect(review.status).toBe(422);
    expect(review.body.error.code).toBe("REVIEW_JOB_NOT_ELIGIBLE");
  });

  it("rejects a review submitted with an invalid/expired token", async () => {
    const { accessToken } = await registerOwner("review-badtoken");
    const auth = { Authorization: `Bearer ${accessToken}` };
    const { customerId, serviceAddressId } =
      await createCustomerWithAddress(auth);
    const jobId = await createJob(auth, customerId, serviceAddressId);
    await completeJobFlow(auth, jobId);

    const review = await request(app)
      .post("/api/v1/portal/not-a-real-token/reviews")
      .send({ jobId, rating: 5 });
    expect(review.status).toBe(401);
    expect(review.body.error.code).toBe("PORTAL_ACCESS_EXPIRED");
  });

  it("rejects a review with an out-of-range rating before it ever reaches the service", async () => {
    const { accessToken } = await registerOwner("review-validation");
    const auth = { Authorization: `Bearer ${accessToken}` };
    const { customerId, serviceAddressId } =
      await createCustomerWithAddress(auth);
    const jobId = await createJob(auth, customerId, serviceAddressId);
    await completeJobFlow(auth, jobId);
    const token = await issuePortalToken(auth, customerId);

    const review = await request(app)
      .post(`/api/v1/portal/${token}/reviews`)
      .send({ jobId, rating: 6 });
    expect(review.status).toBe(422);
    expect(review.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("rejects a review for a job that does not belong to the token's customer", async () => {
    const owner = await registerOwner("review-cross-customer");
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const customerOne = await createCustomerWithAddress(auth);
    const customerTwo = await createCustomerWithAddress(auth);
    const jobForCustomerOne = await createJob(
      auth,
      customerOne.customerId,
      customerOne.serviceAddressId,
    );
    await completeJobFlow(auth, jobForCustomerOne);
    const tokenForCustomerTwo = await issuePortalToken(
      auth,
      customerTwo.customerId,
    );

    const review = await request(app)
      .post(`/api/v1/portal/${tokenForCustomerTwo}/reviews`)
      .send({ jobId: jobForCustomerOne, rating: 5 });
    expect(review.status).toBe(422);
    expect(review.body.error.code).toBe("REVIEW_JOB_NOT_ELIGIBLE");
  });
});