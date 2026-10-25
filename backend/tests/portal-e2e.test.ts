import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/common/auth/password.js";
import {
  createAccessToken,
  hashRefreshToken,
} from "../src/common/auth/tokens.js";
import { prisma } from "../src/db/prisma.js";

/**
 * Handoff section 10 — end-to-end acceptance script, executed at API level
 * against a real database. Steps that need a physical device/browser
 * (fragment removal in Chrome, Android App Link tap, WhatsApp app hand-off)
 * are covered by the Flutter build/manifest evidence instead; everything
 * the API controls is asserted here, in script order.
 */
const app = buildApp();

function suffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

interface Actor {
  userId: string;
  auth: { Authorization: string };
}

let companyId: string;
let companyName: string;
let owner: Actor;
let dispatcher: Actor;
let technician: Actor;
let customerAId: string;
let customerBId: string;
let jobAId: string;
let jobBId: string;
let quoteAId: string;
let quoteBId: string;
let linkA: string;
let tokenA: string;
let cookieA: string;
let codeA: string;

async function createActor(
  role: "DISPATCHER" | "TECHNICIAN",
  label: string,
): Promise<Actor> {
  const user = await prisma.user.create({
    data: {
      email: `${label}-${suffix()}@example.com`,
      passwordHash: await hashPassword("TestPassword123!"),
      firstName: label,
      lastName: "E2E",
      phone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
    },
  });
  await prisma.companyMember.create({
    data: { companyId, userId: user.id, role, status: "ACTIVE" },
  });
  const sessionId = crypto.randomUUID();
  await prisma.refreshSession.create({
    data: {
      id: sessionId,
      userId: user.id,
      companyId,
      tokenHash: hashRefreshToken(crypto.randomUUID()),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  const accessToken = await createAccessToken({
    userId: user.id,
    sessionId,
    companyId,
    role,
  });
  return { userId: user.id, auth: { Authorization: `Bearer ${accessToken}` } };
}

async function createCustomer(firstName: string) {
  const res = await request(app)
    .post("/api/v1/customers")
    .set(owner.auth)
    .send({
      firstName,
      lastName: "E2E",
      email: `${firstName.toLowerCase()}-${suffix()}@example.com`,
      phone: "+15551234567",
    });
  expect(res.status).toBe(201);
  const customerId = res.body.data.id as string;
  const addr = await request(app)
    .post(`/api/v1/customers/${customerId}/addresses`)
    .set(owner.auth)
    .send({
      label: "Home",
      line1: "1 Main St",
      city: "Austin",
      region: "TX",
      postalCode: "78701",
      countryCode: "US",
    });
  expect(addr.status).toBe(201);
  return { customerId, serviceAddressId: addr.body.data.id as string };
}

async function createJob(customerId: string, serviceAddressId: string) {
  const res = await request(app).post("/api/v1/jobs").set(owner.auth).send({
    customerId,
    serviceAddressId,
    serviceType: "REPAIR",
    problemDescription: "AC not cooling",
  });
  expect(res.status).toBe(201);
  return res.body.data.id as string;
}

function collectStrings(value: unknown, into: string[] = []): string[] {
  if (typeof value === "string") into.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, into));
  else if (value && typeof value === "object")
    Object.values(value).forEach((v) => collectStrings(v, into));
  return into;
}

beforeAll(async () => {
  const reg = await request(app)
    .post("/api/v1/auth/register")
    .send({
      email: `owner-e2e-${suffix()}@example.com`,
      password: "correct-horse-battery-staple",
      firstName: "Olivia",
      lastName: "Owner",
      companyName: `E2E HVAC ${suffix()}`,
    });
  expect(reg.status).toBe(201);
  companyId = reg.body.data.company.id;
  companyName = reg.body.data.company.name;
  await prisma.company.update({
    where: { id: companyId },
    data: { phone: "+15559998888" },
  });
  owner = {
    userId: reg.body.data.user.id,
    auth: { Authorization: `Bearer ${reg.body.data.accessToken}` },
  };
  dispatcher = await createActor("DISPATCHER", "Dana");
  technician = await createActor("TECHNICIAN", "Tom");

  const a = await createCustomer("Alice");
  customerAId = a.customerId;
  jobAId = await createJob(a.customerId, a.serviceAddressId);
  const b = await createCustomer("Bob");
  customerBId = b.customerId;
  jobBId = await createJob(b.customerId, b.serviceAddressId);
});

describe("Portal E2E acceptance (handoff section 10)", () => {
  it("step 1+3: staff sends link; first exchange works, second is 'already used'", async () => {
    const issue = await request(app)
      .post(`/api/v1/jobs/${jobAId}/portal-access`)
      .set(owner.auth)
      .send({ channels: ["SMS", "EMAIL"] });
    expect(issue.status).toBe(201);
    linkA = issue.body.data.link as string;
    expect(linkA).toContain("https://");
    expect(linkA).toContain("#t=");
    tokenA = linkA.split("#t=")[1];
    expect(tokenA.length).toBe(43);

    // Device 1 opens the link.
    const first = await request(app)
      .post("/api/v1/portal/exchange")
      .set("X-Aera-Portal", "1")
      .set("x-aera-portal", "1")
      .send({ token: tokenA });
    expect(first.status).toBe(200);
    cookieA = first.headers["set-cookie"][0].split(";")[0];

    const home = await request(app)
      .get("/api/v1/portal/job")
      .set("Cookie", cookieA);
    expect(home.status).toBe(200);
    expect(home.body.data.company.name).toBe(companyName);

    // Device 2 opens the SAME link -> already used.
    const second = await request(app)
      .post("/api/v1/portal/exchange")
      .set("X-Aera-Portal", "1")
      .set("x-aera-portal", "1")
      .send({ token: tokenA });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("PORTAL_LINK_ALREADY_USED");
  });

  it("step 4: session persists across repeated requests (refresh / reopen)", async () => {
    for (let i = 0; i < 2; i++) {
      const probe = await request(app)
        .get("/api/v1/portal/session")
        .set("Cookie", cookieA);
      expect(probe.status).toBe(200);
      expect(probe.body.data.state).toBe("ACTIVE");
    }
  });

  it("step 5: anonymous portal calls return no customer data", async () => {
    const noSession = await request(app).get("/api/v1/portal/job");
    expect(noSession.status).toBe(401);
    const bogus = await request(app)
      .post("/api/v1/portal/exchange")
      .set("X-Aera-Portal", "1")
      .set("x-aera-portal", "1")
      .send({ token: "A".repeat(43) });
    expect(bogus.status).toBe(401);
    expect(JSON.stringify(bogus.body)).not.toContain("Alice");
  });

  it("step 6: customer A's session cannot touch customer B's job or quote", async () => {
    // B gets a quote.
    const quoteB = await request(app)
      .post("/api/v1/quotes")
      .set(owner.auth)
      .send({
        customerId: customerBId,
        jobId: jobBId,
        currency: "USD",
        expiresAt: new Date(Date.now() + 86400 * 1000),
        items: [
          { description: "Inspection", quantity: "1", unitPriceMinor: 5000 },
        ],
      });
    expect(quoteB.status).toBe(201);
    quoteBId = quoteB.body.data.id;
    await request(app)
      .post(`/api/v1/quotes/${quoteBId}/send`)
      .set(owner.auth)
      .expect(200);

    // A's snapshot contains only A's job.
    const home = await request(app)
      .get("/api/v1/portal/job")
      .set("Cookie", cookieA);
    expect(home.status).toBe(200);
    expect(home.body.data.job.jobNumber).toBeDefined();
    expect(JSON.stringify(home.body.data)).not.toContain(quoteBId);

    // A tries to approve B's quote through A's session.
    const cross = await request(app)
      .post(`/api/v1/portal/quotes/${quoteBId}/respond`)
      .set("Cookie", cookieA)
      .set("x-aera-portal", "1")
      .send({ action: "APPROVED" });
    expect(cross.status).toBe(404);
  });

  it("step 7: quote approved in portal is APPROVED for staff, event source CUSTOMER", async () => {
    const quote = await request(app)
      .post("/api/v1/quotes")
      .set(owner.auth)
      .send({
        customerId: customerAId,
        jobId: jobAId,
        currency: "USD",
        expiresAt: new Date(Date.now() + 86400 * 1000),
        items: [
          {
            description: "Compressor repair",
            quantity: "1",
            unitPriceMinor: 27500,
          },
        ],
      });
    expect(quote.status).toBe(201);
    quoteAId = quote.body.data.id;
    await request(app)
      .post(`/api/v1/quotes/${quoteAId}/send`)
      .set(owner.auth)
      .expect(200);

    const respond = await request(app)
      .post(`/api/v1/portal/quotes/${quoteAId}/respond`)
      .set("Cookie", cookieA)
      .set("x-aera-portal", "1")
      .send({ action: "APPROVED" });
    expect(respond.status).toBe(200);

    const staffView = await request(app)
      .get(`/api/v1/quotes/${quoteAId}`)
      .set(owner.auth);
    expect(staffView.body.data.status).toBe("APPROVED");

    const events = await prisma.quoteApprovalEvent.findMany({
      where: { quoteId: quoteAId },
    });
    expect(events.length).toBe(1);
    expect(events[0].source).toBe("CUSTOMER");
  });

  it("step 8: EN_ROUTE shows the code to the customer and delivery is audited", async () => {
    await request(app)
      .post(`/api/v1/jobs/${jobAId}/assign`)
      .set(owner.auth)
      .send({ technicianId: technician.userId })
      .expect(200);
    await request(app)
      .post(`/api/v1/jobs/${jobAId}/status`)
      .set(owner.auth)
      .send({ status: "SCHEDULED" })
      .expect(200);
    await request(app)
      .post(`/api/v1/jobs/${jobAId}/status`)
      .set(technician.auth)
      .send({ status: "EN_ROUTE" })
      .expect(200);

    const home = await request(app)
      .get("/api/v1/portal/job")
      .set("Cookie", cookieA);
    expect(home.status).toBe(200);
    expect(home.body.data.job.status).toBe("EN_ROUTE");
    expect(home.body.data.job.handshake?.code).toMatch(/^\d{6}$/);
    codeA = home.body.data.job.handshake.code;

    // Delivery was attempted for both channels (adapters are no-ops without
    // provider keys in test env, but the audit trail must exist).
    const sent = await prisma.portalAuditEvent.findMany({
      where: { jobId: jobAId, action: "HANDSHAKE_CODE_SENT" },
    });
    expect(sent.length).toBeGreaterThan(0);

    // The technician's own job view must NOT contain the code anywhere.
    const techView = await request(app)
      .get(`/api/v1/jobs/${jobAId}`)
      .set(technician.auth);
    expect(techView.status).toBe(200);
    expect(techView.body.data.handshake.state).toBe("AWAITING_CODE");
    expect(collectStrings(techView.body)).not.toContain(codeA);
  });

  it("step 10: POST /jobs/:id/status EN_ROUTE->IN_PROGRESS is rejected HANDSHAKE_REQUIRED", async () => {
    const asTech = await request(app)
      .post(`/api/v1/jobs/${jobAId}/status`)
      .set(technician.auth)
      .send({ status: "IN_PROGRESS" });
    expect(asTech.status).toBe(422);
    expect(asTech.body.error.code).toBe("HANDSHAKE_REQUIRED");

    const asOwner = await request(app)
      .post(`/api/v1/jobs/${jobAId}/status`)
      .set(owner.auth)
      .send({ status: "IN_PROGRESS" });
    expect(asOwner.status).toBe(422);
    expect(asOwner.body.error.code).toBe("HANDSHAKE_REQUIRED");
  });

  it("step 9: five wrong codes lock; correct code during lock is 423; after window it works", async () => {
    const wrong = codeA === "000000" ? "000001" : "000000";
    for (let i = 0; i < 5; i++) {
      const attempt = await request(app)
        .post(`/api/v1/jobs/${jobAId}/start`)
        .set(technician.auth)
        .send({ code: wrong });
      expect(attempt.status).toBe(422);
      expect(attempt.body.error.code).toBe("HANDSHAKE_INVALID");
    }
    const duringLock = await request(app)
      .post(`/api/v1/jobs/${jobAId}/start`)
      .set(technician.auth)
      .send({ code: codeA });
    expect(duringLock.status).toBe(423);
    expect(duringLock.body.error.code).toBe("HANDSHAKE_LOCKED");

    // Simulate the 15-minute window passing.
    await prisma.job.update({
      where: { id: jobAId },
      data: { handshakeLockedUntil: new Date(Date.now() - 1000) },
    });

    const start = await request(app)
      .post(`/api/v1/jobs/${jobAId}/start`)
      .set(technician.auth)
      .send({ code: codeA });
    expect(start.status).toBe(200);
    expect(start.body.data.status).toBe("IN_PROGRESS");

    const history = await prisma.jobStatusHistory.findMany({
      where: { jobId: jobAId, toStatus: "IN_PROGRESS" },
    });
    expect(history.some((h) => h.reason === "Handshake verified")).toBe(true);
    const audit = await prisma.portalAuditEvent.findMany({
      where: { jobId: jobAId, action: "HANDSHAKE_VERIFIED" },
    });
    expect(audit.length).toBe(1);
  });

  it("step 11: dispatcher override starts a second job and is audited with reason", async () => {
    await request(app)
      .post(`/api/v1/jobs/${jobBId}/assign`)
      .set(owner.auth)
      .send({ technicianId: technician.userId })
      .expect(200);
    await request(app)
      .post(`/api/v1/jobs/${jobBId}/status`)
      .set(owner.auth)
      .send({ status: "SCHEDULED" })
      .expect(200);
    await request(app)
      .post(`/api/v1/jobs/${jobBId}/status`)
      .set(technician.auth)
      .send({ status: "EN_ROUTE" })
      .expect(200);

    const override = await request(app)
      .post(`/api/v1/jobs/${jobBId}/start/override`)
      .set(dispatcher.auth)
      .send({ reason: "Customer is at work, verified by phone" });
    expect(override.status).toBe(200);
    expect(override.body.data.status).toBe("IN_PROGRESS");

    const audit = await prisma.portalAuditEvent.findMany({
      where: { jobId: jobBId, action: "HANDSHAKE_OVERRIDDEN" },
    });
    expect(audit.length).toBe(1);
    expect(audit[0].actorUserId).toBe(dispatcher.userId);
  });

  it("step 12: complete + invoice + payment keeps portal open; review closes it with contacts", async () => {
    await request(app)
      .post(`/api/v1/jobs/${jobAId}/parts`)
      .set(owner.auth)
      .send({
        name: "Compressor",
        quantity: 1,
        unitPriceMinor: 27500,
        currency: "USD",
      })
      .expect(201);
    const complete = await request(app)
      .post(`/api/v1/jobs/${jobAId}/complete`)
      .set(owner.auth)
      .send({ summary: "Compressor replaced and tested." });
    expect(complete.status).toBe(200);

    const invoiceRes = await request(app)
      .post(`/api/v1/invoices/from-job/${jobAId}`)
      .set(owner.auth)
      .send({ allowZeroAmount: true });
    expect(invoiceRes.status).toBe(201);
    const invoice = invoiceRes.body.data;
    await request(app)
      .post(`/api/v1/invoices/${invoice.id}/issue`)
      .set(owner.auth)
      .expect(200);
    const pay = await request(app)
      .post(`/api/v1/invoices/${invoice.id}/payments`)
      .set(owner.auth)
      .set("Idempotency-Key", `e2e-pay-${suffix()}`)
      .send({
        amountMinor: Number(invoice.totalMinor),
        currency: "USD",
        method: "CARD",
        reference: "e2e-payment",
      });
    expect(pay.status).toBe(201);

    // Paid but no review yet -> portal still open.
    const stillOpen = await request(app)
      .get("/api/v1/portal/job")
      .set("Cookie", cookieA);
    expect(stillOpen.status).toBe(200);

    const review = await request(app)
      .post("/api/v1/portal/reviews")
      .set("Cookie", cookieA)
      .set("x-aera-portal", "1")
      .send({ rating: 5, comment: "Fast and professional" });
    expect(review.status).toBe(201);

    // Now the portal is closed, and the closed response carries contacts.
    const closed = await request(app)
      .get("/api/v1/portal/job")
      .set("Cookie", cookieA);
    expect(closed.status).toBe(410);
    expect(closed.body.data.company.name).toBe(companyName);
    const roles = (closed.body.data.contacts as Array<{ role: string }>).map(
      (c) => c.role,
    );
    expect(roles).toContain("OWNER");
    expect(roles).toContain("DISPATCHER");
  });

  it("step 13: reissue on the completed job mints a working new link; deactivate kills it instantly", async () => {
    const reissue = await request(app)
      .post(`/api/v1/jobs/${jobAId}/portal-access/reissue`)
      .set(owner.auth)
      .send({ channels: ["SMS", "EMAIL"] });
    expect(reissue.status).toBe(201);
    const newToken = (reissue.body.data.link as string).split("#t=")[1];

    const exchange = await request(app)
      .post("/api/v1/portal/exchange")
      .set("X-Aera-Portal", "1")
      .set("x-aera-portal", "1")
      .send({ token: newToken });
    expect(exchange.status).toBe(200);
    const newCookie = exchange.headers["set-cookie"][0].split(";")[0];

    const home = await request(app)
      .get("/api/v1/portal/job")
      .set("Cookie", newCookie);
    expect(home.status).toBe(200);

    await request(app)
      .post(`/api/v1/jobs/${jobAId}/portal-access/deactivate`)
      .set(owner.auth)
      .send({})
      .expect(200);

    const dead = await request(app)
      .get("/api/v1/portal/job")
      .set("Cookie", newCookie);
    expect(dead.status).toBe(410);
  });
});
