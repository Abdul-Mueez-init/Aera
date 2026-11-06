/**
 * Phase 1 — Service Requests (staff side) integration tests.
 *
 * REQUESTS_ENABLED must be set BEFORE any src module is imported: env.ts
 * parses process.env once at module load and app.ts only mounts the
 * /service-requests router when the flag is on. Like portal-transport.test.ts,
 * all src imports are therefore dynamic inside beforeAll.
 */
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";

process.env.REQUESTS_ENABLED = "true";

type App = ReturnType<(typeof import("../src/app.js"))["buildApp"]>;
type PrismaClient = (typeof import("../src/db/prisma.js"))["prisma"];
type HashPassword =
  (typeof import("../src/common/auth/password.js"))["hashPassword"];

let app: App;
let prisma: PrismaClient;
let hashPassword: HashPassword;

beforeAll(async () => {
  app = (await import("../src/app.js")).buildApp();
  prisma = (await import("../src/db/prisma.js")).prisma;
  hashPassword = (await import("../src/common/auth/password.js")).hashPassword;
}, 60000);

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
  return {
    accessToken: res.body.data.accessToken as string,
    companyId: res.body.data.company.id as string,
    userId: res.body.data.user.id as string,
  };
}

async function addMember(
  companyId: string,
  role: "DISPATCHER" | "TECHNICIAN",
  label: string,
) {
  const suffix = uniqueSuffix(label);
  const email = `${role.toLowerCase()}-${suffix}@example.com`.toLowerCase();
  const password = "correct-horse-battery-staple";
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      firstName: role === "DISPATCHER" ? "Dispatcher" : "Tech",
      lastName: label,
    },
  });
  await prisma.companyMember.create({
    data: { companyId, userId: user.id, role, status: "ACTIVE" },
  });
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password });
  expect(login.status).toBe(200);
  return {
    accessToken: login.body.data.accessToken as string,
    userId: user.id,
  };
}

async function createCustomerAndAddress(accessToken: string) {
  const custRes = await request(app)
    .post("/api/v1/customers")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({
      firstName: "Jane",
      lastName: "Customer",
      email: `customer-${uniqueSuffix("c")}@example.com`,
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
  return { customerId, addressId: addrRes.body.data.id as string };
}

function requestPayload(customerId: string, addressId: string, extra = {}) {
  return {
    customerId,
    serviceAddressId: addressId,
    title: "AC not cooling",
    description: "The upstairs unit blows warm air",
    serviceCategory: "HVAC",
    priority: "HIGH",
    requiresInspection: true,
    source: "PHONE",
    ...extra,
  };
}

describe("service requests API (REQUESTS_ENABLED)", () => {
  it("rejects unauthenticated access", async () => {
    const res = await request(app).get("/api/v1/service-requests");
    expect(res.status).toBe(401);
  });

  it("enforces the OWNER/DISPATCHER role matrix", async () => {
    const owner = await registerOwner("sr-roles");
    const dispatcher = await addMember(owner.companyId, "DISPATCHER", "Disp");
    const technician = await addMember(owner.companyId, "TECHNICIAN", "Tech");
    const { customerId, addressId } = await createCustomerAndAddress(
      owner.accessToken,
    );

    const techList = await request(app)
      .get("/api/v1/service-requests")
      .set("Authorization", `Bearer ${technician.accessToken}`);
    expect(techList.status).toBe(403);

    const techCreate = await request(app)
      .post("/api/v1/service-requests")
      .set("Authorization", `Bearer ${technician.accessToken}`)
      .send(requestPayload(customerId, addressId));
    expect(techCreate.status).toBe(403);

    const dispList = await request(app)
      .get("/api/v1/service-requests")
      .set("Authorization", `Bearer ${dispatcher.accessToken}`);
    expect(dispList.status).toBe(200);

    const dispCreate = await request(app)
      .post("/api/v1/service-requests")
      .set("Authorization", `Bearer ${dispatcher.accessToken}`)
      .send(
        requestPayload(customerId, addressId, { title: "Dispatcher intake" }),
      );
    expect(dispCreate.status).toBe(201);
  });

  it("creates, lists, reads and updates a request with an event trail", async () => {
    const owner = await registerOwner("sr-crud");
    const { customerId, addressId } = await createCustomerAndAddress(
      owner.accessToken,
    );

    const create = await request(app)
      .post("/api/v1/service-requests")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send(requestPayload(customerId, addressId));
    expect(create.status).toBe(201);
    const created = create.body.data;
    expect(created.requestNumber).toBe(1);
    expect(created.status).toBe("SUBMITTED");
    expect(created.requiresInspection).toBe(true);
    expect(created.source).toBe("PHONE");
    expect(created.customer.id).toBe(customerId);

    const list = await request(app)
      .get("/api/v1/service-requests")
      .query({ status: "SUBMITTED", search: "AC not cooling" })
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.meta.total).toBe(1);

    const detail = await request(app)
      .get(`/api/v1/service-requests/${created.id}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.events[0].type).toBe("CREATED");
    expect(detail.body.data.events[0].toStatus).toBe("SUBMITTED");

    const patch = await request(app)
      .patch(`/api/v1/service-requests/${created.id}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ title: "AC not cooling — urgent", priority: "URGENT" });
    expect(patch.status).toBe(200);
    expect(patch.body.data.title).toBe("AC not cooling — urgent");
    expect(patch.body.data.priority).toBe("URGENT");
  });

  it("rejects references that do not belong to the company", async () => {
    const ownerA = await registerOwner("sr-ref-a");
    const ownerB = await registerOwner("sr-ref-b");
    const { customerId, addressId } = await createCustomerAndAddress(
      ownerB.accessToken,
    );

    const res = await request(app)
      .post("/api/v1/service-requests")
      .set("Authorization", `Bearer ${ownerA.accessToken}`)
      .send(requestPayload(customerId, addressId));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("REQUEST_INVALID_REFERENCES");
  });

  it("makes cross-tenant request access impossible (404, not 403)", async () => {
    const ownerA = await registerOwner("sr-tenant-a");
    const ownerB = await registerOwner("sr-tenant-b");
    const { customerId, addressId } = await createCustomerAndAddress(
      ownerA.accessToken,
    );

    const create = await request(app)
      .post("/api/v1/service-requests")
      .set("Authorization", `Bearer ${ownerA.accessToken}`)
      .send(requestPayload(customerId, addressId));
    expect(create.status).toBe(201);
    const requestId = create.body.data.id as string;

    const read = await request(app)
      .get(`/api/v1/service-requests/${requestId}`)
      .set("Authorization", `Bearer ${ownerB.accessToken}`);
    expect(read.status).toBe(404);

    const patch = await request(app)
      .patch(`/api/v1/service-requests/${requestId}`)
      .set("Authorization", `Bearer ${ownerB.accessToken}`)
      .send({ title: "hijacked" });
    expect(patch.status).toBe(404);

    const command = await request(app)
      .post(`/api/v1/service-requests/${requestId}/close`)
      .set("Authorization", `Bearer ${ownerB.accessToken}`);
    expect(command.status).toBe(404);

    // The request is untouched.
    const verify = await request(app)
      .get(`/api/v1/service-requests/${requestId}`)
      .set("Authorization", `Bearer ${ownerA.accessToken}`);
    expect(verify.body.data.status).toBe("SUBMITTED");
    expect(verify.body.data.title).toBe("AC not cooling");
  });

  it("runs the documented command transitions and rejects invalid ones", async () => {
    const owner = await registerOwner("sr-transitions");
    const { customerId, addressId } = await createCustomerAndAddress(
      owner.accessToken,
    );
    const create = await request(app)
      .post("/api/v1/service-requests")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send(requestPayload(customerId, addressId));
    const requestId = create.body.data.id as string;
    const auth = { Authorization: `Bearer ${owner.accessToken}` };

    // SUBMITTED -> NEEDS_INFO via request-information (posts a message).
    const info = await request(app)
      .post(`/api/v1/service-requests/${requestId}/request-information`)
      .set(auth)
      .send({ body: "What brand is the unit?" });
    expect(info.status).toBe(200);
    expect(info.body.data.authorType).toBe("STAFF");
    expect(info.body.data.body).toBe("What brand is the unit?");

    const afterInfo = await request(app)
      .get(`/api/v1/service-requests/${requestId}`)
      .set(auth);
    expect(afterInfo.body.data.status).toBe("NEEDS_INFO");

    // NEEDS_INFO -> QUOTING is not a legal transition.
    const badInspect = await request(app)
      .post(`/api/v1/service-requests/${requestId}/mark-inspection`)
      .set(auth);
    expect(badInspect.status).toBe(422);
    expect(badInspect.body.error.code).toBe("REQUEST_INVALID_TRANSITION");

    // NEEDS_INFO -> SUBMITTED is the documented "customer replied" path;
    // the portal reply endpoint lands in Phase 3, so move it directly here.
    const reply = await prisma.serviceRequest.update({
      where: { id: requestId },
      data: { status: "SUBMITTED" },
    });
    expect(reply.status).toBe("SUBMITTED");

    // SUBMITTED -> QUOTING via mark-inspection.
    const inspect = await request(app)
      .post(`/api/v1/service-requests/${requestId}/mark-inspection`)
      .set(auth);
    expect(inspect.status).toBe(200);
    expect(inspect.body.data.status).toBe("QUOTING");
    expect(inspect.body.data.events[0].type).toBe("INSPECTION_MARKED");

    // QUOTING -> CLOSED is not legal.
    const badClose = await request(app)
      .post(`/api/v1/service-requests/${requestId}/close`)
      .set(auth);
    expect(badClose.status).toBe(422);
  });

  it("allows exactly one winner under concurrent close", async () => {
    const owner = await registerOwner("sr-race");
    const { customerId, addressId } = await createCustomerAndAddress(
      owner.accessToken,
    );
    const create = await request(app)
      .post("/api/v1/service-requests")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send(requestPayload(customerId, addressId));
    const requestId = create.body.data.id as string;
    const auth = `Bearer ${owner.accessToken}`;

    const [a, b] = await Promise.all([
      request(app)
        .post(`/api/v1/service-requests/${requestId}/close`)
        .set("Authorization", auth),
      request(app)
        .post(`/api/v1/service-requests/${requestId}/close`)
        .set("Authorization", auth),
    ]);

    const statuses = [a.status, b.status];
    // Exactly one claim wins (200); the loser either loses the guarded
    // updateMany (409 REQUEST_STATE_CHANGED) or re-reads CLOSED and fails
    // transition validation (422 REQUEST_INVALID_TRANSITION).
    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    const loser = statuses.find((status) => status !== 200);
    expect([409, 422]).toContain(loser);

    const detail = await request(app)
      .get(`/api/v1/service-requests/${requestId}`)
      .set("Authorization", auth);
    expect(detail.body.data.status).toBe("CLOSED");
    expect(detail.body.data.closedAt).not.toBeNull();
    // Exactly one CLOSED event was written.
    const closedEvents = detail.body.data.events.filter(
      (event: { type: string }) => event.type === "CLOSED",
    );
    expect(closedEvents).toHaveLength(1);
  });

  it("supports cancel then reopen back to SUBMITTED", async () => {
    const owner = await registerOwner("sr-cancel");
    const { customerId, addressId } = await createCustomerAndAddress(
      owner.accessToken,
    );
    const create = await request(app)
      .post("/api/v1/service-requests")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send(requestPayload(customerId, addressId));
    const requestId = create.body.data.id as string;
    const auth = `Bearer ${owner.accessToken}`;

    const cancel = await request(app)
      .post(`/api/v1/service-requests/${requestId}/cancel`)
      .set("Authorization", auth);
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.status).toBe("CANCELLED");

    const reopen = await request(app)
      .post(`/api/v1/service-requests/${requestId}/reopen`)
      .set("Authorization", auth);
    expect(reopen.status).toBe(200);
    expect(reopen.body.data.status).toBe("SUBMITTED");
    expect(reopen.body.data.events[0].type).toBe("REOPENED");
  });

  it("auto-creates an ACCEPTED STAFF_DIRECT request for direct jobs", async () => {
    const owner = await registerOwner("sr-direct-job");
    const { customerId, addressId } = await createCustomerAndAddress(
      owner.accessToken,
    );

    const jobRes = await request(app)
      .post("/api/v1/jobs")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({
        customerId,
        serviceAddressId: addressId,
        serviceType: "Emergency repair",
        problemDescription: "No heat",
        priority: "URGENT",
        type: "REPAIR",
      });
    expect(jobRes.status).toBe(201);
    expect(jobRes.body.data.serviceRequest).toBeTruthy();
    expect(jobRes.body.data.type).toBe("REPAIR");

    const requests = await prisma.serviceRequest.findMany({
      where: { companyId: owner.companyId },
    });
    expect(requests).toHaveLength(1);
    expect(requests[0].source).toBe("STAFF_DIRECT");
    expect(requests[0].status).toBe("ACCEPTED");
    expect(requests[0].requiresInspection).toBe(false);

    // The job links back to that request.
    const job = await prisma.job.findUniqueOrThrow({
      where: { id: jobRes.body.data.id },
    });
    expect(job.serviceRequestId).toBe(requests[0].id);
  });

  it("attaches a job to an existing request when serviceRequestId is given", async () => {
    const owner = await registerOwner("sr-attach");
    const { customerId, addressId } = await createCustomerAndAddress(
      owner.accessToken,
    );
    const create = await request(app)
      .post("/api/v1/service-requests")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send(requestPayload(customerId, addressId));
    const requestId = create.body.data.id as string;

    const jobRes = await request(app)
      .post("/api/v1/jobs")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({
        customerId,
        serviceAddressId: addressId,
        serviceRequestId: requestId,
        serviceType: "HVAC Repair",
        problemDescription: "Same issue",
      });
    expect(jobRes.status).toBe(201);

    const count = await prisma.serviceRequest.count({
      where: { companyId: owner.companyId },
    });
    expect(count).toBe(1);

    // A request belonging to a different customer is rejected.
    const { customerId: otherCustomer, addressId: otherAddress } =
      await createCustomerAndAddress(owner.accessToken);
    const badRes = await request(app)
      .post("/api/v1/jobs")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({
        customerId: otherCustomer,
        serviceAddressId: otherAddress,
        serviceRequestId: requestId,
        serviceType: "HVAC Repair",
        problemDescription: "Mismatch",
      });
    expect(badRes.status).toBe(422);
    expect(badRes.body.error.code).toBe("JOB_INVALID_SERVICE_REQUEST");
  });

  it("reports new, aging and waiting-on-customer request counts", async () => {
    const owner = await registerOwner("sr-dashboard");
    const { customerId, addressId } = await createCustomerAndAddress(
      owner.accessToken,
    );
    const auth = `Bearer ${owner.accessToken}`;

    const mk = (title: string) =>
      request(app)
        .post("/api/v1/service-requests")
        .set("Authorization", auth)
        .send(requestPayload(customerId, addressId, { title }));

    const fresh = await mk("fresh submitted");
    expect(fresh.status).toBe(201);
    await mk("second submitted");

    // Age one request beyond 24h directly in the DB.
    await prisma.serviceRequest.update({
      where: { id: fresh.body.data.id },
      data: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    });

    // Move the requests out of SUBMITTED via direct DB writes to isolate the
    // dashboard counts from the command surface: one to NEEDS_INFO and one
    // to QUOTED — both count as "waiting on customer".
    const all = await prisma.serviceRequest.findMany({
      where: { companyId: owner.companyId },
      orderBy: { createdAt: "asc" },
    });
    await prisma.serviceRequest.update({
      where: { id: all[0].id },
      data: { status: "NEEDS_INFO" },
    });
    await prisma.serviceRequest.update({
      where: { id: all[1].id },
      data: { status: "QUOTED" },
    });

    const summary = await request(app)
      .get("/api/v1/dashboard/summary")
      .set("Authorization", auth);
    expect(summary.status).toBe(200);
    const data = summary.body.data;
    // Both requests left SUBMITTED, so new/aging are 0; both are waiting on
    // the customer (NEEDS_INFO + QUOTED).
    expect(data.newServiceRequests).toBe(0);
    expect(data.agingServiceRequests).toBe(0);
    expect(data.waitingOnCustomerServiceRequests).toBe(2);
    expect(data.needsInfoServiceRequests).toBe(1);
    expect(data.openServiceRequests).toBe(2);
  });
});
