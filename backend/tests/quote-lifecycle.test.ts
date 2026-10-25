import request from "supertest";
import { describe, expect, it } from "vitest";
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
          quantity: "1",
          unitPriceMinor: 8500,
        },
        {
          description: "System diagnostic and performance verification",
          quantity: "1",
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

// Issues a job-scoped portal grant through the staff endpoint and
// exchanges the one-time link token for a portal session cookie.
async function openPortalSession(
  auth: { Authorization: string },
  jobId: string,
) {
  const issue = await request(app)
    .post(`/api/v1/jobs/${jobId}/portal-access`)
    .set(auth)
    .send({});
  expect(issue.status).toBe(201);
  const link = issue.body.data.link as string;
  const token = link.split("#t=")[1];
  expect(token).toBeDefined();

  const exchange = await request(app)
    .post("/api/v1/portal/exchange")
    .send({ token });
  expect(exchange.status).toBe(200);
  const setCookie = exchange.headers["set-cookie"] as unknown as string[];
  expect(setCookie).toBeDefined();
  return setCookie[0].split(";")[0];
}

async function portalRespond(
  cookie: string,
  quoteId: string,
  action: "APPROVED" | "DECLINED",
) {
  return request(app)
    .post(`/api/v1/portal/quotes/${quoteId}/respond`)
    .set("Cookie", cookie)
    .set("X-Aera-Portal", "1")
    .send({ action });
}

async function staffRespond(
  auth: { Authorization: string },
  quoteId: string,
  action: "APPROVED" | "DECLINED",
) {
  return request(app)
    .post(`/api/v1/quotes/${quoteId}/respond`)
    .set(auth)
    .send({ action });
}

// Formats an instant as an ISO string in a fixed UTC offset notation
// (e.g. 2026-12-01T17:00:00.000+05:00), for the timezone test below.
function isoWithOffset(instant: Date, offsetMinutes: number): string {
  const shifted = new Date(instant.getTime() + offsetMinutes * 60_000);
  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${shifted.toISOString().slice(0, -1)}${sign}${hh}:${mm}`;
}

async function waitUntil(instant: Date, graceMs: number) {
  const waitMs = instant.getTime() - Date.now() + graceMs;
  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

describe("Phase C1 — Quote Expiry Enforcement (Portal and Lifecycle)", () => {
  it("rejects an expired quote on every surface and does not leak internal quote data", async () => {
    const owner = await registerOwner("expiry-read");
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const { customerId, serviceAddressId } =
      await createCustomerWithAddress(auth);
    const jobId = await createJob(auth, customerId, serviceAddressId);

    const pastDate = new Date(Date.now() - 3600 * 1000);
    const quote = await createQuote(auth, customerId, {
      jobId,
      expiresAt: pastDate,
    });
    // Manually force sent status in DB with past expiry for test
    const sent = await prisma.quote.update({
      where: { id: quote.id },
      data: {
        status: "SENT",
        shareToken: `token-${quote.id}-read`,
        expiresAt: pastDate,
      },
    });

    // The legacy shared-link surface is gone, so the old credential
    // resolves nothing.
    const legacy = await request(app).get(
      `/api/v1/quotes/shared/${sent.shareToken}`,
    );
    expect(legacy.status).toBe(404);

    // The shared approval domain logic rejects the expired quote.
    const response = await staffRespond(auth, quote.id, "APPROVED");
    expect(response.status).toBe(410);
    expect(response.body.error.code).toBe("QUOTE_EXPIRED");
    expect(response.body.error.message).toBe("This quote has expired");
    // Ensure no internal items or customer details are exposed
    expect(response.body.data).toBeUndefined();
    expect(response.body.items).toBeUndefined();
    expect(response.body.subtotalMinor).toBeUndefined();

    // Verify lazy DB update to EXPIRED
    const dbQuote = await prisma.quote.findUniqueOrThrow({
      where: { id: quote.id },
    });
    expect(dbQuote.status).toBe("EXPIRED");

    // The customer portal snapshot no longer surfaces the expired quote
    // (the snapshot only carries SENT/APPROVED/DECLINED quotes), so no
    // internal quote data leaks through the customer surface either.
    const cookie = await openPortalSession(auth, jobId);
    const snapshot = await request(app)
      .get("/api/v1/portal/job")
      .set("Cookie", cookie);
    expect(snapshot.status).toBe(200);
    const visibleIds = (
      snapshot.body.data.quotes as Array<{ id: string }>
    ).map((q) => q.id);
    expect(visibleIds).not.toContain(quote.id);
  });

  it("rejects portal respond (approve/decline) when a quote has expired", async () => {
    const owner = await registerOwner("expiry-respond");
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const { customerId, serviceAddressId } =
      await createCustomerWithAddress(auth);
    const jobId = await createJob(auth, customerId, serviceAddressId);

    const pastDate = new Date(Date.now() - 7200 * 1000);
    const quote = await createQuote(auth, customerId, {
      jobId,
      expiresAt: pastDate,
    });
    await prisma.quote.update({
      where: { id: quote.id },
      data: {
        status: "SENT",
        shareToken: `token-${quote.id}-respond`,
        expiresAt: pastDate,
      },
    });

    const cookie = await openPortalSession(auth, jobId);

    // Handoff 5.5: the portal respond must reuse the shared approval
    // domain logic, which rejects expired quotes with 410 QUOTE_EXPIRED
    // (the error the domain logic actually raises).
    const approveRes = await portalRespond(cookie, quote.id, "APPROVED");
    expect(approveRes.status).toBe(410);
    expect(approveRes.body.error.code).toBe("QUOTE_EXPIRED");

    // Attempt decline
    const declineRes = await portalRespond(cookie, quote.id, "DECLINED");
    expect(declineRes.status).toBe(410);
    expect(declineRes.body.error.code).toBe("QUOTE_EXPIRED");

    // Confirm no approval event was recorded
    const events = await prisma.quoteApprovalEvent.findMany({
      where: { quoteId: quote.id },
    });
    expect(events.length).toBe(0);

    // Verify lazy DB update to EXPIRED
    const dbQuote = await prisma.quote.findUniqueOrThrow({
      where: { id: quote.id },
    });
    expect(dbQuote.status).toBe("EXPIRED");
  });

  it("permits portal read and approval before expiration timestamp", async () => {
    const owner = await registerOwner("valid-before-expiry");
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const { customerId, serviceAddressId } =
      await createCustomerWithAddress(auth);
    const jobId = await createJob(auth, customerId, serviceAddressId);

    const futureDate = new Date(Date.now() + 86400 * 1000); // +24 hours
    const quote = await createQuote(auth, customerId, {
      jobId,
      expiresAt: futureDate,
    });
    await sendQuote(auth, quote.id);

    const cookie = await openPortalSession(auth, jobId);

    // Read the quote through the portal job snapshot
    const snapshot = await request(app)
      .get("/api/v1/portal/job")
      .set("Cookie", cookie);
    expect(snapshot.status).toBe(200);
    const visible = (
      snapshot.body.data.quotes as Array<{
        id: string;
        status: string;
        items: unknown[];
      }>
    ).find((q) => q.id === quote.id);
    expect(visible).toBeDefined();
    expect(visible?.status).toBe("SENT");
    expect(visible?.items.length).toBe(2);

    // Approve the quote through the portal session
    const approveRes = await portalRespond(cookie, quote.id, "APPROVED");
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.status).toBe("APPROVED");

    const dbQuote = await prisma.quote.findUniqueOrThrow({
      where: { id: quote.id },
    });
    expect(dbQuote.status).toBe("APPROVED");
    expect(dbQuote.approvedAt).not.toBeNull();
  });

  it("enforces exact expiry boundary precision", async () => {
    // The boundary comparison in the shared approval domain logic is
    // expiresAt <= now: strictly before the expiry instant a respond
    // still succeeds; once the instant has passed, the same respond is
    // rejected with 410 QUOTE_EXPIRED. Exercised through the staff
    // respond command (the portal surface pins the same rejection in
    // the expired-respond test above).
    //
    // This intentionally uses a short real-time window instead of a
    // faked clock: HTTP requests that run the expired-respond path
    // deadlock under vi.useFakeTimers in this environment (verified by
    // bisection — the service call alone completes under fake time,
    // the HTTP request never returns), so the boundary is crossed by
    // waiting ~3s of real time.
    const owner = await registerOwner("boundary-test");
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const { customerId } = await createCustomerWithAddress(auth);

    const boundary = new Date(Date.now() + 3000);
    const beforeQuote = await createQuote(auth, customerId, {
      expiresAt: boundary,
    });
    await sendQuote(auth, beforeQuote.id);
    const afterQuote = await createQuote(auth, customerId, {
      expiresAt: boundary,
    });
    await sendQuote(auth, afterQuote.id);

    // BEFORE the boundary instant: MUST succeed
    const beforeRes = await staffRespond(auth, beforeQuote.id, "APPROVED");
    expect(beforeRes.status).toBe(200);
    expect(beforeRes.body.data.status).toBe("APPROVED");

    // Cross the boundary instant
    await waitUntil(boundary, 300);

    // AT/AFTER the boundary instant (expiresAt <= now): MUST be expired
    const afterRes = await staffRespond(auth, afterQuote.id, "APPROVED");
    expect(afterRes.status).toBe(410);
    expect(afterRes.body.error.code).toBe("QUOTE_EXPIRED");

    // The rejection lazily transitions the quote to EXPIRED and records
    // no approval event
    const dbQuote = await prisma.quote.findUniqueOrThrow({
      where: { id: afterQuote.id },
    });
    expect(dbQuote.status).toBe("EXPIRED");
    const events = await prisma.quoteApprovalEvent.count({
      where: { quoteId: afterQuote.id },
    });
    expect(events).toBe(0);
  }, 30000);

  it("evaluates expiry uniformly across timezones with UTC offsets", async () => {
    // The same instant written in two offset notations must be treated
    // identically: both quotes are acceptable before the instant and
    // expired after it. Each quote is responded to exactly once, so a
    // pair of quotes per notation covers the before/after checkpoints.
    // Real-time window for the same reason as the boundary test above.
    const owner = await registerOwner("timezone-test");
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const { customerId } = await createCustomerWithAddress(auth);

    const instant = new Date(Date.now() + 3000);
    // The instant written at +05:00 and at -04:00
    const isoPlusFive = isoWithOffset(instant, 5 * 60);
    const isoMinusFour = isoWithOffset(instant, -4 * 60);
    expect(new Date(isoPlusFive).getTime()).toBe(instant.getTime());
    expect(new Date(isoMinusFour).getTime()).toBe(instant.getTime());

    const quoteA = await createQuote(auth, customerId, {
      expiresAt: isoPlusFive,
    });
    await sendQuote(auth, quoteA.id);
    const quoteC = await createQuote(auth, customerId, {
      expiresAt: isoPlusFive,
    });
    await sendQuote(auth, quoteC.id);

    const quoteB = await createQuote(auth, customerId, {
      expiresAt: isoMinusFour,
    });
    await sendQuote(auth, quoteB.id);
    const quoteD = await createQuote(auth, customerId, {
      expiresAt: isoMinusFour,
    });
    await sendQuote(auth, quoteD.id);

    // Before the instant -> both notations still active
    const aBefore = await staffRespond(auth, quoteA.id, "APPROVED");
    const bBefore = await staffRespond(auth, quoteB.id, "APPROVED");
    expect(aBefore.status).toBe(200);
    expect(bBefore.status).toBe(200);

    // After the instant -> both expired regardless of the offset
    // notation the expiry was written in
    await waitUntil(instant, 300);
    const cAfter = await staffRespond(auth, quoteC.id, "APPROVED");
    const dAfter = await staffRespond(auth, quoteD.id, "APPROVED");
    expect(cAfter.status).toBe(410);
    expect(dAfter.status).toBe(410);
    expect(cAfter.body.error.code).toBe("QUOTE_EXPIRED");
    expect(dAfter.body.error.code).toBe("QUOTE_EXPIRED");
  }, 30000);

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
    await sendQuote(auth, quote.id);

    // Customer approves through the job-scoped portal session. Handoff
    // 5.5 requires the portal respond to run the shared approval domain
    // logic, so the approval records a CUSTOMER event and advances the
    // linked job exactly like the removed shared-link flow did.
    const cookie = await openPortalSession(auth, jobId);
    const approveRes = await portalRespond(cookie, quote.id, "APPROVED");
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

    // Assign a technician first (required for scheduling)
    const suffix = `tech-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const techUser = await request(app)
      .post("/api/v1/auth/register")
      .send({
        email: `tech-${suffix}@example.com`,
        password: "correct-horse-battery-staple",
        firstName: "Tech",
        lastName: suffix,
        companyName: `Temp Company ${suffix}`,
      });

    const tempCompanyId = techUser.body.data.company.id;
    const techUserId = techUser.body.data.user.id;

    // Delete the old companyMember record (from temp company)
    await prisma.companyMember.deleteMany({
      where: { userId: techUserId },
    });

    // Create a new companyMember record for the test company as a technician
    await prisma.companyMember.create({
      data: {
        userId: techUserId,
        companyId: owner.companyId,
        role: "TECHNICIAN",
        status: "ACTIVE",
      },
    });

    // Delete the temporary company
    await prisma.company.delete({
      where: { id: tempCompanyId },
    });

    const assignRes = await request(app)
      .post(`/api/v1/jobs/${jobId}/assign`)
      .set(auth)
      .send({ technicianId: techUserId });
    expect(assignRes.status).toBe(200);

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
    await sendQuote(auth, quote.id);

    // Approve through the job-scoped portal session
    const cookie = await openPortalSession(auth, jobId);
    const approveRes = await portalRespond(cookie, quote.id, "APPROVED");
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
    await sendQuote(auth, quote.id);

    const cookie = await openPortalSession(auth, jobId);

    // First approval
    const first = await portalRespond(cookie, quote.id, "APPROVED");
    expect(first.status).toBe(200);

    // Second approval (e.g. user double-clicked or refreshed) — the
    // shared approval domain logic is idempotent for a repeated
    // same-action respond, so this still returns 200.
    const second = await portalRespond(cookie, quote.id, "APPROVED");
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
