/**
 * Portal link delivery tests (remediation R-12/R-13/R-14, register R-22).
 *
 * The SMS/Email adapters are stubbed at the module boundary so delivery
 * success, failure (with queue retries) and missing/invalid contacts are
 * exercised deterministically. Delivery must be queued, audited per
 * channel, and must never fail issuance.
 */
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { smsSend, emailSend } = vi.hoisted(() => ({
  smsSend: vi.fn(),
  emailSend: vi.fn(),
}));

vi.mock("../src/modules/notifications/textbee-sms.adapter.js", () => ({
  textbeeSmsAdapter: { send: smsSend },
}));

vi.mock("../src/modules/notifications/resend-email.adapter.js", () => ({
  resendEmailAdapter: { send: emailSend },
}));

import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/common/auth/password.js";
import {
  createAccessToken,
  hashRefreshToken,
} from "../src/common/auth/tokens.js";
import { prisma } from "../src/db/prisma.js";
import { sendPortalLink } from "../src/modules/portal/portal-delivery.service.js";
import { inProcessQueue } from "../src/queue/in-process-queue.adapter.js";

const app = buildApp();

function suffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

let companyId: string;
let customerId: string;
let jobId: string;
let grantId: string;
let ownerAuth: { Authorization: string };

async function createOwnerAuth(targetCompanyId: string) {
  const user = await prisma.user.create({
    data: {
      email: `owner-${suffix()}@example.com`,
      passwordHash: await hashPassword("TestPassword123!"),
      firstName: "Olivia",
      lastName: "Owner",
      phone: `+1555${Math.floor(1000000 + Math.random() * 9000000)}`,
    },
  });
  await prisma.companyMember.create({
    data: {
      companyId: targetCompanyId,
      userId: user.id,
      role: "OWNER",
      status: "ACTIVE",
    },
  });
  const sessionId = crypto.randomUUID();
  await prisma.refreshSession.create({
    data: {
      id: sessionId,
      userId: user.id,
      companyId: targetCompanyId,
      tokenHash: hashRefreshToken(crypto.randomUUID()),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  const accessToken = await createAccessToken({
    userId: user.id,
    sessionId,
    companyId: targetCompanyId,
    role: "OWNER",
  });
  return { Authorization: `Bearer ${accessToken}` };
}

// Full wipe, not a hand-ordered deleteMany list: other suites share this
// database and may leave quotes/invoices/etc. behind, and a partial list
// breaks on their FK constraints depending on file execution order.
async function wipeAllTables() {
  const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const names = rows.map((row) => `"${row.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`,
  );
}

beforeEach(async () => {
  smsSend.mockReset();
  emailSend.mockReset();
  smsSend.mockResolvedValue(undefined);
  emailSend.mockResolvedValue(undefined);

  await wipeAllTables();

  const company = await prisma.company.create({
    data: {
      name: "Delivery HVAC",
      slug: `delivery-${suffix()}`,
      phone: "+15559998888",
    },
  });
  companyId = company.id;
  ownerAuth = await createOwnerAuth(companyId);

  const customer = await prisma.customer.create({
    data: {
      companyId,
      firstName: "Dana",
      lastName: "Customer",
      email: "dana@example.com",
      phone: "+15551234567",
    },
  });
  customerId = customer.id;

  const address = await prisma.serviceAddress.create({
    data: {
      companyId,
      customerId,
      label: "Home",
      line1: "1 Main St",
      city: "Austin",
      region: "TX",
      postalCode: "78701",
      countryCode: "US",
    },
  });

  const job = await prisma.job.create({
    data: {
      companyId,
      customerId,
      serviceAddressId: address.id,
      jobNumber: 42,
      serviceType: "REPAIR",
      problemDescription: "No cooling",
      status: "NEW",
      handshakeVersion: 1,
    },
  });
  jobId = job.id;

  const grant = await prisma.portalAccessGrant.create({
    data: {
      companyId,
      customerId,
      jobId,
      linkTokenHash: `hash-${suffix()}`,
      linkExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: "ACTIVE",
    },
  });
  grantId = grant.id;
});

const LINK = "https://portal.quantixlabs.live/open#t=test-token-value";

function deliver(channels: ("SMS" | "EMAIL")[]) {
  return sendPortalLink({
    companyId,
    customerId,
    jobId,
    grantId,
    jobNumber: 42,
    link: LINK,
    channels,
  });
}

async function deliveryAudits(action: string) {
  return prisma.portalAuditEvent.findMany({
    where: { jobId, action },
    orderBy: { createdAt: "asc" },
  });
}

describe("portal link delivery (queued, audited)", () => {
  it("link delivery success: queued, sent via adapters, audited per channel", async () => {
    const results = await deliver(["SMS", "EMAIL"]);
    expect(results).toEqual([
      { channel: "SMS", status: "QUEUED" },
      { channel: "EMAIL", status: "QUEUED" },
    ]);

    await inProcessQueue.onIdle();

    expect(smsSend).toHaveBeenCalledTimes(1);
    const smsArgs = smsSend.mock.calls[0][0] as { to: string; body: string };
    expect(smsArgs.to).toBe("+15551234567");
    expect(smsArgs.body).toContain("job #42");
    expect(smsArgs.body).toContain(LINK);

    expect(emailSend).toHaveBeenCalledTimes(1);
    const emailArgs = emailSend.mock.calls[0][0] as {
      to: string;
      subject: string;
      text: string;
    };
    expect(emailArgs.to).toBe("dana@example.com");
    expect(emailArgs.subject).toContain("job #42");
    expect(emailArgs.text).toContain(LINK);

    const sent = await deliveryAudits("PORTAL_LINK_SENT");
    expect(sent).toHaveLength(2);
    for (const row of sent) {
      const metadata = JSON.stringify(row.metadata);
      expect(metadata).not.toContain("test-token-value");
      expect(metadata).not.toContain("+15551234567");
    }
  });

  it("link delivery failure: retried by the queue and audited, never throws", async () => {
    smsSend.mockRejectedValue(new Error("gateway offline"));

    const results = await deliver(["SMS", "EMAIL"]);
    expect(results).toEqual([
      { channel: "SMS", status: "QUEUED" },
      { channel: "EMAIL", status: "QUEUED" },
    ]);

    await inProcessQueue.onIdle();

    // 1 initial attempt + 2 retries = 3 calls before the failure audit.
    expect(smsSend).toHaveBeenCalledTimes(3);
    expect(emailSend).toHaveBeenCalledTimes(1);

    const failed = await deliveryAudits("PORTAL_LINK_SEND_FAILED");
    expect(failed).toHaveLength(1);
    expect((failed[0].metadata as { channel: string }).channel).toBe("SMS");
    const sent = await deliveryAudits("PORTAL_LINK_SENT");
    expect(sent).toHaveLength(1);
    expect((sent[0].metadata as { channel: string }).channel).toBe("EMAIL");
  });

  it("link delivery missing contact: skipped and audited, adapters untouched", async () => {
    await prisma.customer.update({
      where: { id: customerId },
      data: { phone: null, email: null },
    });

    const results = await deliver(["SMS", "EMAIL"]);
    expect(results).toEqual([
      { channel: "SMS", status: "SKIPPED_NO_CONTACT" },
      { channel: "EMAIL", status: "SKIPPED_NO_CONTACT" },
    ]);

    await inProcessQueue.onIdle();
    expect(smsSend).not.toHaveBeenCalled();
    expect(emailSend).not.toHaveBeenCalled();

    const failed = await deliveryAudits("PORTAL_LINK_SEND_FAILED");
    expect(failed).toHaveLength(2);
    for (const row of failed) {
      expect((row.metadata as { status: string }).status).toBe(
        "SKIPPED_NO_CONTACT",
      );
    }
  });

  it("link delivery invalid phone (not E.164): SMS skipped and audited, email still sent", async () => {
    await prisma.customer.update({
      where: { id: customerId },
      data: { phone: "03001234567" },
    });

    const results = await deliver(["SMS", "EMAIL"]);
    expect(results).toEqual([
      { channel: "SMS", status: "SKIPPED_NO_CONTACT" },
      { channel: "EMAIL", status: "QUEUED" },
    ]);

    await inProcessQueue.onIdle();
    expect(smsSend).not.toHaveBeenCalled();
    expect(emailSend).toHaveBeenCalledTimes(1);

    const failed = await deliveryAudits("PORTAL_LINK_SEND_FAILED");
    expect(failed).toHaveLength(1);
    expect((failed[0].metadata as { status: string }).status).toBe(
      "SKIPPED_NO_CONTACT",
    );
  });

  it("failure of delivery never fails issuance or reissue", async () => {
    smsSend.mockRejectedValue(new Error("gateway offline"));
    emailSend.mockRejectedValue(new Error("provider down"));

    // Remove the fixture's seeded grant so plain issuance applies.
    await prisma.portalAccessGrant.delete({ where: { id: grantId } });

    const issued = await request(app)
      .post(`/api/v1/jobs/${jobId}/portal-access`)
      .set(ownerAuth)
      .send({ channels: ["SMS", "EMAIL"] });
    expect(issued.status).toBe(201);
    expect(issued.body.data.deliveries).toEqual([
      { channel: "SMS", status: "QUEUED" },
      { channel: "EMAIL", status: "QUEUED" },
    ]);

    const reissued = await request(app)
      .post(`/api/v1/jobs/${jobId}/portal-access/reissue`)
      .set(ownerAuth)
      .send({ channels: ["SMS", "EMAIL"] });
    expect(reissued.status).toBe(201);
    expect(reissued.body.data.deliveries).toEqual([
      { channel: "SMS", status: "QUEUED" },
      { channel: "EMAIL", status: "QUEUED" },
    ]);

    await inProcessQueue.onIdle();
    // Both channels failed in the worker and were audited; the HTTP
    // operations above still succeeded.
    const failed = await deliveryAudits("PORTAL_LINK_SEND_FAILED");
    expect(failed.length).toBeGreaterThanOrEqual(2);
  });
});
