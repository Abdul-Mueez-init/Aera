import { randomBytes, scrypt } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import {
  hashPassword,
  verifyPassword,
} from "../src/common/auth/password.js";
import { prisma } from "../src/db/prisma.js";
import { notificationPublisher } from "../src/modules/notifications/notification.port.js";

const app = buildApp();

function unique(label: string) {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

async function registerOwner(label: string) {
  const suffix = unique(label);
  const email = `owner-${suffix}@example.com`;
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({
      email,
      password: "Str0ngPass!234",
      firstName: "Owner",
      lastName: label,
      companyName: `Company ${suffix}`,
    });
  expect(res.status).toBe(201);
  return {
    accessToken: res.body.data.accessToken as string,
    userId: res.body.data.user.id as string,
    companyId: res.body.data.company.id as string,
    email,
  };
}

async function seedCustomer(
  companyId: string,
  label: string,
  withContacts = false,
) {
  const customer = await prisma.customer.create({
    data: {
      companyId,
      firstName: "Pat",
      lastName: label,
      ...(withContacts
        ? { email: `pat-${unique(label)}@example.com`, phone: "+1555000111" }
        : {}),
    },
  });
  const address = await prisma.serviceAddress.create({
    data: {
      companyId,
      customerId: customer.id,
      label: "Home",
      line1: "1 Main St",
      city: "Springfield",
      countryCode: "US",
    },
  });
  return { customer, address };
}

async function seedJob(
  companyId: string,
  customerId: string,
  addressId: string,
  data: Record<string, unknown> = {},
) {
  const counter = await prisma.companyCounter.upsert({
    where: { companyId_kind: { companyId, kind: "JOB_NUMBER" } },
    create: { companyId, kind: "JOB_NUMBER", lastValue: 1 },
    update: { lastValue: { increment: 1 } },
  });
  return prisma.job.create({
    data: {
      companyId,
      customerId,
      serviceAddressId: addressId,
      jobNumber: counter.lastValue,
      serviceType: "HVAC Repair",
      problemDescription: "No cooling",
      ...data,
    },
  });
}

describe("Audit fixes: quote quantity precision (Decimal(10,2))", () => {
  async function createQuoteWithQuantity(
    accessToken: string,
    customerId: string,
    quantity: string,
  ) {
    return request(app)
      .post("/api/v1/quotes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        customerId,
        currency: "USD",
        items: [
          { description: "Labour", quantity, unitPriceMinor: 1000 },
        ],
      });
  }

  it("rejects quantities the Decimal(10,2) column cannot store exactly", async () => {
    const owner = await registerOwner("qty");
    const { customer } = await seedCustomer(owner.companyId, "qty");

    for (const bad of ["1.234", "0", "0.00", "123456789", "99999999.999"]) {
      const res = await createQuoteWithQuantity(
        owner.accessToken,
        customer.id,
        bad,
      );
      expect(res.status, `quantity ${bad}`).toBe(422);
    }

    const ok = await createQuoteWithQuantity(
      owner.accessToken,
      customer.id,
      "2.50",
    );
    expect(ok.status).toBe(201);
  });

  it("rejects a job part quantity with more than 2 decimal places", async () => {
    const owner = await registerOwner("partqty");
    const { customer, address } = await seedCustomer(
      owner.companyId,
      "partqty",
    );
    const job = await seedJob(owner.companyId, customer.id, address.id);

    const bad = await request(app)
      .post(`/api/v1/jobs/${job.id}/parts`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({
        name: "Filter",
        quantity: 1.005,
        unitPriceMinor: 500,
        currency: "USD",
      });
    expect(bad.status).toBe(422);

    const ok = await request(app)
      .post(`/api/v1/jobs/${job.id}/parts`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({
        name: "Filter",
        quantity: 1.25,
        unitPriceMinor: 500,
        currency: "USD",
      });
    expect(ok.status).toBe(201);
  });
});

describe("Audit fixes: list pagination contract", () => {
  it("quotes list returns { items, meta } and pages without dropping rows", async () => {
    const owner = await registerOwner("quotepage");
    const { customer } = await seedCustomer(owner.companyId, "quotepage");
    for (let i = 0; i < 3; i += 1) {
      const res = await request(app)
        .post("/api/v1/quotes")
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({
          customerId: customer.id,
          currency: "USD",
          items: [
            { description: `Item ${i}`, quantity: "1", unitPriceMinor: 100 },
          ],
        });
      expect(res.status).toBe(201);
    }

    const page1 = await request(app)
      .get("/api/v1/quotes?page=1&pageSize=2")
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(page1.status).toBe(200);
    expect(page1.body.data.items).toHaveLength(2);
    expect(page1.body.data.meta).toMatchObject({
      page: 1,
      pageSize: 2,
      total: 3,
      pageCount: 2,
    });

    const page2 = await request(app)
      .get("/api/v1/quotes?page=2&pageSize=2")
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(page2.body.data.items).toHaveLength(1);
  });

  it("invoices list returns { items, meta } with the true total", async () => {
    const owner = await registerOwner("invpage");
    const { customer } = await seedCustomer(owner.companyId, "invpage");
    for (let i = 0; i < 3; i += 1) {
      await prisma.invoice.create({
        data: {
          companyId: owner.companyId,
          customerId: customer.id,
          invoiceNumber: `INV-${unique("inv")}-${i}`,
          status: "ISSUED",
          subtotalMinor: 100n,
          totalMinor: 100n,
          balanceDueMinor: 100n,
          currency: "USD",
        },
      });
    }

    const res = await request(app)
      .get("/api/v1/invoices?page=1&pageSize=2")
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.meta.total).toBe(3);
  });
});

describe("Audit fixes: job customer lock and final-job notes", () => {
  it("refuses to move a job to another customer once a quote exists for it", async () => {
    const owner = await registerOwner("custlock");
    const first = await seedCustomer(owner.companyId, "first");
    const second = await seedCustomer(owner.companyId, "second");
    const job = await seedJob(owner.companyId, first.customer.id, first.address.id);

    const quoteRes = await request(app)
      .post("/api/v1/quotes")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({
        customerId: first.customer.id,
        jobId: job.id,
        currency: "USD",
        items: [{ description: "Labour", quantity: "1", unitPriceMinor: 100 }],
      });
    expect(quoteRes.status).toBe(201);

    const move = await request(app)
      .patch(`/api/v1/jobs/${job.id}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({
        customerId: second.customer.id,
        serviceAddressId: second.address.id,
      });
    expect(move.status).toBe(409);
    expect(move.body.error.code).toBe("JOB_CUSTOMER_LOCKED");
  });

  it("allows the same move when nothing is linked yet", async () => {
    const owner = await registerOwner("custmove");
    const first = await seedCustomer(owner.companyId, "first");
    const second = await seedCustomer(owner.companyId, "second");
    const job = await seedJob(owner.companyId, first.customer.id, first.address.id);

    const move = await request(app)
      .patch(`/api/v1/jobs/${job.id}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({
        customerId: second.customer.id,
        serviceAddressId: second.address.id,
      });
    expect(move.status).toBe(200);
    expect(move.body.data.customer.id).toBe(second.customer.id);
  });

  it("rejects notes on a completed job", async () => {
    const owner = await registerOwner("notefinal");
    const { customer, address } = await seedCustomer(owner.companyId, "note");
    const job = await seedJob(owner.companyId, customer.id, address.id, {
      status: "COMPLETED",
      completedAt: new Date(),
    });

    const res = await request(app)
      .post(`/api/v1/jobs/${job.id}/notes`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ body: "Late note", visibility: "INTERNAL" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("JOB_IMMUTABLE");
  });
});

describe("Audit fixes: last-owner invariant", () => {
  async function ownMemberId(accessToken: string, companyId: string) {
    // The caller's own membership is the ACTIVE one. Filtering on status
    // matters: an INVITED owner row also matches role=OWNER, and an
    // unordered findMany may return it first (row order differs across
    // Postgres builds), which would silently demote the wrong member.
    const members = await prisma.companyMember.findMany({
      where: { companyId, role: "OWNER", status: "ACTIVE" },
    });
    return members;
  }

  it("blocks a sole owner from demoting themselves", async () => {
    const owner = await registerOwner("lastowner");
    const [self] = await ownMemberId(owner.accessToken, owner.companyId);
    expect(self).toBeDefined();

    const demote = await request(app)
      .patch(`/api/v1/companies/current/members/${self!.id}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ role: "TECHNICIAN" });
    expect(demote.status).toBe(409);
    expect(demote.body.error.code).toBe("LAST_OWNER_REQUIRED");
  });

  it("an INVITED second owner does not satisfy the invariant", async () => {
    const owner = await registerOwner("lastowner-invited");
    const invite = await request(app)
      .post("/api/v1/companies/current/invitations")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({
        email: `second-${unique("o")}@example.com`,
        firstName: "Second",
        lastName: "Owner",
        role: "OWNER",
      });
    expect(invite.status).toBe(201);

    const [self] = await ownMemberId(owner.accessToken, owner.companyId);
    const demote = await request(app)
      .patch(`/api/v1/companies/current/members/${self!.id}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ role: "DISPATCHER" });
    expect(demote.status).toBe(409);
    expect(demote.body.error.code).toBe("LAST_OWNER_REQUIRED");
  });

  it("allows demoting another owner once a second ACTIVE owner exists", async () => {
    const owner = await registerOwner("twoowners");
    const inviteEmail = `second-${unique("o")}@example.com`;
    const invite = await request(app)
      .post("/api/v1/companies/current/invitations")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({
        email: inviteEmail,
        firstName: "Second",
        lastName: "Owner",
        role: "OWNER",
      });
    expect(invite.status).toBe(201);
    const secondMemberId = invite.body.data.id as string;

    const accept = await request(app)
      .post("/api/v1/auth/accept-invitation")
      .send({
        token: invite.body.data.invitationToken,
        password: "Str0ngPass!234",
        email: inviteEmail,
      });
    expect(accept.status).toBe(200);

    const demote = await request(app)
      .patch(`/api/v1/companies/current/members/${secondMemberId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ role: "DISPATCHER" });
    expect(demote.status).toBe(200);
    expect(demote.body.data.role).toBe("DISPATCHER");
  });
});

describe("Audit fixes: customer archive ends portal access; list includes address", () => {
  it("archiving a customer deactivates their portal grants and revokes sessions", async () => {
    const owner = await registerOwner("archiveportal");
    const { customer, address } = await seedCustomer(
      owner.companyId,
      "archive",
    );
    const job = await seedJob(owner.companyId, customer.id, address.id);
    const grant = await prisma.portalAccessGrant.create({
      data: {
        companyId: owner.companyId,
        customerId: customer.id,
        jobId: job.id,
        issuedBy: owner.userId,
        linkTokenHash: `hash-${unique("grant")}`,
        linkExpiresAt: new Date(Date.now() + 3_600_000),
        status: "ACTIVE",
      },
    });
    const session = await prisma.portalSession.create({
      data: {
        grantId: grant.id,
        companyId: owner.companyId,
        customerId: customer.id,
        jobId: job.id,
        sessionTokenHash: `hash-${unique("session")}`,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });

    const res = await request(app)
      .delete(`/api/v1/customers/${customer.id}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(res.status).toBe(204);

    const reloadedGrant = await prisma.portalAccessGrant.findUniqueOrThrow({
      where: { id: grant.id },
    });
    expect(reloadedGrant.status).toBe("DEACTIVATED");
    const reloadedSession = await prisma.portalSession.findUniqueOrThrow({
      where: { id: session.id },
    });
    expect(reloadedSession.revokedAt).not.toBeNull();
    const audit = await prisma.portalAuditEvent.findFirst({
      where: { grantId: grant.id, action: "PORTAL_DEACTIVATED" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorUserId).toBe(owner.userId);
  });

  it("the customers list includes each customer's first service address", async () => {
    const owner = await registerOwner("listaddr");
    const { customer, address } = await seedCustomer(owner.companyId, "addr");

    const res = await request(app)
      .get("/api/v1/customers")
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(res.status).toBe(200);
    const row = (
      res.body.data.items as Array<{
        id: string;
        serviceAddresses?: Array<{ id: string; line1: string }>;
      }>
    ).find((entry) => entry.id === customer.id);
    expect(row).toBeDefined();
    expect(row?.serviceAddresses).toHaveLength(1);
    expect(row?.serviceAddresses?.[0]?.id).toBe(address.id);
    expect(row?.serviceAddresses?.[0]?.line1).toBe("1 Main St");
  });

  it("reissue honours the same 5-per-hour issuance cap as issue", async () => {
    const owner = await registerOwner("reissuecap");
    const { customer, address } = await seedCustomer(owner.companyId, "cap");
    const job = await seedJob(owner.companyId, customer.id, address.id);

    // Seed 5 grants created within the last hour (mix of statuses).
    for (let i = 0; i < 5; i += 1) {
      await prisma.portalAccessGrant.create({
        data: {
          companyId: owner.companyId,
          customerId: customer.id,
          jobId: job.id,
          issuedBy: owner.userId,
          linkTokenHash: `hash-${unique("cap")}-${i}`,
          linkExpiresAt: new Date(Date.now() + 3_600_000),
          status: i === 4 ? "ACTIVE" : "DEACTIVATED",
        },
      });
    }

    const res = await request(app)
      .post(`/api/v1/jobs/${job.id}/portal-access/reissue`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({});
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
  });
});

describe("Audit fixes: technician today (company timezone + redaction)", () => {
  it("buckets the day by company timezone and withholds customer email/phone", async () => {
    const owner = await registerOwner("todaytz");
    await prisma.company.update({
      where: { id: owner.companyId },
      data: { timezone: "Asia/Karachi" },
    });

    // Technician: register a throwaway account, move its membership.
    const techSuffix = unique("tech");
    const techEmail = `tech-${techSuffix}@example.com`;
    const techReg = await request(app)
      .post("/api/v1/auth/register")
      .send({
        email: techEmail,
        password: "Str0ngPass!234",
        firstName: "Tech",
        lastName: "Today",
        companyName: `Temp ${techSuffix}`,
      });
    expect(techReg.status).toBe(201);
    const techUserId = techReg.body.data.user.id as string;
    await prisma.companyMember.deleteMany({ where: { userId: techUserId } });
    await prisma.companyMember.create({
      data: {
        userId: techUserId,
        companyId: owner.companyId,
        role: "TECHNICIAN",
        status: "ACTIVE",
      },
    });
    await prisma.company.delete({
      where: { id: techReg.body.data.company.id },
    });
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: techEmail, password: "Str0ngPass!234" });
    expect(login.status).toBe(200);
    const techToken = login.body.data.accessToken as string;

    const { customer, address } = await seedCustomer(
      owner.companyId,
      "today",
      true,
    );
    // 2026-10-25T20:30Z is 01:30 on Oct 26 in Asia/Karachi (UTC+5).
    const job = await seedJob(owner.companyId, customer.id, address.id, {
      status: "SCHEDULED",
      assignedTechnicianId: techUserId,
      scheduledStart: new Date("2026-10-25T20:30:00.000Z"),
      scheduledEnd: new Date("2026-10-25T21:30:00.000Z"),
    });

    const on26 = await request(app)
      .get("/api/v1/jobs/today")
      .query({ date: "2026-10-26" })
      .set("Authorization", `Bearer ${techToken}`);
    expect(on26.status).toBe(200);
    const found = on26.body.data.jobs.find(
      (entry: { id: string }) => entry.id === job.id,
    );
    expect(found).toBeDefined();
    expect(found.customer.email).toBeUndefined();
    expect(found.customer.phone).toBeUndefined();
    expect(found.customer.firstName).toBe("Pat");

    const on25 = await request(app)
      .get("/api/v1/jobs/today")
      .query({ date: "2026-10-25" })
      .set("Authorization", `Bearer ${techToken}`);
    expect(
      on25.body.data.jobs.find((entry: { id: string }) => entry.id === job.id),
    ).toBeUndefined();
  });
});

describe("Audit fixes: password verification honours stored scrypt params", () => {
  it("verifies a hash minted with different (valid) stored params", async () => {
    const salt = randomBytes(16);
    const key = await new Promise<Buffer>((resolve, reject) => {
      scrypt(
        "correct horse battery",
        salt,
        64,
        { N: 32768, r: 8, p: 1, maxmem: 128 * 32768 * 8 + 64 * 1024 * 1024 },
        (error, derived) =>
          error ? reject(error) : resolve(derived as Buffer),
      );
    });
    const encoded = [
      "scrypt",
      32768,
      8,
      1,
      salt.toString("base64url"),
      key.toString("base64url"),
    ].join("$");

    expect(await verifyPassword("correct horse battery", encoded)).toBe(true);
    expect(await verifyPassword("wrong password", encoded)).toBe(false);
  });

  it("returns false (never throws) for malformed stored hashes", async () => {
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
    expect(await verifyPassword("x", "scrypt$16384$8$1$$")).toBe(false);
    // N=3 is not a power of two -> rejected by the params guard.
    expect(await verifyPassword("x", "scrypt$3$8$1$c2FsdA$a2V5")).toBe(false);
    // Absurd cost is refused rather than attempted (DoS guard).
    expect(
      await verifyPassword("x", "scrypt$1099511627776$8$1$c2FsdA$a2V5"),
    ).toBe(false);

    const roundtrip = await hashPassword("Str0ngPass!234");
    expect(await verifyPassword("Str0ngPass!234", roundtrip)).toBe(true);
    expect(await verifyPassword("Str0ngPass!235", roundtrip)).toBe(false);
  });
});

describe("Audit fixes: notification recipients must be ACTIVE members", () => {
  it("does not notify an explicit recipient from another company, nor a suspended member", async () => {
    const companyA = await registerOwner("recipA");
    const companyB = await registerOwner("recipB");

    // Cross-tenant: B's user named as recipient of an A event.
    await notificationPublisher.publish({
      type: "JOB_ASSIGNED",
      companyId: companyA.companyId,
      recipientUserId: companyB.userId,
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
    const crossRows = await prisma.notification.findMany({
      where: {
        companyId: companyA.companyId,
        recipientUserId: companyB.userId,
      },
    });
    expect(crossRows).toHaveLength(0);

    // Suspended member of the same company also receives nothing.
    await prisma.companyMember.updateMany({
      where: { companyId: companyA.companyId, userId: companyA.userId },
      data: { status: "SUSPENDED" },
    });
    await notificationPublisher.publish({
      type: "JOB_ASSIGNED",
      companyId: companyA.companyId,
      recipientUserId: companyA.userId,
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
    const suspendedRows = await prisma.notification.findMany({
      where: {
        companyId: companyA.companyId,
        recipientUserId: companyA.userId,
      },
    });
    expect(suspendedRows).toHaveLength(0);
  });
});
