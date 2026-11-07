import { createHash } from "node:crypto";
import { prisma } from "../../db/prisma.js";
import { env } from "../../config/env.js";
import { logger } from "../../common/logger.js";
import { captureBackgroundError } from "../../common/observability.js";
import { AppError } from "../../common/errors.js";
import {
  manualPaymentProvider,
  type PaymentProvider,
  type VerifiedWebhook,
} from "./payment.port.js";
import { sandboxPaymentProvider } from "./sandbox.provider.js";
import { completePaymentOperation } from "./payment-operation.service.js";
import { recomputeInvoiceBalance } from "../invoices/invoice-balance.js";
import { createJobFromQuote } from "../quotes/quote.service.js";
import { closePortalIfDone } from "../portal/portal.grants.js";

const PAYABLE_STATUSES = ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] as const;
const SESSION_SWEEP_MINUTES = 5;
const RECONCILE_MIN_AGE_MS = 2 * 60 * 1000;

export function getPaymentProvider(name?: string): PaymentProvider {
  const key = name ?? env.PAYMENT_PROVIDER;
  // Defense in depth: env validation already refuses to boot production
  // with the sandbox provider, but never resolve it here either — a
  // misconfigured deploy must not be able to settle ledger payments
  // through the in-memory test adapter.
  if (key === "sandbox") {
    if (env.NODE_ENV === "production") {
      throw new AppError(
        "PAYMENT_PROVIDER_UNAVAILABLE",
        "The sandbox payment provider is not available in production",
        503,
      );
    }
    return sandboxPaymentProvider;
  }
  return manualPaymentProvider;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

export interface CheckoutSessionView {
  id: string;
  invoiceId: string;
  provider: string;
  providerSessionId: string;
  checkoutUrl: string | null;
  amountMinor: bigint;
  currency: string;
  status: string;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Phase 7.3 — create (or idempotently replay) a provider checkout session
 * for an invoice's outstanding balance.
 */
export async function createCheckoutSession(args: {
  companyId: string;
  invoiceId: string;
  portalSessionId?: string | null;
  idempotencyKey: string;
  returnUrl?: string;
  provider?: PaymentProvider;
}): Promise<CheckoutSessionView> {
  if (!env.ONLINE_PAYMENTS_ENABLED) {
    throw new AppError("RESOURCE_NOT_FOUND", "Portal resource not found", 404);
  }
  const provider = args.provider ?? getPaymentProvider();
  if (!provider.createCheckout) {
    throw new AppError(
      "ONLINE_PAYMENTS_UNAVAILABLE",
      "Online payments are not available for this provider",
      422,
    );
  }

  const invoice = await prisma.invoice.findFirst({
    where: {
      id: args.invoiceId,
      companyId: args.companyId,
      status: { in: [...PAYABLE_STATUSES] },
    },
    select: {
      id: true,
      balanceDueMinor: true,
      currency: true,
      status: true,
    },
  });
  if (!invoice) {
    throw new AppError("RESOURCE_NOT_FOUND", "Invoice not found", 404);
  }
  if (invoice.balanceDueMinor <= 0n) {
    throw new AppError(
      "INVOICE_ALREADY_PAID",
      "Invoice has no balance due",
      409,
    );
  }

  const existing = await prisma.paymentSession.findUnique({
    where: {
      companyId_idempotencyKey: {
        companyId: args.companyId,
        idempotencyKey: args.idempotencyKey,
      },
    },
  });
  if (existing) {
    return existing as CheckoutSessionView;
  }

  // One OPEN session per invoice (enforced by the
  // payment_sessions_one_open_per_invoice partial unique index). Expire
  // OPEN sessions that can no longer be paid correctly — past their
  // provider expiry or priced for a stale balance — then reuse a live
  // session that already covers the full current balance instead of
  // opening a second payable checkout for the same money.
  await prisma.paymentSession.updateMany({
    where: {
      invoiceId: invoice.id,
      status: "OPEN",
      OR: [
        { expiresAt: { lte: new Date() } },
        { amountMinor: { not: invoice.balanceDueMinor } },
      ],
    },
    data: { status: "EXPIRED" },
  });
  const reusable = await prisma.paymentSession.findFirst({
    where: {
      invoiceId: invoice.id,
      status: "OPEN",
      amountMinor: invoice.balanceDueMinor,
    },
    orderBy: { createdAt: "desc" },
  });
  if (reusable) {
    return reusable as CheckoutSessionView;
  }

  const checkout = await provider.createCheckout({
    amountMinor: invoice.balanceDueMinor,
    currency: invoice.currency,
    invoiceId: invoice.id,
    idempotencyKey: args.idempotencyKey,
    returnUrl: args.returnUrl ?? "",
  });

  try {
    const session = await prisma.paymentSession.create({
      data: {
        companyId: args.companyId,
        invoiceId: invoice.id,
        provider: provider.name,
        providerSessionId: checkout.providerSessionId,
        amountMinor: invoice.balanceDueMinor,
        currency: invoice.currency,
        status: "OPEN",
        expiresAt: checkout.expiresAt,
        idempotencyKey: args.idempotencyKey,
        portalSessionId: args.portalSessionId ?? null,
        checkoutUrl: checkout.checkoutUrl,
      },
    });
    return session as CheckoutSessionView;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const raced = await prisma.paymentSession.findUnique({
        where: {
          companyId_idempotencyKey: {
            companyId: args.companyId,
            idempotencyKey: args.idempotencyKey,
          },
        },
      });
      if (raced) return raced as CheckoutSessionView;
      // Lost the race on the one-OPEN-session-per-invoice index: a
      // concurrent request already opened a payable checkout for this
      // balance. Return it — the provider-side session we just created
      // is left unpaid and expires unused.
      const open = await prisma.paymentSession.findFirst({
        where: {
          invoiceId: invoice.id,
          status: "OPEN",
          amountMinor: invoice.balanceDueMinor,
        },
        orderBy: { createdAt: "desc" },
      });
      if (open) return open as CheckoutSessionView;
    }
    throw error;
  }
}

export interface SettleResult {
  settled: boolean;
  alreadySettled?: boolean;
  invoiceId?: string;
  invoiceStatus?: string;
  reason?: string;
}

/**
 * Phase 7.2/7.5 — settle a checkout session exactly once.
 *
 * Shared by the webhook handler, the sandbox pay route and the
 * reconciliation sweep. The session row is claimed OPEN→COMPLETED inside
 * the transaction, the ledger payment is written through a
 * PaymentOperation (idempotency key `checkout_<providerSessionId>`), the
 * invoice balance is recomputed from source rows, and a paid DEPOSIT
 * invoice resumes quote→job creation — all atomically.
 */
export async function settlePaymentSession(
  providerSessionId: string,
  verified: {
    paymentId?: string;
    amountMinor?: bigint;
    currency?: string;
  },
): Promise<SettleResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const session = await tx.paymentSession.findUnique({
        where: { providerSessionId },
      });
      if (!session) {
        throw new AppError(
          "PAYMENT_SESSION_NOT_FOUND",
          "Unknown payment session",
          404,
        );
      }
      if (session.status === "COMPLETED") {
        return {
          settled: false,
          alreadySettled: true,
          invoiceId: session.invoiceId,
        };
      }
      if (session.status !== "OPEN") {
        throw new AppError(
          "PAYMENT_SESSION_NOT_OPEN",
          "Payment session is no longer open",
          409,
        );
      }

      // Provider truth must match what we asked for.
      if (
        (verified.amountMinor !== undefined &&
          verified.amountMinor !== session.amountMinor) ||
        (verified.currency !== undefined &&
          verified.currency.toUpperCase() !== session.currency)
      ) {
        throw new AppError(
          "PAYMENT_SESSION_MISMATCH",
          "Webhook amount or currency does not match the payment session",
          422,
        );
      }

      // Claim the session: only one committer (webhook, sandbox route or
      // reconcile sweep) can flip OPEN→COMPLETED.
      const claimed = await tx.paymentSession.updateMany({
        where: { id: session.id, status: "OPEN" },
        data: { status: "COMPLETED" },
      });
      if (claimed.count !== 1) {
        return {
          settled: false,
          alreadySettled: true,
          invoiceId: session.invoiceId,
        };
      }

      const idempotencyKey = `checkout_${session.providerSessionId}`;
      const operation = await tx.paymentOperation.create({
        data: {
          companyId: session.companyId,
          invoiceId: session.invoiceId,
          userId: null,
          amountMinor: session.amountMinor,
          currency: session.currency,
          method: "CARD",
          provider: session.provider,
          source: "WEBHOOK",
          reference: verified.paymentId,
          idempotencyKey,
          status: "PROVIDER_ACCEPTED",
          providerPaymentId:
            verified.paymentId ?? `wh_${session.providerSessionId}`,
          nextRetryAt: null,
        },
      });

      // Guarded balance update — refuses if the invoice was voided or the
      // balance shrank (e.g. a refund/credit landed) since checkout.
      const updated = await tx.invoice.updateMany({
        where: {
          id: session.invoiceId,
          companyId: session.companyId,
          balanceDueMinor: { gte: session.amountMinor },
          status: { in: [...PAYABLE_STATUSES] },
        },
        data: {
          amountPaidMinor: { increment: session.amountMinor },
          balanceDueMinor: { decrement: session.amountMinor },
        },
      });
      if (updated.count !== 1) {
        throw new AppError(
          "PAYMENT_SESSION_SETTLEMENT_CONFLICT",
          "Invoice no longer accepts this payment",
          409,
        );
      }

      const payment = await tx.payment.create({
        data: {
          companyId: session.companyId,
          invoiceId: session.invoiceId,
          createdBy: null,
          amountMinor: session.amountMinor,
          currency: session.currency,
          method: "CARD",
          provider: session.provider,
          providerPaymentId:
            verified.paymentId ?? `wh_${session.providerSessionId}`,
          reference: verified.paymentId,
          idempotencyKey,
        },
      });

      await completePaymentOperation(operation.id, payment.id, tx);
      const balance = await recomputeInvoiceBalance(session.invoiceId, tx);

      const invoice = await tx.invoice.findUniqueOrThrow({
        where: { id: session.invoiceId },
        select: {
          status: true,
          jobId: true,
          kind: true,
          quoteId: true,
        },
      });

      if (invoice.status === "PAID") {
        if (invoice.jobId) {
          await closePortalIfDone(invoice.jobId, tx);
        }
        // Phase 7.4 — a paid deposit resumes the accepted quote: the job
        // is created exactly once via the sourceQuoteId guard.
        if (invoice.kind === "DEPOSIT" && invoice.quoteId) {
          await createJobFromQuote(tx, {
            companyId: session.companyId,
            quoteId: invoice.quoteId,
            actorUserId: null,
          });
        }
      }

      return {
        settled: true,
        invoiceId: session.invoiceId,
        invoiceStatus: invoice.status,
        reason: balance.balanceDueMinor.toString(),
      };
    });
  } catch (error) {
    if (
      error instanceof AppError &&
      error.code === "PAYMENT_SESSION_SETTLEMENT_CONFLICT"
    ) {
      // Provider took the money but the invoice can't accept it (voided,
      // balance consumed). Park the session as FAILED so it stops being
      // retried; the PaymentOperation was rolled back with the tx. This
      // is a money-at-risk state — the customer was charged provider-side
      // with no ledger payment — so it must be loud, not silent.
      logger.error(
        { providerSessionId },
        "Payment session settlement conflict: provider captured funds the invoice cannot accept",
      );
      captureBackgroundError(
        new Error("PAYMENT_SESSION_SETTLEMENT_CONFLICT"),
        "payment-session-settlement-conflict",
      );
      await prisma.paymentSession.updateMany({
        where: { providerSessionId, status: "OPEN" },
        data: { status: "FAILED" },
      });
      return {
        settled: false,
        invoiceId: undefined,
        reason: "SETTLEMENT_CONFLICT",
      };
    }
    throw error;
  }
}

/**
 * Phase 7.2 — webhook intake: dedupe via ProviderWebhookEvent (unique
 * provider+eventId makes replays harmless), then process by type.
 * Unknown types are acknowledged and logged, never errors.
 */
const WEBHOOK_MAX_ATTEMPTS = 8;
const WEBHOOK_RETRY_MIN_AGE_MS = 60 * 1000;

/**
 * Apply a verified webhook to ledger state and record the outcome.
 *
 * Retryable by design: deterministic rejections (`rejected:*`,
 * `ignored`, `settled`, …) are marked processed immediately, but
 * processing exceptions leave `processedAt` NULL with an `error:*`
 * outcome so a provider replay — or `sweepUnprocessedWebhookEvents` —
 * re-runs the event instead of the dedupe row swallowing the failure.
 * After WEBHOOK_MAX_ATTEMPTS the event is dead-lettered (processedAt
 * set) so a permanently poisoned event cannot retry forever.
 */
async function applyWebhookEvent(
  provider: PaymentProvider,
  event: { id: string; companyId: string | null; attempts: number },
  verified: VerifiedWebhook,
): Promise<string> {
  let outcome = "ignored";
  let companyId = event.companyId;
  try {
    if (
      verified.type === "checkout.completed" ||
      verified.type === "payment.succeeded"
    ) {
      if (!verified.providerSessionId) {
        outcome = "rejected:missing-session";
      } else {
        const session = await prisma.paymentSession.findUnique({
          where: { providerSessionId: verified.providerSessionId },
          select: { companyId: true },
        });
        companyId = session?.companyId ?? null;
        const result = await settlePaymentSession(verified.providerSessionId, {
          paymentId: verified.paymentId,
          amountMinor: verified.amountMinor,
          currency: verified.currency,
        });
        outcome = result.settled
          ? "settled"
          : result.alreadySettled
            ? "already-settled"
            : `rejected:${result.reason ?? "unknown"}`;
      }
    } else if (verified.type === "checkout.expired") {
      if (verified.providerSessionId) {
        const updated = await prisma.paymentSession.updateMany({
          where: {
            providerSessionId: verified.providerSessionId,
            status: "OPEN",
          },
          data: { status: "EXPIRED" },
        });
        outcome = updated.count === 1 ? "expired" : "ignored";
      }
    } else if (
      verified.type === "refund.succeeded" ||
      verified.type === "refund.completed"
    ) {
      if (verified.refundId) {
        const updated = await prisma.refund.updateMany({
          where: { providerRefundId: verified.refundId, status: "PENDING" },
          data: { status: "COMPLETED" },
        });
        outcome = updated.count === 1 ? "refund-completed" : "ignored";
      }
    } else if (verified.type === "refund.failed") {
      if (verified.refundId) {
        const updated = await prisma.refund.updateMany({
          where: { providerRefundId: verified.refundId, status: "PENDING" },
          data: { status: "FAILED" },
        });
        outcome = updated.count === 1 ? "refund-failed" : "ignored";
      }
    } else {
      logger.info(
        { provider: provider.name, type: verified.type },
        "Ignoring unknown payment webhook event type",
      );
    }
  } catch (error) {
    outcome = `error:${error instanceof Error ? error.message : "unknown"}`;
    logger.error(
      { provider: provider.name, eventId: verified.eventId, error },
      "Payment webhook processing failed",
    );
    captureBackgroundError(error, "payment-webhook-processing");
  }

  const failed = outcome.startsWith("error:");
  const attempts = event.attempts + 1;
  const deadLettered = failed && attempts >= WEBHOOK_MAX_ATTEMPTS;
  await prisma.providerWebhookEvent.update({
    where: { id: event.id },
    data: {
      outcome,
      companyId,
      attempts: { increment: 1 },
      ...(failed && !deadLettered ? {} : { processedAt: new Date() }),
    },
  });
  return outcome;
}

export async function processWebhookEvent(
  provider: PaymentProvider,
  verified: VerifiedWebhook,
  rawBody: Buffer,
): Promise<{ outcome: string; duplicate?: boolean }> {
  const payloadHash = createHash("sha256").update(rawBody).digest("hex");

  let event;
  try {
    event = await prisma.providerWebhookEvent.create({
      data: {
        provider: provider.name,
        eventId: verified.eventId,
        type: verified.type,
        payloadHash,
        payload: {
          providerSessionId: verified.providerSessionId ?? null,
          paymentId: verified.paymentId ?? null,
          refundId: verified.refundId ?? null,
          amountMinor: verified.amountMinor?.toString() ?? null,
          currency: verified.currency ?? null,
        },
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }
    const existing = await prisma.providerWebhookEvent.findUnique({
      where: {
        provider_eventId: {
          provider: provider.name,
          eventId: verified.eventId,
        },
      },
    });
    if (!existing) {
      throw error;
    }
    if (existing.processedAt) {
      // Fully processed (or dead-lettered) delivery — replay is harmless.
      return { outcome: "duplicate", duplicate: true };
    }
    // Received earlier but processing failed: re-run it now.
    event = existing;
  }

  const outcome = await applyWebhookEvent(provider, event, verified);
  return { outcome };
}

/**
 * Reconciliation for webhook events whose processing failed and which the
 * provider never replayed. The stored `payload` carries everything
 * `VerifiedWebhook` needs, so no raw body is required. Processing is
 * idempotent (session claim, guarded balance update, PENDING-only refund
 * transitions), so overlap with a late provider replay is safe.
 */
export async function sweepUnprocessedWebhookEvents(
  providerFor: (name: string) => PaymentProvider = getPaymentProvider,
  limit = 25,
): Promise<{ retried: number; succeeded: number }> {
  const stale = await prisma.providerWebhookEvent.findMany({
    where: {
      processedAt: null,
      attempts: { lt: WEBHOOK_MAX_ATTEMPTS },
      receivedAt: { lt: new Date(Date.now() - WEBHOOK_RETRY_MIN_AGE_MS) },
    },
    take: limit,
    orderBy: { receivedAt: "asc" },
  });

  let retried = 0;
  let succeeded = 0;
  for (const event of stale) {
    try {
      const provider = providerFor(event.provider);
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      const verified: VerifiedWebhook = {
        eventId: event.eventId,
        type: event.type,
        providerSessionId:
          typeof payload.providerSessionId === "string"
            ? payload.providerSessionId
            : undefined,
        paymentId:
          typeof payload.paymentId === "string" ? payload.paymentId : undefined,
        refundId:
          typeof payload.refundId === "string" ? payload.refundId : undefined,
        amountMinor:
          typeof payload.amountMinor === "string"
            ? BigInt(payload.amountMinor)
            : undefined,
        currency:
          typeof payload.currency === "string" ? payload.currency : undefined,
      };
      const outcome = await applyWebhookEvent(provider, event, verified);
      retried += 1;
      if (!outcome.startsWith("error:")) succeeded += 1;
    } catch (error) {
      logger.warn(
        { eventId: event.eventId, error },
        "Webhook event retry failed before processing",
      );
    }
  }
  return { retried, succeeded };
}

/**
 * Phase 7.3 — reconciliation: resolve stale OPEN sessions by asking the
 * provider what actually happened. A customer who completed checkout but
 * whose webhook never arrived gets settled here; genuinely abandoned
 * sessions expire.
 */
export async function sweepStalePaymentSessions(
  provider: PaymentProvider = getPaymentProvider(),
  limit = 25,
): Promise<{ checked: number; settled: number; expired: number }> {
  const stale = await prisma.paymentSession.findMany({
    where: {
      status: "OPEN",
      OR: [
        { expiresAt: { lt: new Date() } },
        { createdAt: { lt: new Date(Date.now() - RECONCILE_MIN_AGE_MS) } },
      ],
    },
    take: limit,
    orderBy: { createdAt: "asc" },
    select: { id: true, providerSessionId: true, expiresAt: true },
  });

  let settled = 0;
  let expired = 0;
  for (const session of stale) {
    try {
      if (provider.retrieveCheckout) {
        const remote = await provider.retrieveCheckout(
          session.providerSessionId,
        );
        if (remote.status === "COMPLETED") {
          const result = await settlePaymentSession(session.providerSessionId, {
            paymentId: remote.paymentId,
            amountMinor: remote.amountMinor,
            currency: remote.currency,
          });
          if (result.settled) settled += 1;
          continue;
        }
        if (remote.status === "FAILED") {
          await prisma.paymentSession.updateMany({
            where: { id: session.id, status: "OPEN" },
            data: { status: "FAILED" },
          });
          expired += 1;
          continue;
        }
      }
      if (session.expiresAt < new Date()) {
        await prisma.paymentSession.updateMany({
          where: { id: session.id, status: "OPEN" },
          data: { status: "EXPIRED" },
        });
        expired += 1;
      }
    } catch (error) {
      logger.warn(
        { sessionId: session.id, error },
        "Payment session reconciliation failed for one session",
      );
    }
  }
  return { checked: stale.length, settled, expired };
}

export function startPaymentSessionScheduler(): () => void {
  const provider = getPaymentProvider();
  let stopped = false;
  let running = false;
  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      await sweepStalePaymentSessions(provider);
    } catch (error) {
      logger.error({ error }, "Payment session sweep failed");
      captureBackgroundError(error, "payment-session-sweep");
    }
    try {
      await sweepUnprocessedWebhookEvents();
    } catch (error) {
      logger.error({ error }, "Webhook event retry sweep failed");
      captureBackgroundError(error, "payment-webhook-sweep");
    } finally {
      running = false;
    }
  };
  const initialTimer = setTimeout(() => void tick(), 30_000);
  initialTimer.unref();
  const timer = setInterval(
    () => void tick(),
    SESSION_SWEEP_MINUTES * 60 * 1000,
  );
  timer.unref();
  return () => {
    stopped = true;
    clearTimeout(initialTimer);
    clearInterval(timer);
  };
}
