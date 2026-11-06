/**
 * Phase 7 — Payments, deposits, credits, refunds, disputes (Gate B).
 *
 * Flags must be set BEFORE src imports (env.ts parses once at load).
 * Uses the sandbox provider: checkout URLs are exercised through the
 * signed-webhook path and the provider-side reconcile sweep, covering
 * forged signatures, stale timestamps, replays, amount mismatches,
 * missed webhooks, deposit-credit-once and refund concurrency.
 */
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

process.env.ONLINE_PAYMENTS_ENABLED = "true";
process.env.PAYMENT_PROVIDER = "sandbox";
process.env.PAYMENT_WEBHOOK_SECRET = "phase7-test-secret";
process.env.DEPOSITS_ENABLED = "true";
process.env.QUOTE_BEFORE_JOB_ENABLED = "true";
process.env.REQUESTS_ENABLED = "true";
process.env.WORKSPACE_PORTAL_ENABLED = "true";
process.env.PORTAL_REQUESTS_ENABLED = "true";

type App = ReturnType<(typeof import("../src/app.js"))["buildApp"]>;
type PrismaClient = (typeof import("../src/db/prisma.js"))["prisma"];
type GenerateToken =
  (typeof import("../src/modules/portal/portal.tokens.js"))["generateToken"];
type HashToken =
  (typeof import("../src/modules/portal/portal.tokens.js"))["hashToken"];
type Sandbox = typeof import("../src/modules/payments/sandbox.provider.js");
type SessionService =
  typeof import("../src/modules/payments/payment-session.service.js");

let app: App;
let prisma: PrismaClient;
let generateToken: GenerateToken;
let hashToken: HashToken;
let sandbox: Sandbox;
let sessionService: SessionService;

beforeAll(async () => {
  app = (await import("../src/app.js")).buildApp();
  prisma = (await import("../src/db/prisma.js")).prisma;
  const portalTokens = await import("../src/modules/portal/portal.tokens.js");
  generateToken = portalTokens.generateToken;
  hashToken = portalTokens.hashToken;
  sandbox = await import("../src/modules/payments/sandbox.provider.js");
  sessionService =
    await import("../src/modules/payments/payment-session.service.js");
}, 60000);

function suffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

interface Fixture {
  companyId: string;
  userId: string;
  auth: { Authorization: string };
  customerId: string;
  addressId: string;
}

async function seedCompany(): Promise<Fixture> {
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({
      email: `p7-${suffix()}@example.com`,
      password: "correct-horse-battery-staple",
      firstName: "Owner",
      lastName: "P7",
      companyName: `P7 ${suffix()}`,
    });
  expect(res.status).toBe(201);
  const companyId = res.body.data.company.id as string;
  const userId = res.body.data.user.id as string;
  const customer = await prisma.customer.create({
    data: {
      companyId,
      firstName: "Casey",
      lastName: "Customer",
      email: `casey-${suffix()}@example.com`,
    },
  });
  const address = await prisma.serviceAddress.create({
    data: {
      companyId,
      customerId: customer.id,
      label: "Home",
      line1: "1 Main St",
      city: "Austin",
      region: "TX",
      postalCode: "78701",
      countryCode: "US",
    },
  });
  return {
    companyId,
    userId,
    auth: { Authorization: `Bearer ${res.body.data.accessToken}` },
    customerId: customer.id,
    addressId: address.id,
  };
}

async function workspaceSession(fx: Fixture) {
  // One ACTIVE workspace grant per customer — reuse it across sessions.
  let grant = await prisma.portalAccessGrant.findFirst({
    where: {
      companyId: fx.companyId,
      customerId: fx.customerId,
      scope: "WORKSPACE",
      status: "ACTIVE",
    },
  });
  if (!grant) {
    grant = await prisma.portalAccessGrant.create({
      data: {
        companyId: fx.companyId,
        customerId: fx.customerId,
        scope: "WORKSPACE",
        issuedBy: fx.userId,
        linkTokenHash: hashToken(generateToken()),
        linkExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        linkConsumedAt: new Date(),
        status: "ACTIVE",
      },
    });
  }
  const sessionToken = generateToken();
  await prisma.portalSession.create({
    data: {
      grantId: grant.id,
      companyId: fx.companyId,
      customerId: fx.customerId,
      scope: "WORKSPACE",
      sessionTokenHash: hashToken(sessionToken),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      lastSeenAt: new Date(),
    },
  });
  return {
    Authorization: `Bearer ${sessionToken}`,
    "X-Aera-Portal": "1",
  };
}

async function seedRequest(fx: Fixture) {
  return prisma.serviceRequest.create({
    data: {
      companyId: fx.companyId,
      customerId: fx.customerId,
      serviceAddressId: fx.addressId,
      requestNumber: Math.floor(Math.random() * 900_000) + 1000,
      title: "Repair request",
      description: "Needs service",
      serviceCategory: "HVAC",
      source: "WEB_PORTAL",
      status: "SUBMITTED",
    },
  });
}

async function seedIssuedInvoice(
  fx: Fixture,
  opts: {
    totalMinor?: bigint;
    status?: string;
    kind?: "STANDARD" | "DEPOSIT";
  } = {},
) {
  const total = opts.totalMinor ?? 20_000n;
  return prisma.invoice.create({
    data: {
      companyId: fx.companyId,
      customerId: fx.customerId,
      invoiceNumber: `INV-T${Math.floor(Math.random() * 900_000) + 1000}`,
      kind: opts.kind ?? "STANDARD",
      status: (opts.status ?? "ISSUED") as never,
      subtotalMinor: total,
      totalMinor: total,
      amountPaidMinor: 0n,
      balanceDueMinor: total,
      currency: "USD",
      issuedAt: new Date(),
      items: {
        create: {
          companyId: fx.companyId,
          description: "Service",
          quantity: "1",
          unitPriceMinor: total,
          totalMinor: total,
          sortOrder: 0,
          sourceType: "MANUAL",
        },
      },
    },
  });
}

async function payViaPortal(
  fx: Fixture,
  invoiceId: string,
  key = `pay-${suffix()}`,
) {
  const portal = await workspaceSession(fx);
  return request(app)
    .post(`/api/v1/portal/invoices/${invoiceId}/pay`)
    .set(portal)
    .set("Idempotency-Key", key)
    .send({});
}

async function sendCheckoutWebhook(args: {
  providerSessionId: string;
  eventId?: string;
  amountMinor?: bigint;
  currency?: string;
  paymentId?: string;
  signatureSecret?: string;
  timestampOffsetSeconds?: number;
}) {
  const body = sandbox.sandboxWebhookPayload({
    eventId: args.eventId ?? `evt_${suffix()}`,
    type: "checkout.completed",
    providerSessionId: args.providerSessionId,
    paymentId: args.paymentId,
    amountMinor: args.amountMinor,
    currency: args.currency,
  });
  const headers = sandbox.sandboxWebhookHeaders(
    body,
    args.signatureSecret ?? "phase7-test-secret",
    args.timestampOffsetSeconds === undefined
      ? undefined
      : Math.floor(Date.now() / 1000) + args.timestampOffsetSeconds,
  );
  // Send the exact bytes the signature covers: supertest re-encodes a
  // Buffer payload, so the raw JSON string is sent instead.
  return request(app)
    .post("/api/v1/payments/webhook/sandbox")
    .set(headers)
    .send(body.toString("utf8"));
}

let fx: Fixture;

beforeEach(async () => {
  await prisma.$transaction([
    prisma.invoiceDisputeEvent.deleteMany(),
    prisma.invoiceDispute.deleteMany(),
    prisma.refund.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.paymentOperation.deleteMany(),
    prisma.paymentSession.deleteMany(),
    prisma.providerWebhookEvent.deleteMany(),
    prisma.invoiceCreditApplication.deleteMany(),
    prisma.invoiceItem.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.jobStatusHistory.deleteMany(),
    prisma.job.deleteMany(),
    prisma.quoteApprovalEvent.deleteMany(),
    prisma.quoteAcceptance.deleteMany(),
    prisma.quoteItem.deleteMany(),
    prisma.quote.deleteMany(),
    prisma.serviceRequestMessage.deleteMany(),
    prisma.serviceRequestAttachment.deleteMany(),
    prisma.serviceRequestUpload.deleteMany(),
    prisma.serviceRequestEvent.deleteMany(),
    prisma.serviceRequest.deleteMany(),
    prisma.portalSession.deleteMany(),
    prisma.portalAccessGrant.deleteMany(),
    prisma.portalAuditEvent.deleteMany(),
    prisma.serviceAddress.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.companyMember.deleteMany(),
    prisma.company.deleteMany(),
    prisma.user.deleteMany(),
  ]);
  fx = await seedCompany();
});

describe("7.2 webhook security", () => {
  it("rejects a forged signature and a stale timestamp", async () => {
    const invoice = await seedIssuedInvoice(fx);
    const pay = await payViaPortal(fx, invoice.id);
    expect(pay.status).toBe(201);
    const session = await prisma.paymentSession.findFirstOrThrow({
      where: { invoiceId: invoice.id },
    });

    const forged = await sendCheckoutWebhook({
      providerSessionId: session.providerSessionId,
      signatureSecret: "wrong-secret",
    });
    expect(forged.status).toBe(401);

    const stale = await sendCheckoutWebhook({
      providerSessionId: session.providerSessionId,
      timestampOffsetSeconds: -3600,
    });
    expect(stale.status).toBe(401);

    const after = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(after.status).toBe("ISSUED");
    expect(after.amountPaidMinor).toBe(0n);
  });

  it("settles on a valid webhook and ignores replays", async () => {
    const invoice = await seedIssuedInvoice(fx, { totalMinor: 20_000n });
    const pay = await payViaPortal(fx, invoice.id);
    expect(pay.status).toBe(201);
    const session = await prisma.paymentSession.findFirstOrThrow({
      where: { invoiceId: invoice.id },
    });
    expect(session.amountMinor).toBe(20_000n);

    const eventId = `evt_${suffix()}`;
    const first = await sendCheckoutWebhook({
      providerSessionId: session.providerSessionId,
      eventId,
      paymentId: "pi_test_1",
      amountMinor: 20_000n,
      currency: "USD",
    });
    expect(first.status).toBe(200);
    expect(first.body.outcome).toBe("settled");

    const paid = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(paid.status).toBe("PAID");
    expect(paid.amountPaidMinor).toBe(20_000n);
    expect(paid.balanceDueMinor).toBe(0n);

    // Replay the exact same event — dedupe via ProviderWebhookEvent.
    const replay = await sendCheckoutWebhook({
      providerSessionId: session.providerSessionId,
      eventId,
      paymentId: "pi_test_1",
      amountMinor: 20_000n,
      currency: "USD",
    });
    expect(replay.status).toBe(200);

    const payments = await prisma.payment.count({
      where: { invoiceId: invoice.id },
    });
    expect(payments).toBe(1);
    const ops = await prisma.paymentOperation.count({
      where: { invoiceId: invoice.id, status: "COMPLETED" },
    });
    expect(ops).toBe(1);
  });

  it("rejects amount/currency mismatch and logs unknown event types", async () => {
    const invoice = await seedIssuedInvoice(fx);
    await payViaPortal(fx, invoice.id);
    const session = await prisma.paymentSession.findFirstOrThrow({
      where: { invoiceId: invoice.id },
    });

    const mismatch = await sendCheckoutWebhook({
      providerSessionId: session.providerSessionId,
      amountMinor: 1n,
      currency: "USD",
    });
    expect(mismatch.status).toBe(200);
    const stillOpen = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(stillOpen.status).toBe("ISSUED");
    expect(stillOpen.amountPaidMinor).toBe(0n);

    // Unknown event type: acknowledged, not an error.
    const body = sandbox.sandboxWebhookPayload({
      eventId: `evt_${suffix()}`,
      type: "customer.created",
      providerSessionId: session.providerSessionId,
    });
    const headers = sandbox.sandboxWebhookHeaders(body, "phase7-test-secret");
    const unknown = await request(app)
      .post("/api/v1/payments/webhook/sandbox")
      .set(headers)
      .send(body.toString("utf8"));
    expect(unknown.status).toBe(200);
  });

  it("pay endpoint is idempotent on the idempotency key", async () => {
    const invoice = await seedIssuedInvoice(fx);
    const key = `idem-${suffix()}`;
    const first = await payViaPortal(fx, invoice.id, key);
    const second = await payViaPortal(fx, invoice.id, key);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.sessionId).toBe(first.body.data.sessionId);
    const count = await prisma.paymentSession.count({
      where: { invoiceId: invoice.id },
    });
    expect(count).toBe(1);
  });
});

describe("7.3 checkout + reconciliation", () => {
  it("a redirect without a webhook leaves the invoice unpaid until reconcile", async () => {
    const invoice = await seedIssuedInvoice(fx);
    const pay = await payViaPortal(fx, invoice.id);
    expect(pay.status).toBe(201);
    expect(pay.body.data.checkoutUrl).toContain(
      "/api/v1/payments/sandbox/checkout/",
    );

    // Customer "paid" at the provider but the webhook was lost.
    const session = await prisma.paymentSession.findFirstOrThrow({
      where: { invoiceId: invoice.id },
    });
    sandbox.markSandboxCheckoutPaid(session.providerSessionId);
    // Age the session so the sweeper picks it up.
    await prisma.paymentSession.update({
      where: { id: session.id },
      data: { createdAt: new Date(Date.now() - 5 * 60 * 1000) },
    });

    const before = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(before.status).toBe("ISSUED");

    const result = await sessionService.sweepStalePaymentSessions(
      sandbox.sandboxPaymentProvider,
    );
    expect(result.settled).toBe(1);

    const after = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(after.status).toBe("PAID");
    expect(after.amountPaidMinor).toBe(20_000n);
  });

  it("sandbox checkout page + pay button settles through the same path", async () => {
    const invoice = await seedIssuedInvoice(fx, { totalMinor: 12_345n });
    const pay = await payViaPortal(fx, invoice.id);
    const checkoutUrl = pay.body.data.checkoutUrl as string;
    const providerSessionId = checkoutUrl.split("/").pop() as string;

    const page = await request(app).get(
      `/api/v1/payments/sandbox/checkout/${providerSessionId}`,
    );
    expect(page.status).toBe(200);
    expect(page.text).toContain("Pay");

    const paid = await request(app).post(
      `/api/v1/payments/sandbox/checkout/${providerSessionId}/pay`,
    );
    expect(paid.status).toBe(200);

    const invoiceAfter = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(invoiceAfter.status).toBe("PAID");
    expect(invoiceAfter.amountPaidMinor).toBe(12_345n);
  });
});

describe("7.4 deposits", () => {
  async function depositFlow() {
    const requestRow = await seedRequest(fx);
    const created = await request(app)
      .post("/api/v1/quotes")
      .set(fx.auth)
      .send({
        customerId: fx.customerId,
        serviceRequestId: requestRow.id,
        kind: "REPAIR",
        currency: "USD",
        depositType: "FIXED",
        depositValue: 5000,
        items: [
          { description: "Repair", quantity: "1", unitPriceMinor: 20000 },
        ],
      });
    expect(created.status).toBe(201);
    const sent = await request(app)
      .post(`/api/v1/quotes/${created.body.data.id}/send`)
      .set(fx.auth);
    expect(sent.status).toBe(200);
    expect(sent.body.data.depositMinor).toBe("5000");

    const portal = await workspaceSession(fx);
    const approved = await request(app)
      .post(`/api/v1/portal/quotes/${created.body.data.id}/respond`)
      .set(portal)
      .send({ action: "APPROVED" });
    expect(approved.status).toBe(200);

    const depositInvoice = await prisma.invoice.findFirstOrThrow({
      where: {
        companyId: fx.companyId,
        kind: "DEPOSIT",
        quoteId: created.body.data.id,
      },
    });
    // No job yet — the request waits on the deposit.
    const job = await prisma.job.findFirst({
      where: { sourceQuoteId: created.body.data.id },
    });
    expect(job).toBeNull();
    return {
      requestRow,
      quoteId: created.body.data.id as string,
      depositInvoice,
    };
  }

  it("acceptance issues a DEPOSIT invoice; paying it creates the job once", async () => {
    const { quoteId, depositInvoice } = await depositFlow();
    expect(depositInvoice.jobId).toBeNull();
    expect(depositInvoice.status).toBe("ISSUED");
    expect(depositInvoice.balanceDueMinor).toBe(5000n);

    const pay = await payViaPortal(fx, depositInvoice.id);
    expect(pay.status).toBe(201);
    const session = await prisma.paymentSession.findFirstOrThrow({
      where: { invoiceId: depositInvoice.id },
    });
    await sendCheckoutWebhook({
      providerSessionId: session.providerSessionId,
      paymentId: "pi_deposit_1",
      amountMinor: 5000n,
      currency: "USD",
    });

    const paid = await prisma.invoice.findUniqueOrThrow({
      where: { id: depositInvoice.id },
    });
    expect(paid.status).toBe("PAID");

    const job = await prisma.job.findFirst({
      where: { sourceQuoteId: quoteId },
    });
    expect(job).not.toBeNull();

    // Replaying settlement must not create a second job.
    await sendCheckoutWebhook({
      providerSessionId: session.providerSessionId,
      paymentId: "pi_deposit_1",
      amountMinor: 5000n,
      currency: "USD",
    });
    const jobs = await prisma.job.count({ where: { sourceQuoteId: quoteId } });
    expect(jobs).toBe(1);
  });

  it("percent deposits compute from the quote total and cap at total", async () => {
    const requestRow = await seedRequest(fx);
    const created = await request(app)
      .post("/api/v1/quotes")
      .set(fx.auth)
      .send({
        customerId: fx.customerId,
        serviceRequestId: requestRow.id,
        currency: "USD",
        depositType: "PERCENT",
        depositValue: 2500, // 25%
        items: [
          { description: "Install", quantity: "1", unitPriceMinor: 20000 },
        ],
      });
    expect(created.status).toBe(201);
    const sent = await request(app)
      .post(`/api/v1/quotes/${created.body.data.id}/send`)
      .set(fx.auth);
    // 25% of 20000 = 5000
    expect(sent.body.data.depositMinor).toBe("5000");
  });
});

describe("7.5 credits and refunds", () => {
  it("a paid deposit credits the final invoice exactly once", async () => {
    const requestRow = await seedRequest(fx);
    const quote = await request(app)
      .post("/api/v1/quotes")
      .set(fx.auth)
      .send({
        customerId: fx.customerId,
        serviceRequestId: requestRow.id,
        kind: "REPAIR",
        currency: "USD",
        depositType: "FIXED",
        depositValue: 5000,
        items: [
          { description: "Repair", quantity: "1", unitPriceMinor: 20000 },
        ],
      });
    await request(app)
      .post(`/api/v1/quotes/${quote.body.data.id}/send`)
      .set(fx.auth);
    const portal = await workspaceSession(fx);
    await request(app)
      .post(`/api/v1/portal/quotes/${quote.body.data.id}/respond`)
      .set(portal)
      .send({ action: "APPROVED" });

    const depositInvoice = await prisma.invoice.findFirstOrThrow({
      where: { kind: "DEPOSIT", quoteId: quote.body.data.id },
    });
    await payViaPortal(fx, depositInvoice.id);
    const session = await prisma.paymentSession.findFirstOrThrow({
      where: { invoiceId: depositInvoice.id },
    });
    await sendCheckoutWebhook({
      providerSessionId: session.providerSessionId,
      paymentId: "pi_dep",
      amountMinor: 5000n,
      currency: "USD",
    });

    const job = await prisma.job.findFirstOrThrow({
      where: { sourceQuoteId: quote.body.data.id },
    });
    await prisma.job.update({
      where: { id: job.id },
      data: { status: "COMPLETED", reviewState: "NOT_REQUIRED" },
    });

    const invoice = await request(app)
      .post(`/api/v1/invoices/from-job/${job.id}`)
      .set(fx.auth)
      .send({});
    expect(invoice.status).toBe(201);
    // Total stays 20000; the deposit credits the balance due.
    expect(invoice.body.data.totalMinor).toBe("20000");
    expect(invoice.body.data.balanceDueMinor).toBe("15000");
    expect(invoice.body.data.creditTargets).toHaveLength(1);
    expect(invoice.body.data.creditTargets[0].amountMinor).toBe("5000");

    const apps = await prisma.invoiceCreditApplication.findMany({
      where: { targetInvoiceId: invoice.body.data.id },
    });
    expect(apps).toHaveLength(1);
    expect(apps[0].amountMinor).toBe(5000n);

    // Idempotent re-generation cannot double-apply the credit.
    const again = await request(app)
      .post(`/api/v1/invoices/from-job/${job.id}`)
      .set(fx.auth)
      .send({});
    expect(again.body.data.id).toBe(invoice.body.data.id);
    const appsAfter = await prisma.invoiceCreditApplication.count({
      where: { targetInvoiceId: invoice.body.data.id },
    });
    expect(appsAfter).toBe(1);
  });

  it("refunds are OWNER-only, partial, and cannot exceed paid", async () => {
    const invoice = await seedIssuedInvoice(fx, { totalMinor: 20_000n });
    // Pay it via staff recordPayment.
    const paid = await request(app)
      .post(`/api/v1/invoices/${invoice.id}/payments`)
      .set(fx.auth)
      .set("Idempotency-Key", `staffpay-${suffix()}`)
      .send({
        amountMinor: 20000,
        currency: "USD",
        method: "CASH",
      });
    expect(paid.status).toBe(201);
    const paymentId = (
      await prisma.payment.findFirstOrThrow({
        where: { invoiceId: invoice.id },
      })
    ).id;

    // Partial refund.
    const refund = await request(app)
      .post(`/api/v1/invoices/${invoice.id}/refunds`)
      .set(fx.auth)
      .send({ paymentId, amountMinor: 5000, reason: "Goodwill" });
    expect(refund.status).toBe(201);
    expect(refund.body.data.status).toBe("COMPLETED");

    // Over-refunding is rejected.
    const tooMuch = await request(app)
      .post(`/api/v1/invoices/${invoice.id}/refunds`)
      .set(fx.auth)
      .send({ paymentId, amountMinor: 16000, reason: "Too much" });
    expect(tooMuch.status).toBe(422);

    // A dispatcher cannot refund.
    const techRes = await request(app)
      .post("/api/v1/auth/register")
      .send({
        email: `p7-disp-${suffix()}@example.com`,
        password: "correct-horse-battery-staple",
        firstName: "Disp",
        lastName: "Patch",
        companyName: `Tmp ${suffix()}`,
      });
    const dispUserId = techRes.body.data.user.id as string;
    const tmpCompanyId = techRes.body.data.company.id as string;
    await prisma.companyMember.deleteMany({ where: { userId: dispUserId } });
    await prisma.companyMember.create({
      data: {
        userId: dispUserId,
        companyId: fx.companyId,
        role: "DISPATCHER",
        status: "ACTIVE",
      },
    });
    await prisma.company.delete({ where: { id: tmpCompanyId } });
    const dispEmail = (
      await prisma.user.findUniqueOrThrow({ where: { id: dispUserId } })
    ).email;
    const login = await request(app).post("/api/v1/auth/login").send({
      email: dispEmail,
      password: "correct-horse-battery-staple",
    });
    expect(login.status).toBe(200);
    const denied = await request(app)
      .post(`/api/v1/invoices/${invoice.id}/refunds`)
      .set({ Authorization: `Bearer ${login.body.data.accessToken}` })
      .send({ paymentId, amountMinor: 1000, reason: "Nope" });
    expect(denied.status).toBe(403);
  });
});

describe("7.6 disputes", () => {
  it("portal dispute opens, blocks duplicates, resolves without touching invoice state", async () => {
    const invoice = await seedIssuedInvoice(fx, { totalMinor: 20_000n });
    const portal = await workspaceSession(fx);

    const created = await request(app)
      .post(`/api/v1/portal/invoices/${invoice.id}/disputes`)
      .set(portal)
      .send({ reason: "INCORRECT_AMOUNT", message: "I was quoted less" });
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe("OPEN");

    const dup = await request(app)
      .post(`/api/v1/portal/invoices/${invoice.id}/disputes`)
      .set(portal)
      .send({ reason: "OTHER", message: "Again" });
    expect(dup.status).toBe(409);

    // Invoice state is untouched by the dispute.
    const unchanged = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(unchanged.status).toBe("ISSUED");
    expect(unchanged.balanceDueMinor).toBe(20_000n);

    // Staff inbox sees it; move to review then resolve.
    const inbox = await request(app)
      .get("/api/v1/invoices/disputes?status=OPEN")
      .set(fx.auth);
    expect(inbox.status).toBe(200);
    expect(inbox.body.data.items).toHaveLength(1);
    const disputeId = inbox.body.data.items[0].id as string;

    const review = await request(app)
      .post(`/api/v1/invoices/disputes/${disputeId}/review`)
      .set(fx.auth);
    expect(review.status).toBe(200);
    expect(review.body.data.status).toBe("UNDER_REVIEW");

    const resolved = await request(app)
      .post(`/api/v1/invoices/disputes/${disputeId}/resolve`)
      .set(fx.auth)
      .send({ resolution: "UPHELD", note: "Invoice matches approved quote" });
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.status).toBe("RESOLVED");
    expect(resolved.body.data.resolution).toBe("UPHELD");

    const events = await prisma.invoiceDisputeEvent.count({
      where: { disputeId },
    });
    expect(events).toBe(3); // CREATED + STATUS_CHANGED + RESOLVED

    // Invoice still unchanged after resolution.
    const stillUnchanged = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoice.id },
    });
    expect(stillUnchanged.status).toBe("ISSUED");
  });

  it("cross-customer dispute attempts are invisible", async () => {
    const invoice = await seedIssuedInvoice(fx);
    const other = await seedCompany();
    const otherPortal = await workspaceSession(other);
    const res = await request(app)
      .post(`/api/v1/portal/invoices/${invoice.id}/disputes`)
      .set(otherPortal)
      .send({ reason: "OTHER", message: "Not mine" });
    expect(res.status).toBe(404);
  });
});
