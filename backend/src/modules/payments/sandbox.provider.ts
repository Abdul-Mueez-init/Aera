import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { env } from "../../config/env.js";
import { AppError } from "../../common/errors.js";
import type {
  CheckoutRequest,
  CheckoutResult,
  CheckoutSessionStatus,
  PaymentProvider,
  PaymentRequest,
  VerifiedWebhook,
} from "./payment.port.js";

/**
 * Phase 7.2 — sandbox provider (owner decision D-1 pending: swap for the
 * real PSP adapter behind the same PaymentProvider port).
 *
 * checkoutUrl points at our own sandbox page
 * (GET /api/v1/payments/sandbox/checkout/:providerSessionId) which POSTs
 * back to mark the checkout paid — exercising the exact same settlement
 * path a signed webhook would. Provider-side state is held in memory:
 * this adapter is for development and the test suite only, never
 * production (it is only selected when PAYMENT_PROVIDER=sandbox).
 */

interface SandboxCheckout {
  providerSessionId: string;
  status: "OPEN" | "COMPLETED" | "EXPIRED" | "FAILED";
  amountMinor: bigint;
  currency: string;
  paymentId?: string;
  createdAt: number;
}

const checkouts = new Map<string, SandboxCheckout>();
const CHECKOUT_TTL_MS = 30 * 60 * 1000;
const WEBHOOK_TOLERANCE_SECONDS = 300;

function requireWebhookSecret(): string {
  if (!env.PAYMENT_WEBHOOK_SECRET) {
    throw new AppError(
      "PAYMENT_WEBHOOK_NOT_CONFIGURED",
      "Payment webhook secret is not configured",
      503,
    );
  }
  return env.PAYMENT_WEBHOOK_SECRET;
}

export function sandboxSignature(
  rawBody: Buffer,
  timestamp: string,
  secret: string,
): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest("hex");
}

/** Test/dev helper: marks a sandbox checkout paid provider-side. */
export function markSandboxCheckoutPaid(providerSessionId: string): {
  paymentId: string;
} {
  const checkout = checkouts.get(providerSessionId);
  if (!checkout) {
    throw new AppError("RESOURCE_NOT_FOUND", "Checkout session not found", 404);
  }
  if (checkout.status !== "OPEN") {
    return { paymentId: checkout.paymentId ?? "" };
  }
  const paymentId = `pi_sbx_${randomUUID()}`;
  checkout.status = "COMPLETED";
  checkout.paymentId = paymentId;
  return { paymentId };
}

export function expireSandboxCheckout(providerSessionId: string): void {
  const checkout = checkouts.get(providerSessionId);
  if (checkout && checkout.status === "OPEN") {
    checkout.status = "EXPIRED";
  }
}

export const sandboxPaymentProvider: PaymentProvider = {
  name: "sandbox",

  async recordPayment(_request: PaymentRequest) {
    void _request;
    return { providerPaymentId: `pi_sbx_${randomUUID()}` };
  },

  async createCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    const providerSessionId = `cs_sbx_${randomUUID()}`;
    checkouts.set(providerSessionId, {
      providerSessionId,
      status: "OPEN",
      amountMinor: request.amountMinor,
      currency: request.currency,
      createdAt: Date.now(),
    });
    const base = env.PORTAL_PUBLIC_BASE_URL ?? "http://localhost:3000";
    return {
      providerSessionId,
      checkoutUrl: `${base}/api/v1/payments/sandbox/checkout/${providerSessionId}`,
      expiresAt: new Date(Date.now() + CHECKOUT_TTL_MS),
    };
  },

  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
  ): VerifiedWebhook {
    const secret = requireWebhookSecret();
    const timestamp = headers["x-sandbox-timestamp"];
    const signature = headers["x-sandbox-signature"];
    if (!timestamp || !signature) {
      throw new AppError(
        "WEBHOOK_SIGNATURE_INVALID",
        "Missing webhook signature headers",
        401,
      );
    }
    const tsSeconds = Number(timestamp);
    if (
      !Number.isFinite(tsSeconds) ||
      Math.abs(Date.now() / 1000 - tsSeconds) > WEBHOOK_TOLERANCE_SECONDS
    ) {
      throw new AppError(
        "WEBHOOK_TIMESTAMP_STALE",
        "Webhook timestamp is outside the accepted window",
        401,
      );
    }
    const expected = sandboxSignature(rawBody, timestamp, secret);
    const expectedBuf = Buffer.from(expected, "hex");
    const actualBuf = Buffer.from(signature, "hex");
    if (
      expectedBuf.length !== actualBuf.length ||
      !timingSafeEqual(expectedBuf, actualBuf)
    ) {
      throw new AppError(
        "WEBHOOK_SIGNATURE_INVALID",
        "Webhook signature verification failed",
        401,
      );
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
    } catch {
      throw new AppError(
        "WEBHOOK_PAYLOAD_INVALID",
        "Invalid webhook payload",
        400,
      );
    }
    const data =
      payload.data && typeof payload.data === "object"
        ? (payload.data as Record<string, unknown>)
        : payload;
    const eventId = payload.eventId ?? payload.id;
    const type = payload.type;
    if (typeof eventId !== "string" || typeof type !== "string") {
      throw new AppError(
        "WEBHOOK_PAYLOAD_INVALID",
        "Webhook missing eventId/type",
        400,
      );
    }
    return {
      eventId,
      type,
      providerSessionId:
        typeof data.providerSessionId === "string"
          ? data.providerSessionId
          : undefined,
      paymentId:
        typeof data.paymentId === "string" ? data.paymentId : undefined,
      refundId: typeof data.refundId === "string" ? data.refundId : undefined,
      amountMinor:
        typeof data.amountMinor === "string" ||
        typeof data.amountMinor === "number"
          ? BigInt(data.amountMinor as string | number)
          : undefined,
      currency: typeof data.currency === "string" ? data.currency : undefined,
    };
  },

  async refund() {
    return { providerRefundId: `re_sbx_${randomUUID()}` };
  },

  async retrieveCheckout(
    providerSessionId: string,
  ): Promise<CheckoutSessionStatus> {
    const checkout = checkouts.get(providerSessionId);
    if (!checkout) {
      return { status: "EXPIRED" };
    }
    if (
      checkout.status === "OPEN" &&
      Date.now() - checkout.createdAt > CHECKOUT_TTL_MS
    ) {
      checkout.status = "EXPIRED";
    }
    return {
      status: checkout.status,
      paymentId: checkout.paymentId,
      amountMinor: checkout.amountMinor,
      currency: checkout.currency,
    };
  },
};

export function sandboxWebhookPayload(args: {
  eventId: string;
  type: string;
  providerSessionId: string;
  paymentId?: string;
  amountMinor?: bigint;
  currency?: string;
}): Buffer {
  return Buffer.from(
    JSON.stringify({
      eventId: args.eventId,
      type: args.type,
      data: {
        providerSessionId: args.providerSessionId,
        ...(args.paymentId ? { paymentId: args.paymentId } : {}),
        ...(args.amountMinor !== undefined
          ? { amountMinor: args.amountMinor.toString() }
          : {}),
        ...(args.currency ? { currency: args.currency } : {}),
      },
    }),
    "utf8",
  );
}

export function sandboxWebhookHeaders(
  rawBody: Buffer,
  secret: string,
  timestampSeconds?: number,
): Record<string, string> {
  const ts = String(timestampSeconds ?? Math.floor(Date.now() / 1000));
  return {
    "x-sandbox-timestamp": ts,
    "x-sandbox-signature": sandboxSignature(rawBody, ts, secret),
    "content-type": "application/json",
  };
}

export function sandboxPayloadHash(rawBody: Buffer): string {
  return createHash("sha256").update(rawBody).digest("hex");
}
