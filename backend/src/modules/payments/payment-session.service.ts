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
  if (key === "sandbox") return sandboxPaymentProvider;
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
      // retried; the PaymentOperation was rolled back with the tx.
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
    if (isUniqueConstraintError(error)) {
      return { outcome: "duplicate", duplicate: true };
    }
    throw error;
  }

  let outcome = "ignored";
  let companyId: string | null = null;
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
  }

  await prisma.providerWebhookEvent.update({
    where: { id: event.id },
    data: { processedAt: new Date(), outcome, companyId },
  });
  return { outcome };
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
