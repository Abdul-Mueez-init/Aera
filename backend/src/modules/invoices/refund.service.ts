import { prisma } from "../../db/prisma.js";
import { AppError } from "../../common/errors.js";
import type { AuthContext } from "../../common/auth/auth.types.js";
import { getPaymentProvider } from "../payments/payment-session.service.js";
import { logger } from "../../common/logger.js";

function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, nested: unknown) =>
      typeof nested === "bigint" ? nested.toString() : nested,
    ),
  ) as T;
}

/**
 * Phase 7.5 — refunds.
 *
 * OWNER-only (enforced at the route). Partial refunds are allowed but
 * never exceed `payment.amountMinor − Σ non-failed refunds` for that
 * payment, computed under a FOR UPDATE row lock so concurrent refund
 * requests serialize. The Refund row is created PENDING, the provider is
 * called outside any transaction, and synchronous providers (sandbox,
 * manual cash refunds) confirm immediately — asynchronous PSPs confirm
 * via `refund.*` webhook events.
 */
export async function createRefund(
  context: AuthContext,
  invoiceId: string,
  input: { paymentId: string; amountMinor: number; reason: string },
) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, companyId: context.companyId },
    select: { id: true, status: true },
  });
  if (!invoice) {
    throw new AppError("RESOURCE_NOT_FOUND", "Invoice not found", 404);
  }
  if (invoice.status !== "PAID" && invoice.status !== "PARTIALLY_PAID") {
    throw new AppError(
      "INVOICE_NOT_REFUNDABLE",
      "Only paid or partially paid invoices can be refunded",
      409,
    );
  }

  const payment = await prisma.payment.findFirst({
    where: {
      id: input.paymentId,
      invoiceId,
      companyId: context.companyId,
    },
    select: { id: true, amountMinor: true, providerPaymentId: true },
  });
  if (!payment) {
    throw new AppError("RESOURCE_NOT_FOUND", "Payment not found", 404);
  }

  // Serializable check-and-create under a row lock on the payment.
  // A PENDING/FAILED refund for the same payment+amount+reason is RESUMED
  // rather than duplicated: the provider call below uses the refund row id
  // as its idempotency key, so retrying the same row is safe even when a
  // previous attempt succeeded provider-side but failed to record here.
  const refund = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string; amountMinor: bigint }[]>`
      SELECT id, "amountMinor" FROM payments WHERE id = ${payment.id}::uuid FOR UPDATE`;
    if (locked.length === 0) {
      throw new AppError("RESOURCE_NOT_FOUND", "Payment not found", 404);
    }
    const existing = await tx.refund.aggregate({
      where: {
        paymentId: payment.id,
        status: { not: "FAILED" },
      },
      _sum: { amountMinor: true },
    });
    const alreadyRefunded = existing._sum.amountMinor ?? 0n;
    const refundable = locked[0].amountMinor - alreadyRefunded;
    const amount = BigInt(input.amountMinor);
    const reason = input.reason.trim();
    if (amount <= 0n || amount > refundable) {
      throw new AppError(
        "REFUND_EXCEEDS_PAYMENT",
        "Refund amount exceeds the refundable balance on this payment",
        422,
      );
    }
    const reusable = await tx.refund.findFirst({
      where: {
        paymentId: payment.id,
        amountMinor: amount,
        reason,
        status: { in: ["PENDING", "FAILED"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (reusable) return reusable;
    return tx.refund.create({
      data: {
        companyId: context.companyId,
        invoiceId,
        paymentId: payment.id,
        amountMinor: amount,
        reason,
        status: "PENDING",
        createdBy: context.userId,
      },
    });
  });

  const provider = getPaymentProvider();
  if (provider.name === "manual" || !provider.refund) {
    // Manual/cash refunds need no provider call — the staff member hands
    // the money back; record it as complete immediately.
    await prisma.refund.update({
      where: { id: refund.id },
      data: { status: "COMPLETED" },
    });
    return jsonSafe({ ...refund, status: "COMPLETED" as const });
  }

  // Only the provider call is inside the try: a DB failure after the
  // provider accepted must NOT mark the refund FAILED (the money already
  // moved). Leaving it PENDING keeps it resumable — a retry reuses this
  // row and the same provider idempotency key.
  let providerRefundId: string | undefined;
  try {
    // refund.id is the provider idempotency key: if a previous attempt
    // reached the provider but crashed before recording the result, this
    // retry returns the same providerRefundId instead of refunding twice.
    const result = await provider.refund(
      payment.providerPaymentId ?? payment.id,
      refund.amountMinor,
      refund.reason,
      refund.id,
    );
    providerRefundId = result.providerRefundId;
  } catch (error) {
    await prisma.refund.update({
      where: { id: refund.id },
      data: { status: "FAILED" },
    });
    logger.error(
      { refundId: refund.id, invoiceId, error },
      "Provider refund call failed",
    );
    throw new AppError(
      "REFUND_PROVIDER_ERROR",
      "Payment provider failed to process the refund",
      502,
    );
  }

  const synchronous = provider.name === "sandbox";
  const updated = await prisma.refund.update({
    where: { id: refund.id },
    data: {
      providerRefundId,
      ...(synchronous ? { status: "COMPLETED" as const } : {}),
    },
  });
  return jsonSafe(updated);
}

export async function listInvoiceRefunds(
  context: AuthContext,
  invoiceId: string,
) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, companyId: context.companyId },
    select: { id: true },
  });
  if (!invoice) {
    throw new AppError("RESOURCE_NOT_FOUND", "Invoice not found", 404);
  }
  const rows = await prisma.refund.findMany({
    where: { invoiceId, companyId: context.companyId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      paymentId: true,
      amountMinor: true,
      reason: true,
      providerRefundId: true,
      status: true,
      createdAt: true,
      creator: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  return jsonSafe(rows);
}
