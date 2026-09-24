import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { sweepExpiredQuotes } from "../src/modules/quotes/quote.service.js";

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
    userId: res.body.data.user.id as string,
  };
}

async function createCustomerWithAddress(auth: { Authorization: string }) {
  const customer = await request(app)
    .post("/api/v1/customers")
    .set(auth)
    .send({ firstName: "Sarah", lastName: "Connor" });
  expect(customer.status).toBe(201);

  const address = await request(app)
    .post(`/api/v1/customers/${customer.body.data.id}/addresses`)
    .set(auth)
    .send({
      label: "HQ",
      line1: "42 Resistance Way",
      city: "Los Angeles",
      countryCode: "US",
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
  const job = await request(app).post("/api/v1/jobs").set(auth).send({
    customerId,
    serviceAddressId,
    serviceType: "Compressor Replacement",
    problemDescription: "Outdoor condenser fan not spinning",
  });
  expect(job.status).toBe(201);
  return job.body.data.id as string;
}

async function createQuote(
  auth: { Authorization: string },
  customerId: string,
  options: { jobId?: string; expiresAt?: string | Date },
) {
  const quote = await request(app)
    .post("/api/v1/quotes")
    .set(auth)
    .send({
      customerId,
      jobId: options.jobId,
      currency: "USD",
      expiresAt: options.expiresAt,
      items: [
        {
          description: "Replaced 45uF Run Capacitor",
          quantity: 1,
          unitPriceMinor: 8500,
        },
        {
          description: "System diagnostic and performance verification",
          quantity: 1,
          unitPriceMinor: 12000,
        },
      ],
    });
  expect(quote.status).toBe(201);
  return quote.body.data;
}

async function sendQuote(auth: { Authorization: string }, quoteId: string) {
  const res = await request(app)
    .post(`/api/v1/quotes/${quoteId}/send`)
    .set(auth);
  expect(res.status).toBe(200);
  return res.body.data;
}

describe("Phase C1 — Quote Expiry Enforcement (Public and Lifecycle)", () => {
  it("rejects public read when a quote has expired and does not leak internal quote data", async () => {
    const owner = await registerOwner("expiry-read");
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const { customerId } = await createCustomerWithAddress(auth);

    const pastDate = new Date(Date.now() - 3600 * 1000);
    const quote = await createQuote(auth, customerId, { expiresAt: pastDate });
    // Manually force sent status in DB with past expiry for test
    const sent = await prisma.quote.update({
      where: { id: quote.id },
      data: {
        status: "SENT",
        shareToken: `token-${quote.id}-read`,
        expiresAt: pastDate,
      },
    });

    const response = await request(app).get(
      `/api/v1/quotes/shared/${sent.shareToken}`,
    );

    expect(response.status).toBe(410);
    expect(response.body.error.code).toBe("QUOTE_EXPIRED");
    expect(response.body.error.message).toBe("This quote link has expired");
    // Ensure no internal items or customer details are exposed
    expect(response.body.data).toBeUndefined();
    expect(response.body.items).toBeUndefined();
    expect(response.body.subtotalMinor).toBeUndefined();

    // Verify lazy DB update to EXPIRED
    const dbQuote = await prisma.quote.findUniqueOrThrow({
      where: { id: quote.id },
    });
    expect(dbQuote.status).toBe("EXPIRED");
  });

  it("rejects public respond (approve/decline) when a quote has expired", async () => {
    const owner = await registerOwner("expiry-respond");
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const { customerId } = await createCustomerWithAddress(auth);

    const pastDate = new Date(Date.now() - 7200 * 1000);
    const quote = await createQuote(auth, customerId, { expiresAt: pastDate });
    const sent = await prisma.quote.update({
      where: { id: quote.id },
      data: {
        status: "SENT",
        shareToken: `token-${quote.id}-respond`,
        expiresAt: pastDate,
      },
    });

    // Attempt approve
    const approveRes = await request(app)
      .post(`/api/v1/quotes/shared/${sent.shareToken}/respond`)
      .send({ action: "APPROVED" });

    expect(approveRes.status).toBe(410);
    expect(approveRes.body.error.code).toBe("QUOTE_EXPIRED");

    // Attempt decline
    const declineRes = await request(app)
      .post(`/api/v1/quotes/shared/${sent.shareToken}/respond`)
      .send({ action: "DECLINED" });

    expect(declineRes.status).toBe(410);
    expect(declineRes.body.error.code).toBe("QUOTE_EXPIRED");

    // Confirm no approval event was recorded
    const events = await prisma.quoteApprovalEvent.findMany({
      where: { quoteId: quote.id },
    });
    expect(events.length).toBe(0);
  });

  it("permits public read and approval before expiration timestamp", async () => {
    const owner = await registerOwner("valid-before-expiry");
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const { customerId } = await createCustomerWithAddress(auth);

    const futureDate = new Date(Date.now() + 86400 * 1000); // +24 hours
    const quote = await createQuote(auth, customerId, {
      expiresAt: futureDate,
    });
    const sent = await sendQuote(auth, quote.id);

    // Read quote publicly
    const readRes = await request(app).get(
      `/api/v1/quotes/shared/${sent.shareToken}`,
    );
    expect(readRes.status).toBe(200);
    expect(readRes.body.data.id).toBe(quote.id);
    expect(readRes.body.data.status).toBe("SENT");
    expect(readRes.body.data.items.length).toBe(2);

    // Approve quote publicly
    const approveRes = await request(app)
      .post(`/api/v1/quotes/shared/${sent.shareToken}/respond`)
      .send({ action: "APPROVED" });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe("APPROVED");
    expect(approveRes.body.data.approvedAt).toBeDefined();
  });

  it("enforces exact expiry boundary precision", async () => {
    const owner = await registerOwner("boundary-test");
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const { customerId } = await createCustomerWithAddress(auth);

    const fixedBoundary = new Date("2026-11-01T15:00:00.000Z");
    const quote = await createQuote(auth, customerId, {
      expiresAt: fixedBoundary,
    });
    const sent = await sendQuote(auth, quote.id);

    vi.useFakeTimers();
    try {
      // 1000ms BEFORE boundary: MUST succeed
      vi.setSystemTime(new Date("2026-11-01T14:59:59.000Z"));
      const beforeRes = await request(app).get(
        `/api/v1/quotes/shared/${sent.shareToken}`,
      );
      expect(beforeRes.status).toBe(200);

      // EXACT boundary timestamp: MUST be expired
      vi.setSystemTime(new Date("2026-11-01T15:00:00.000Z"));
      const atBoundaryRes = await request(app).get(
        `/api/v1/quotes/shared/${sent.shareToken}`,
      );
      expect(atBoundaryRes.status).toBe(410);
      expect(atBoundaryRes.body.error.code).toBe("QUOTE_EXPIRED");

      // 1000ms AFTER boundary: MUST be expired
      vi.setSystemTime(new Date("2026-11-01T15:00:01.000Z"));
      const afterBoundaryRes = await request(app)
        .post(`/api/v1/quotes/shared/${sent.shareToken}/respond`)
        .send({ action: "APPROVED" });
      expect(afterBoundaryRes.status).toBe(410);
      expect(afterBoundaryRes.body.error.code).toBe("QUOTE_EXPIRED");
    } finally {
      vi.useRealTimers();
    }
  });

  it("evaluates expiry uniformly across timezones with UTC offsets", async () => {
    const owner = await registerOwner("timezone-test");
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const { customerId } = await createCustomerWithAddress(auth);

    // 2026-12-01T17:00:00+05:00 is exactly 2026-12-01T12:00:00.000Z
    const isoPlusFive = "2026-12-01T17:00:00+05:00";
    const quoteA = await createQuote(auth, customerId, {
      expiresAt: isoPlusFive,
    });
    const sentA = await sendQuote(auth, quoteA.id);

    // 2026-12-01T08:00:00-04:00 is also exactly 2026-12-01T12:00:00.000Z
    const isoMinusFour = "2026-12-01T08:00:00-04:00";
    const quoteB = await createQuote(auth, customerId, {
      expiresAt: isoMinusFour,
    });
    const sentB = await sendQuote(auth, quoteB.id);

    vi.useFakeTimers();
    try {
      // 1 minute before UTC 12:00:00 -> both active
      vi.setSystemTime(new Date("2026-12-01T11:59:00.000Z"));
      const aBefore = await request(app).get(
        `/api/v1/quotes/shared/${sentA.shareToken}`,
      );
      const bBefore = await request(app).get(
        `/api/v1/quotes/shared/${sentB.shareToken}`,
      );
      expect(aBefore.status).toBe(200);
      expect(bBefore.status).toBe(200);

      // 1 minute after UTC 12:00:00 -> both expired regardless of initial offset notation
      vi.setSystemTime(new Date("2026-12-01T12:01:00.000Z"));
      const aAfter = await request(app).get(
        `/api/v1/quotes/shared/${sentA.shareToken}`,
      );
      const bAfter = await request(app).get(
        `/api/v1/quotes/shared/${sentB.shareToken}`,
      );
      expect(aAfter.status).toBe(410);
      expect(bAfter.status).toBe(410);
      expect(aAfter.body.error.code).toBe("QUOTE_EXPIRED");
      expect(bAfter.body.error.code).toBe("QUOTE_EXPIRED");
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects sending a quote whose expiration date is already in the past", async () => {
    const owner = await registerOwner("send-past-expiry");
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const { customerId } = await createCustomerWithAddress(auth);

    const past = new Date(Date.now() - 60000);
    const quote = await createQuote(auth, customerId, { expiresAt: past });

    const sendRes = await request(app)
      .post(`/api/v1/quotes/${quote.id}/send`)
      .set(auth);

    expect(sendRes.status).toBe(422);
    expect(sendRes.body.error.code).toBe("QUOTE_EXPIRED");
  });

  it("sweeps expired quotes in bulk via sweepExpiredQuotes", async () => {
    const owner = await registerOwner("sweep-test");
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const { customerId } = await createCustomerWithAddress(auth);

    const pastDate = new Date(Date.now() - 10000);
    const quote = await createQuote(auth, customerId, { expiresAt: pastDate });
    await prisma.quote.update({
      where: { id: quote.id },
      data: { status: "SENT", expiresAt: pastDate },
    });

    const result = await sweepExpiredQuotes(new Date());
    expect(result.expiredCount).toBeGreaterThanOrEqual(1);

    const updated = await prisma.quote.findUniqueOrThrow({
      where: { id: quote.id },
    });
    expect(updated.status).toBe("EXPIRED");
  });
});

describe("Phase C1/C2 — Quote Approval Advances Linked Job", () => {
  it("advances linked job from QUOTING to NEW when quote is approved without prior schedule", async () => {
    const owner = await registerOwner("adv-job-new");
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const { customerId, serviceAddressId } =
      await createCustomerWithAddress(auth);

    const jobId = await createJob(auth, customerId, serviceAddressId);

    // Transition job to QUOTING
    const quotingRes = await request(app)
      .post(`/api/v1/jobs/${jobId}/status`)
      .set(auth)
      .send({ status: "QUOTING", reason: "Preparing formal estimate" });
    expect(quotingRes.status).toBe(200);
    expect(quotingRes.body.data.status).toBe("QUOTING");

    // Create and send quote attached to jobId
    const quote = await createQuote(auth, customerId, {
      jobId,
      expiresAt: new Date(Date.now() + 86400 * 1000),
    });
    const sent = await sendQuote(auth, quote.id);

    // Customer approves via public shared link
    const approveRes = await request(app)
      .post(`/api/v1/quotes/shared/${sent.shareToken}/respond`)
      .send({ action: "APPROVED" });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe("APPROVED");

    // Verify linked job was advanced to NEW (ready for scheduling)
    const jobRes = await request(app).get(`/api/v1/jobs/${jobId}`).set(auth);
    expect(jobRes.status).toBe(200);
    expect(jobRes.body.data.status).toBe("NEW");

    // Verify JobStatusHistory recorded the transition
    const history = await prisma.jobStatusHistory.findMany({
      where: { jobId },
      orderBy: { createdAt: "desc" },
    });
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history[0].fromStatus).toBe("QUOTING");
    expect(history[0].toStatus).toBe("NEW");
    expect(history[0].reason).toContain("Quote approved");

    // Verify QuoteApprovalEvent was recorded
    const events = await prisma.quoteApprovalEvent.findMany({
      where: { quoteId: quote.id },
    });
    expect(events.length).toBe(1);
    expect(events[0].action).toBe("APPROVED");
    expect(events[0].source).toBe("CUSTOMER");

    // Verify quote is still attached to same job and no duplicate jobs exist
    const jobCount = await prisma.job.count({
      where: { customerId },
    });
    expect(jobCount).toBe(1);
    const attachedJob = await prisma.quote.findUniqueOrThrow({
      where: { id: quote.id },
      select: { jobId: true },
    });
    expect(attachedJob.jobId).toBe(jobId);
  });

  it("advances linked job from QUOTING to SCHEDULED when quote is approved and job has a schedule", async () => {
    const owner = await registerOwner("adv-job-scheduled");
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const { customerId, serviceAddressId } =
      await createCustomerWithAddress(auth);

    const jobId = await createJob(auth, customerId, serviceAddressId);

    // Schedule the job first
    const scheduledStart = new Date(Date.now() + 172800 * 1000);
    const scheduledEnd = new Date(Date.now() + 176400 * 1000);
    const scheduleRes = await request(app)
      .post(`/api/v1/schedule/jobs/${jobId}/schedule`)
      .set(auth)
      .send({
        scheduledStart: scheduledStart.toISOString(),
        scheduledEnd: scheduledEnd.toISOString(),
      });
    expect(scheduleRes.status).toBe(200);

    // Move to QUOTING (e.g. quote presented during on-site visit or consultation)
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "QUOTING" },
    });

    const quote = await createQuote(auth, customerId, {
      jobId,
      expiresAt: new Date(Date.now() + 86400 * 1000),
    });
    const sent = await sendQuote(auth, quote.id);

    // Approve
    const approveRes = await request(app)
      .post(`/api/v1/quotes/shared/${sent.shareToken}/respond`)
      .send({ action: "APPROVED" });
    expect(approveRes.status).toBe(200);

    // Job should advance to SCHEDULED because it already has a schedule
    const jobRes = await request(app).get(`/api/v1/jobs/${jobId}`).set(auth);
    expect(jobRes.status).toBe(200);
    expect(jobRes.body.data.status).toBe("SCHEDULED");

    const history = await prisma.jobStatusHistory.findFirstOrThrow({
      where: { jobId, toStatus: "SCHEDULED" },
      orderBy: { createdAt: "desc" },
    });
    expect(history.fromStatus).toBe("QUOTING");
  });

  it("handles idempotent duplicate approval calls safely without duplicating events", async () => {
    const owner = await registerOwner("idempotent-quote");
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const { customerId, serviceAddressId } =
      await createCustomerWithAddress(auth);

    const jobId = await createJob(auth, customerId, serviceAddressId);
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "QUOTING" },
    });

    const quote = await createQuote(auth, customerId, {
      jobId,
      expiresAt: new Date(Date.now() + 86400 * 1000),
    });
    const sent = await sendQuote(auth, quote.id);

    // First approval
    const first = await request(app)
      .post(`/api/v1/quotes/shared/${sent.shareToken}/respond`)
      .send({ action: "APPROVED" });
    expect(first.status).toBe(200);

    // Second approval (e.g. user double-clicked or refreshed)
    const second = await request(app)
      .post(`/api/v1/quotes/shared/${sent.shareToken}/respond`)
      .send({ action: "APPROVED" });
    expect(second.status).toBe(200);
    expect(second.body.data.status).toBe("APPROVED");

    // Only one approval event must exist
    const events = await prisma.quoteApprovalEvent.findMany({
      where: { quoteId: quote.id },
    });
    expect(events.length).toBe(1);

    // Job remains NEW without duplicate transition records
    const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.status).toBe("NEW");
  });

  it("supports staff approval path with authorization checks", async () => {
    const companyA = await registerOwner("staff-quote-a");
    const companyB = await registerOwner("staff-quote-b");

    const authA = { Authorization: `Bearer ${companyA.accessToken}` };
    const authB = { Authorization: `Bearer ${companyB.accessToken}` };

    const { customerId, serviceAddressId } =
      await createCustomerWithAddress(authA);
    const jobId = await createJob(authA, customerId, serviceAddressId);
    await prisma.job.update({
      where: { id: jobId },
      data: { status: "QUOTING" },
    });

    const quote = await createQuote(authA, customerId, {
      jobId,
      expiresAt: new Date(Date.now() + 86400 * 1000),
    });
    await sendQuote(authA, quote.id);

    // 1. Unauthenticated request rejected
    const unauth = await request(app)
      .post(`/api/v1/quotes/${quote.id}/respond`)
      .send({ action: "APPROVED" });
    expect(unauth.status).toBe(401);

    // 2. Cross-company access rejected
    const crossCompany = await request(app)
      .post(`/api/v1/quotes/${quote.id}/respond`)
      .set(authB)
      .send({ action: "APPROVED" });
    expect(crossCompany.status).toBe(404);

    // 3. Authorized staff member approves quote
    const staffApprove = await request(app)
      .post(`/api/v1/quotes/${quote.id}/respond`)
      .set(authA)
      .send({ action: "APPROVED" });
    expect(staffApprove.status).toBe(200);
    expect(staffApprove.body.data.status).toBe("APPROVED");

    // Verify staff approval event attributes actorUserId
    const event = await prisma.quoteApprovalEvent.findFirstOrThrow({
      where: { quoteId: quote.id },
    });
    expect(event.source).toBe("STAFF");
    expect(event.actorUserId).toBe(companyA.userId);

    // Verify linked job advanced to NEW
    const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.status).toBe("NEW");
  });
});
