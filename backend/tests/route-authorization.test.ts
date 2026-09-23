import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const app = buildApp();

function uniqueSuffix(label: string) {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function registerOwner(label: string) {
  const suffix = uniqueSuffix(label);
  const email = `owner-${suffix}@example.com`;
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({
      email,
      password: "correct-horse-battery-staple",
      firstName: "Owner",
      lastName: label,
      companyName: `Company ${suffix}`,
    });

  expect(res.status).toBe(201);
  return {
    ...res.body.data,
    email,
  };
}

async function inviteAndAccept(
  ownerAccessToken: string,
  role: "OWNER" | "DISPATCHER" | "TECHNICIAN",
  label: string,
) {
  const suffix = uniqueSuffix(label);
  const email = `${role.toLowerCase()}-${suffix}@example.com`;
  const inviteRes = await request(app)
    .post("/api/v1/companies/current/invitations")
    .set("Authorization", `Bearer ${ownerAccessToken}`)
    .send({
      email,
      firstName: label,
      lastName: "User",
      role,
    });

  expect(inviteRes.status).toBe(201);
  const invitationToken = inviteRes.body.data.invitationToken;
  const memberId = inviteRes.body.data.id;

  const acceptRes = await request(app)
    .post("/api/v1/auth/accept-invitation")
    .send({
      token: invitationToken,
      password: "correct-horse-battery-staple",
    });

  expect(acceptRes.status).toBe(200);

  return {
    ...acceptRes.body.data,
    memberId,
    email,
  };
}

async function createCustomerAndAddress(ownerAccessToken: string) {
  const custRes = await request(app)
    .post("/api/v1/customers")
    .set("Authorization", `Bearer ${ownerAccessToken}`)
    .send({
      firstName: "John",
      lastName: "Customer",
      email: `customer-${Date.now()}@example.com`,
      phone: "+15551234567",
    });
  expect(custRes.status).toBe(201);
  const customerId = custRes.body.data.id;

  const addrRes = await request(app)
    .post(`/api/v1/customers/${customerId}/addresses`)
    .set("Authorization", `Bearer ${ownerAccessToken}`)
    .send({
      label: "Main House",
      line1: "123 Main St",
      city: "Springfield",
      countryCode: "US",
    });
  expect(addrRes.status).toBe(201);
  const addressId = addrRes.body.data.id;

  return { customerId, addressId };
}

describe("Phase B2: Route Authorization Matrix & Function-Level Policies", () => {
  it("enforces strict assignment-level policies for unassigned technicians", async () => {
    const owner = await registerOwner("b2-unassigned");
    const techAssigned = await inviteAndAccept(
      owner.accessToken,
      "TECHNICIAN",
      "AliceAssigned",
    );
    const techUnassigned = await inviteAndAccept(
      owner.accessToken,
      "TECHNICIAN",
      "BobUnassigned",
    );

    const { customerId, addressId } = await createCustomerAndAddress(
      owner.accessToken,
    );

    // Create job as owner
    const createJobRes = await request(app)
      .post("/api/v1/jobs")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({
        customerId,
        serviceAddressId: addressId,
        serviceType: "HVAC Repair",
        problemDescription: "Unit blowing warm air",
        priority: "HIGH",
      });
    expect(createJobRes.status).toBe(201);
    const jobId = createJobRes.body.data.id;

    // Assign job to techAssigned
    const assignRes = await request(app)
      .post(`/api/v1/jobs/${jobId}/assign`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ technicianId: techAssigned.user.id });
    expect(assignRes.status).toBe(200);

    // Unassigned technician (techUnassigned) CANNOT view job details
    const viewRes = await request(app)
      .get(`/api/v1/jobs/${jobId}`)
      .set("Authorization", `Bearer ${techUnassigned.accessToken}`);
    expect(viewRes.status).toBe(403);
    expect(viewRes.body.error.code).toBe("AUTH_FORBIDDEN");

    // Unassigned technician CANNOT transition job status
    const statusRes = await request(app)
      .post(`/api/v1/jobs/${jobId}/status`)
      .set("Authorization", `Bearer ${techUnassigned.accessToken}`)
      .send({ status: "EN_ROUTE" });
    expect(statusRes.status).toBe(403);
    expect(statusRes.body.error.code).toBe("AUTH_FORBIDDEN");

    // Unassigned technician CANNOT complete job
    const completeRes = await request(app)
      .post(`/api/v1/jobs/${jobId}/complete`)
      .set("Authorization", `Bearer ${techUnassigned.accessToken}`)
      .send({ summary: "Unauthorized completion" });
    expect(completeRes.status).toBe(403);
    expect(completeRes.body.error.code).toBe("AUTH_FORBIDDEN");

    // Unassigned technician CANNOT presign or upload photos
    const presignRes = await request(app)
      .post(`/api/v1/jobs/${jobId}/photos/presign`)
      .set("Authorization", `Bearer ${techUnassigned.accessToken}`)
      .send({ mimeType: "image/jpeg" });
    expect(presignRes.status).toBe(403);
    expect(presignRes.body.error.code).toBe("AUTH_FORBIDDEN");

    const photoRes = await request(app)
      .post(`/api/v1/jobs/${jobId}/photos`)
      .set("Authorization", `Bearer ${techUnassigned.accessToken}`)
      .send({
        objectKey: "jobs/test/photo.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        kind: "BEFORE",
      });
    expect(photoRes.status).toBe(403);
    expect(photoRes.body.error.code).toBe("AUTH_FORBIDDEN");

    // Unassigned technician CANNOT add parts
    const partsRes = await request(app)
      .post(`/api/v1/jobs/${jobId}/parts`)
      .set("Authorization", `Bearer ${techUnassigned.accessToken}`)
      .send({
        name: "Capacitor",
        quantity: 1,
        unitPriceMinor: 4500,
        currency: "USD",
      });
    expect(partsRes.status).toBe(403);
    expect(partsRes.body.error.code).toBe("AUTH_FORBIDDEN");

    // Unassigned technician CANNOT add notes
    const noteRes = await request(app)
      .post(`/api/v1/jobs/${jobId}/notes`)
      .set("Authorization", `Bearer ${techUnassigned.accessToken}`)
      .send({ body: "Unauthorized note", visibility: "INTERNAL" });
    expect(noteRes.status).toBe(403);
    expect(noteRes.body.error.code).toBe("AUTH_FORBIDDEN");

    // Unassigned technician CANNOT view job history
    const historyRes = await request(app)
      .get(`/api/v1/jobs/${jobId}/history`)
      .set("Authorization", `Bearer ${techUnassigned.accessToken}`);
    expect(historyRes.status).toBe(403);
    expect(historyRes.body.error.code).toBe("AUTH_FORBIDDEN");
  });

  it("permits assigned technician field workflow while restricting cancellation, customer notes, and manager jumps", async () => {
    const owner = await registerOwner("b2-assigned");
    const tech = await inviteAndAccept(
      owner.accessToken,
      "TECHNICIAN",
      "CharlieTech",
    );

    const { customerId, addressId } = await createCustomerAndAddress(
      owner.accessToken,
    );

    const createJobRes = await request(app)
      .post("/api/v1/jobs")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({
        customerId,
        serviceAddressId: addressId,
        serviceType: "Filter Replacement",
        problemDescription: "Annual maintenance",
      });
    expect(createJobRes.status).toBe(201);
    const jobId = createJobRes.body.data.id;

    // Assign to tech
    await request(app)
      .post(`/api/v1/jobs/${jobId}/assign`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ technicianId: tech.user.id });

    // Transition to SCHEDULED as owner
    await request(app)
      .post(`/api/v1/jobs/${jobId}/status`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ status: "SCHEDULED" });

    // Assigned technician CAN view job
    const viewRes = await request(app)
      .get(`/api/v1/jobs/${jobId}`)
      .set("Authorization", `Bearer ${tech.accessToken}`);
    expect(viewRes.status).toBe(200);
    expect(viewRes.body.data.id).toBe(jobId);

    // Assigned technician CANNOT cancel job
    const cancelRes = await request(app)
      .post(`/api/v1/jobs/${jobId}/status`)
      .set("Authorization", `Bearer ${tech.accessToken}`)
      .send({ status: "CANCELLED", reason: "Don't want to do it" });
    expect(cancelRes.status).toBe(403);
    expect(cancelRes.body.error.code).toBe("AUTH_FORBIDDEN");

    // Assigned technician CANNOT jump back to NEW or QUOTING
    const quotingRes = await request(app)
      .post(`/api/v1/jobs/${jobId}/status`)
      .set("Authorization", `Bearer ${tech.accessToken}`)
      .send({ status: "QUOTING" });
    expect(quotingRes.status).toBe(403);
    expect(quotingRes.body.error.code).toBe("AUTH_FORBIDDEN");

    // Assigned technician CANNOT create CUSTOMER-visible note
    const customerNoteRes = await request(app)
      .post(`/api/v1/jobs/${jobId}/notes`)
      .set("Authorization", `Bearer ${tech.accessToken}`)
      .send({
        body: "Customer-facing note attempted by tech",
        visibility: "CUSTOMER",
      });
    expect(customerNoteRes.status).toBe(403);
    expect(customerNoteRes.body.error.code).toBe("AUTH_FORBIDDEN");

    // Assigned technician CAN create INTERNAL note
    const internalNoteRes = await request(app)
      .post(`/api/v1/jobs/${jobId}/notes`)
      .set("Authorization", `Bearer ${tech.accessToken}`)
      .send({
        body: "Filter looks heavily clogged",
        visibility: "INTERNAL",
      });
    expect(internalNoteRes.status).toBe(201);
    expect(internalNoteRes.body.data.body).toBe("Filter looks heavily clogged");

    // Assigned technician progresses field workflow: SCHEDULED -> EN_ROUTE
    const enRouteRes = await request(app)
      .post(`/api/v1/jobs/${jobId}/status`)
      .set("Authorization", `Bearer ${tech.accessToken}`)
      .send({ status: "EN_ROUTE" });
    expect(enRouteRes.status).toBe(200);
    expect(enRouteRes.body.data.status).toBe("EN_ROUTE");

    // EN_ROUTE -> IN_PROGRESS
    const inProgressRes = await request(app)
      .post(`/api/v1/jobs/${jobId}/status`)
      .set("Authorization", `Bearer ${tech.accessToken}`)
      .send({ status: "IN_PROGRESS" });
    expect(inProgressRes.status).toBe(200);
    expect(inProgressRes.body.data.status).toBe("IN_PROGRESS");

    // IN_PROGRESS -> WAITING_PARTS
    const waitingPartsRes = await request(app)
      .post(`/api/v1/jobs/${jobId}/status`)
      .set("Authorization", `Bearer ${tech.accessToken}`)
      .send({ status: "WAITING_PARTS", reason: "Need HEPA 20x25x4 filter" });
    expect(waitingPartsRes.status).toBe(200);
    expect(waitingPartsRes.body.data.status).toBe("WAITING_PARTS");

    // WAITING_PARTS -> IN_PROGRESS
    const resumeRes = await request(app)
      .post(`/api/v1/jobs/${jobId}/status`)
      .set("Authorization", `Bearer ${tech.accessToken}`)
      .send({ status: "IN_PROGRESS" });
    expect(resumeRes.status).toBe(200);
    expect(resumeRes.body.data.status).toBe("IN_PROGRESS");

    // Add part as assigned tech
    const partRes = await request(app)
      .post(`/api/v1/jobs/${jobId}/parts`)
      .set("Authorization", `Bearer ${tech.accessToken}`)
      .send({
        name: "HEPA Filter 20x25x4",
        quantity: 1,
        unitPriceMinor: 6500,
        currency: "USD",
      });
    expect(partRes.status).toBe(201);

    // Complete job with summary
    const completeRes = await request(app)
      .post(`/api/v1/jobs/${jobId}/complete`)
      .set("Authorization", `Bearer ${tech.accessToken}`)
      .send({ summary: "Replaced filter and checked airflow." });
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.data.status).toBe("COMPLETED");

    // View history as assigned technician
    const historyRes = await request(app)
      .get(`/api/v1/jobs/${jobId}/history`)
      .set("Authorization", `Bearer ${tech.accessToken}`);
    expect(historyRes.status).toBe(200);
    expect(historyRes.body.data.length).toBeGreaterThan(0);
  });

  it("blocks technicians from manager/dispatcher-only operations", async () => {
    const owner = await registerOwner("b2-manager-only");
    const tech = await inviteAndAccept(
      owner.accessToken,
      "TECHNICIAN",
      "DaveTech",
    );

    // Technician CANNOT list members
    const membersRes = await request(app)
      .get("/api/v1/companies/current/members")
      .set("Authorization", `Bearer ${tech.accessToken}`);
    expect(membersRes.status).toBe(403);
    expect(membersRes.body.error.code).toBe("AUTH_FORBIDDEN");

    // Technician CANNOT view company day schedule
    const scheduleRes = await request(app)
      .get("/api/v1/schedule")
      .query({ date: "2026-09-24" })
      .set("Authorization", `Bearer ${tech.accessToken}`);
    expect(scheduleRes.status).toBe(403);
    expect(scheduleRes.body.error.code).toBe("AUTH_FORBIDDEN");

    // Technician CANNOT view workload
    const workloadRes = await request(app)
      .get("/api/v1/schedule/workload")
      .query({ date: "2026-09-24" })
      .set("Authorization", `Bearer ${tech.accessToken}`);
    expect(workloadRes.status).toBe(403);
    expect(workloadRes.body.error.code).toBe("AUTH_FORBIDDEN");

    // Technician CANNOT create jobs
    const createJobRes = await request(app)
      .post("/api/v1/jobs")
      .set("Authorization", `Bearer ${tech.accessToken}`)
      .send({
        customerId: "00000000-0000-0000-0000-000000000000",
        serviceAddressId: "00000000-0000-0000-0000-000000000000",
        serviceType: "Test",
        problemDescription: "Test",
      });
    expect(createJobRes.status).toBe(403);
    expect(createJobRes.body.error.code).toBe("AUTH_FORBIDDEN");

    // Technician CANNOT access customer list
    const customerRes = await request(app)
      .get("/api/v1/customers")
      .set("Authorization", `Bearer ${tech.accessToken}`);
    expect(customerRes.status).toBe(403);
    expect(customerRes.body.error.code).toBe("AUTH_FORBIDDEN");

    // Technician CANNOT access quotes
    const quoteRes = await request(app)
      .get("/api/v1/quotes")
      .set("Authorization", `Bearer ${tech.accessToken}`);
    expect(quoteRes.status).toBe(403);
    expect(quoteRes.body.error.code).toBe("AUTH_FORBIDDEN");

    // Technician CANNOT access invoices
    const invoiceRes = await request(app)
      .get("/api/v1/invoices")
      .set("Authorization", `Bearer ${tech.accessToken}`);
    expect(invoiceRes.status).toBe(403);
    expect(invoiceRes.body.error.code).toBe("AUTH_FORBIDDEN");

    // Technician CANNOT invite new members
    const inviteRes = await request(app)
      .post("/api/v1/companies/current/invitations")
      .set("Authorization", `Bearer ${tech.accessToken}`)
      .send({
        email: "sneaky@example.com",
        firstName: "Sneaky",
        lastName: "User",
        role: "TECHNICIAN",
      });
    expect(inviteRes.status).toBe(403);
    expect(inviteRes.body.error.code).toBe("AUTH_FORBIDDEN");
  });

  it("allows dispatchers to manage jobs and view schedule while blocking owner-only member management", async () => {
    const owner = await registerOwner("b2-dispatcher");
    const dispatcher = await inviteAndAccept(
      owner.accessToken,
      "DISPATCHER",
      "DianaDispatcher",
    );

    // Dispatcher CAN list company members
    const membersRes = await request(app)
      .get("/api/v1/companies/current/members")
      .set("Authorization", `Bearer ${dispatcher.accessToken}`);
    expect(membersRes.status).toBe(200);

    // Dispatcher CAN view schedule & workload
    const scheduleRes = await request(app)
      .get("/api/v1/schedule")
      .query({ date: "2026-09-24" })
      .set("Authorization", `Bearer ${dispatcher.accessToken}`);
    expect(scheduleRes.status).toBe(200);

    const workloadRes = await request(app)
      .get("/api/v1/schedule/workload")
      .query({ date: "2026-09-24" })
      .set("Authorization", `Bearer ${dispatcher.accessToken}`);
    expect(workloadRes.status).toBe(200);

    // Dispatcher CANNOT invite members (Owner only)
    const inviteRes = await request(app)
      .post("/api/v1/companies/current/invitations")
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .send({
        email: "newtech@example.com",
        firstName: "New",
        lastName: "Tech",
        role: "TECHNICIAN",
      });
    expect(inviteRes.status).toBe(403);
    expect(inviteRes.body.error.code).toBe("AUTH_FORBIDDEN");

    // Dispatcher CANNOT remove members (Owner only)
    const removeRes = await request(app)
      .delete(`/api/v1/companies/current/members/${dispatcher.memberId}`)
      .set("Authorization", `Bearer ${dispatcher.accessToken}`);
    expect(removeRes.status).toBe(403);
    expect(removeRes.body.error.code).toBe("AUTH_FORBIDDEN");
  });

  it("prevents using a client-supplied company ID in route parameters to bypass session tenancy", async () => {
    const ownerA = await registerOwner("b2-tenant-a");
    const ownerB = await registerOwner("b2-tenant-b");

    // Owner A supplies Company B's ID in the route URL
    const bypassAttempt = await request(app)
      .get(`/api/v1/companies/${ownerB.company.id}`)
      .set("Authorization", `Bearer ${ownerA.accessToken}`);

    expect(bypassAttempt.status).toBe(403);
    expect(bypassAttempt.body.error.code).toBe("TENANT_ACCESS_DENIED");

    // Owner A requesting their own company ID works
    const validAccess = await request(app)
      .get(`/api/v1/companies/${ownerA.company.id}`)
      .set("Authorization", `Bearer ${ownerA.accessToken}`);

    expect(validAccess.status).toBe(200);
    expect(validAccess.body.data.id).toBe(ownerA.company.id);
  });
});
