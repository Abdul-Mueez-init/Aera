import { Router } from "express";
import express from "express";
import { env } from "../../config/env.js";
import { AppError } from "../../common/errors.js";
import {
  getPaymentProvider,
  processWebhookEvent,
} from "./payment-session.service.js";
import { sandboxPaymentProvider } from "./sandbox.provider.js";

const router = Router();

/**
 * Phase 7.2 — provider webhooks.
 *
 * Mounted BEFORE express.json() in app.ts so `req.body` is the raw Buffer
 * the signature was computed over — re-serializing parsed JSON would
 * break HMAC verification. Signature + timestamp checks happen inside
 * provider.verifyWebhook (timing-safe compare, stale-timestamp rejection).
 * Events are deduped by ProviderWebhookEvent's unique (provider, eventId)
 * before any state changes, so replays are harmless.
 */
router.post(
  "/:provider",
  express.raw({ type: () => true, limit: "1mb" }),
  async (request, response) => {
    if (!env.ONLINE_PAYMENTS_ENABLED) {
      throw new AppError("RESOURCE_NOT_FOUND", "Not found", 404);
    }
    const name = Array.isArray(request.params.provider)
      ? request.params.provider[0]
      : request.params.provider;
    const provider =
      name === "sandbox" ? sandboxPaymentProvider : getPaymentProvider(name);
    if (!provider.verifyWebhook) {
      throw new AppError(
        "WEBHOOK_NOT_SUPPORTED",
        "Provider does not support webhooks",
        400,
      );
    }
    const rawBody = Buffer.isBuffer(request.body)
      ? request.body
      : Buffer.from(JSON.stringify(request.body ?? {}), "utf8");
    const headers = request.headers as Record<string, string | undefined>;
    const verified = provider.verifyWebhook(rawBody, headers);
    const result = await processWebhookEvent(provider, verified, rawBody);
    response.status(200).json({ received: true, outcome: result.outcome });
  },
);

export { router as paymentWebhookRouter };
