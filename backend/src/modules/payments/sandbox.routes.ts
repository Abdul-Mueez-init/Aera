import { Router } from "express";
import { env } from "../../config/env.js";
import { AppError } from "../../common/errors.js";
import { prisma } from "../../db/prisma.js";
import {
  markSandboxCheckoutPaid,
  sandboxPaymentProvider,
} from "./sandbox.provider.js";
import { settlePaymentSession } from "./payment-session.service.js";

const router = Router();

function sandboxEnabled(): boolean {
  return env.ONLINE_PAYMENTS_ENABLED && env.PAYMENT_PROVIDER === "sandbox";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Phase 7.2/7.3 — sandbox checkout surface. Only mounted when
 * PAYMENT_PROVIDER=sandbox; simulates the hosted-checkout page a real PSP
 * would serve. The Pay button marks the checkout paid provider-side and
 * runs the same settlement path a signed webhook would.
 */
router.get("/checkout/:providerSessionId", async (request, response) => {
  if (!sandboxEnabled()) {
    throw new AppError("RESOURCE_NOT_FOUND", "Not found", 404);
  }
  const id = Array.isArray(request.params.providerSessionId)
    ? request.params.providerSessionId[0]
    : request.params.providerSessionId;
  const session = await prisma.paymentSession.findUnique({
    where: { providerSessionId: id },
    select: {
      status: true,
      amountMinor: true,
      currency: true,
      expiresAt: true,
      invoice: { select: { invoiceNumber: true } },
    },
  });
  if (!session) {
    throw new AppError("RESOURCE_NOT_FOUND", "Checkout session not found", 404);
  }
  const amount = (Number(session.amountMinor) / 100).toFixed(2);
  const payable = session.status === "OPEN" && session.expiresAt > new Date();
  response.status(200).type("html")
    .send(`<!doctype html><html><head><title>Sandbox checkout</title></head>
<body style="font-family:sans-serif;max-width:420px;margin:4rem auto">
<h1>Sandbox checkout</h1>
<p>Invoice ${escapeHtml(session.invoice.invoiceNumber)} — ${escapeHtml(session.currency)} ${amount}</p>
${
  payable
    ? `<form method="post" action="/api/v1/payments/sandbox/checkout/${encodeURIComponent(id)}/pay">
<button type="submit" style="padding:.75rem 1.5rem">Pay ${escapeHtml(session.currency)} ${amount}</button>
</form>`
    : `<p>This checkout session is ${escapeHtml(session.status.toLowerCase())}.</p>`
}
</body></html>`);
});

router.post("/checkout/:providerSessionId/pay", async (request, response) => {
  if (!sandboxEnabled()) {
    throw new AppError("RESOURCE_NOT_FOUND", "Not found", 404);
  }
  const id = Array.isArray(request.params.providerSessionId)
    ? request.params.providerSessionId[0]
    : request.params.providerSessionId;
  const { paymentId } = markSandboxCheckoutPaid(id);
  const remote = await sandboxPaymentProvider.retrieveCheckout!(id);
  const result = await settlePaymentSession(id, {
    paymentId: paymentId || remote.paymentId,
    amountMinor: remote.amountMinor,
    currency: remote.currency,
  });
  response.status(200).type("html").send(`<!doctype html><html><body
style="font-family:sans-serif;max-width:420px;margin:4rem auto">
<h1>${result.settled || result.alreadySettled ? "Payment received" : "Payment could not be applied"}</h1>
<p>You can close this window and return to the portal.</p>
</body></html>`);
});

export { router as sandboxPaymentRouter };
