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
  return res.body.data as { accessToken: string };
}

async function inviteAndAcceptTechnician(ownerAuth: { Authorization: string }) {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const invite = await request(app)
    .post("/api/v1/companies/current/invitations")
    .set(ownerAuth)
    .send({
      email: `tech-${suffix}@example.com`,
      firstName: "Tina",
      lastName: "Tech",
      role: "TECHNICIAN",
    });
  expect(invite.status).toBe(201);

  const accept = await request(app)
    .post("/api/v1/auth/accept-invitation")
    .send({
      token: invite.body.data.invitationToken,
      password: "a-brand-new-password-123",
    });
  expect(accept.status).toBe(200);
  return accept.body.data as { accessToken: string; userId?: string };
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

// Notifications are published fire-and-forget (ADR-009: a slow or failing
// notification must never fail the request that caused it), so the row can
// land just after the HTTP response returns. Poll briefly instead of assuming
// it is already there.
async function inboxWithItems(auth: { Authorization: string }) {
  let response = await request(app).get("/api/v1/notifications").set(auth);
  for (
    let attempt = 0;
    attempt < 40 && response.body.data.items.length === 0;
    attempt += 1
  ) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    response = await request(app).get("/api/v1/notifications").set(auth);
  }
  return response;
}

describe("Notifications", () => {
  it("persists a JOB_ASSIGNED notification for the assigned technician only", async () => {
    const owner = await registerOwner("assign");
    const ownerAuth = { Authorization: `Bearer ${owner.accessToken}` };
    const technician = await inviteAndAcceptTechnician(ownerAuth);
    const technicianAuth = { Authorization: `Bearer ${technician.accessToken}` };

    const { customerId, serviceAddressId } = await createCustomerWithAddress(ownerAuth);
    const job = await request(app)
      .post("/api/v1/jobs")
      .set(ownerAuth)
      .send({
        customerId,
        serviceAddressId,
        serviceType: "AC Repair",
        problemDescription: "Unit not cooling",
      });
    expect(job.status).toBe(201);

    const me = await request(app).get("/api/v1/auth/me").set(technicianAuth);
    expect(me.status).toBe(200);

    const assign = await request(app)
      .post(`/api/v1/jobs/${job.body.data.id}/assign`)
      .set(ownerAuth)
      .send({ technicianId: me.body.data.user.id });
    expect(assign.status).toBe(200);

    const technicianInbox = await inboxWithItems(technicianAuth);
    expect(technicianInbox.status).toBe(200);
    expect(technicianInbox.body.data.items).toHaveLength(1);
    expect(technicianInbox.body.data.items[0].type).toBe("JOB_ASSIGNED");
    expect(technicianInbox.body.data.items[0].payload.jobId).toBe(job.body.data.id);
    expect(technicianInbox.body.data.items[0].readAt).toBeNull();
    expect(technicianInbox.body.data.meta.unreadCount).toBe(1);

    // The owner is not the recipient of a job-assignment notification.
    const ownerInbox = await request(app).get("/api/v1/notifications").set(ownerAuth);
    expect(ownerInbox.status).toBe(200);
    expect(ownerInbox.body.data.items).toHaveLength(0);
  });

  it("notifies OWNER/DISPATCHER members (not technicians) for company-wide events like QUOTE_SENT", async () => {
    const owner = await registerOwner("quote");
    const ownerAuth = { Authorization: `Bearer ${owner.accessToken}` };
    const technician = await inviteAndAcceptTechnician(ownerAuth);
    const technicianAuth = { Authorization: `Bearer ${technician.accessToken}` };

    const { customerId } = await createCustomerWithAddress(ownerAuth);
    const quote = await request(app)
      .post("/api/v1/quotes")
      .set(ownerAuth)
      .send({
        customerId,
        currency: "USD",
        items: [{ description: "Compressor replacement", quantity: 1, unitPriceMinor: 50000 }],
      });
    expect(quote.status).toBe(201);

    const send = await request(app)
      .post(`/api/v1/quotes/${quote.body.data.id}/send`)
      .set(ownerAuth);
    expect(send.status).toBe(200);

    const ownerInbox = await inboxWithItems(ownerAuth);
    expect(ownerInbox.status).toBe(200);
    expect(ownerInbox.body.data.items).toHaveLength(1);
    expect(ownerInbox.body.data.items[0].type).toBe("QUOTE_SENT");

    const technicianInbox = await request(app)
      .get("/api/v1/notifications")
      .set(technicianAuth);
    expect(technicianInbox.status).toBe(200);
    expect(technicianInbox.body.data.items).toHaveLength(0);
  });

  it("marks a notification read exactly once and enforces tenant isolation", async () => {
    const ownerA = await registerOwner("read-a");
    const ownerAuthA = { Authorization: `Bearer ${ownerA.accessToken}` };
    const technicianA = await inviteAndAcceptTechnician(ownerAuthA);
    const technicianAuthA = { Authorization: `Bearer ${technicianA.accessToken}` };
    const { customerId, serviceAddressId } = await createCustomerWithAddress(ownerAuthA);
    const job = await request(app)
      .post("/api/v1/jobs")
      .set(ownerAuthA)
      .send({
        customerId,
        serviceAddressId,
        serviceType: "AC Repair",
        problemDescription: "Unit not cooling",
      });
    const meA = await request(app).get("/api/v1/auth/me").set(technicianAuthA);
    await request(app)
      .post(`/api/v1/jobs/${job.body.data.id}/assign`)
      .set(ownerAuthA)
      .send({ technicianId: meA.body.data.user.id });

    const inboxA = await inboxWithItems(technicianAuthA);
    const notificationId = inboxA.body.data.items[0].id as string;

    // A user from a completely different company cannot read or mark it.
    const ownerB = await registerOwner("read-b");
    const ownerAuthB = { Authorization: `Bearer ${ownerB.accessToken}` };
    const crossTenantRead = await request(app)
      .post(`/api/v1/notifications/${notificationId}/read`)
      .set(ownerAuthB);
    expect(crossTenantRead.status).toBe(404);

    const markRead = await request(app)
      .post(`/api/v1/notifications/${notificationId}/read`)
      .set(technicianAuthA);
    expect(markRead.status).toBe(200);
    expect(markRead.body.data.readAt).toBeTruthy();

    const inboxAfter = await request(app)
      .get("/api/v1/notifications")
      .set(technicianAuthA);
    expect(inboxAfter.body.data.meta.unreadCount).toBe(0);

    // Marking an already-read notification again is idempotent.
    const markReadAgain = await request(app)
      .post(`/api/v1/notifications/${notificationId}/read`)
      .set(technicianAuthA);
    expect(markReadAgain.status).toBe(200);
  });

  it("requires authentication", async () => {
    const response = await request(app).get("/api/v1/notifications");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_SESSION_EXPIRED");
  });
});