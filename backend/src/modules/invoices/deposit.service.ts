import { AppError } from "../../common/errors.js";
import { getNextInvoiceNumber } from "../../common/counters/counter.service.js";
import { prisma } from "../../db/prisma.js";
import type { Prisma } from "../../generated/prisma/index.js";
import type { AuthContext } from "../../common/auth/auth.types.js";
import { createRefund } from "./refund.service.js";

type Tx = Prisma.TransactionClient;

const DEPOSIT_DUE_DAYS = 7;

/**
 * Phase 7.4 — deposit invoices.
 *
 * A DEPOSIT invoice is created when a quote carrying deposit terms is
 * accepted (DepositGate). It keeps `jobId` null so the per-job unique
 * index on invoices is unaffected, links back to the quote and the
 * service request, and is payable through the normal online-checkout /
 * staff payment paths. When it becomes PAID, the payment-settlement path
 * calls `createJobFromQuote` (idempotent via `sourceQuoteId`) so the job
 * materializes exactly once.
 */
export async function ensureDepositInvoice(
  tx: Tx,
  args: {
    companyId: string;
    quoteId: string;
    serviceRequestId: string | null;
    customerId: string;
    currency: string;
    depositMinor: bigint;
    actorUserId?: string | null;
  },
): Promise<{ id: string; invoiceNumber: string; existed: boolean }> {
  const existing = await tx.invoice.findFirst({
    where: {
      companyId: args.companyId,
      quoteId: args.quoteId,
      kind: "DEPOSIT",
    },
    select: { id: true, invoiceNumber: true },
  });
  if (existing) {
    return { ...existing, existed: true };
  }

  const nextNumber = await getNextInvoiceNumber(args.companyId, tx);
  const invoiceNumber = `INV-${nextNumber.toString().padStart(6, "0")}`;
  const now = new Date();
  const dueAt = new Date(
    now.getTime() + DEPOSIT_DUE_DAYS * 24 * 60 * 60 * 1000,
  );

  const invoice = await tx.invoice.create({
    data: {
      companyId: args.companyId,
      customerId: args.customerId,
      jobId: null,
      quoteId: args.quoteId,
      serviceRequestId: args.serviceRequestId,
      createdBy: args.actorUserId ?? null,
      invoiceNumber,
      kind: "DEPOSIT",
      status: "ISSUED",
      subtotalMinor: args.depositMinor,
      discountMinor: 0n,
      taxMinor: 0n,
      totalMinor: args.depositMinor,
      amountPaidMinor: 0n,
      balanceDueMinor: args.depositMinor,
      currency: args.currency,
      issuedAt: now,
      dueAt,
      items: {
        create: {
          companyId: args.companyId,
          description: "Deposit — due before work is scheduled",
          quantity: "1",
          unitPriceMinor: args.depositMinor,
          totalMinor: args.depositMinor,
          sortOrder: 0,
          sourceType: "MANUAL",
        },
      },
    },
    select: { id: true, invoiceNumber: true },
  });
  return { ...invoice, existed: false };
}

/**
 * DepositGate (Phase 7.4): evaluated inside the quote-acceptance
 * transaction. When the accepted quote carries a frozen deposit, issue
 * the DEPOSIT invoice and return WAIT — the request stays ACCEPTED with
 * no job until the deposit invoice is paid, at which point the payment
 * settlement path resumes job creation.
 */
export async function evaluateDepositGate(ctx: {
  companyId: string;
  quoteId: string;
  serviceRequestId: string | null;
  transaction?: Tx;
}): Promise<{ result: "PASS" | "WAIT"; reason?: string }> {
  const db = ctx.transaction ?? prisma;
  const acceptance = await db.quoteAcceptance.findUnique({
    where: {
      quoteId_companyId: { quoteId: ctx.quoteId, companyId: ctx.companyId },
    },
    select: { depositMinor: true },
  });
  const depositMinor = acceptance?.depositMinor ?? 0n;
  if (depositMinor <= 0n) return { result: "PASS" };

  const quote = await db.quote.findFirstOrThrow({
    where: { id: ctx.quoteId, companyId: ctx.companyId },
    select: { customerId: true, currency: true },
  });

  await ensureDepositInvoice(db as Tx, {
    companyId: ctx.companyId,
    quoteId: ctx.quoteId,
    serviceRequestId: ctx.serviceRequestId,
    customerId: quote.customerId,
    currency: quote.currency,
    depositMinor,
    actorUserId: null,
  });
  return { result: "WAIT", reason: "DEPOSIT_PAYMENT_REQUIRED" };
}

/** Called by the payment-settlement path when a DEPOSIT invoice is paid. */
export async function depositInvoiceForQuote(
  tx: Tx,
  invoiceId: string,
): Promise<{ quoteId: string | null; serviceRequestId: string | null }> {
  const invoice = await tx.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    select: { quoteId: true, serviceRequestId: true, kind: true },
  });
  if (invoice.kind !== "DEPOSIT" || !invoice.quoteId) {
    throw new AppError(
      "INVOICE_NOT_DEPOSIT",
      "Invoice is not a deposit invoice",
      422,
    );
  }
  return {
    quoteId: invoice.quoteId,
    serviceRequestId: invoice.serviceRequestId,
  };
}

/**
 * Phase 7.4 — deposit cancellation.
 *
 * Staff cancel a DEPOSIT invoice with an explicit reason and a
 * refund-vs-retain decision:
 *  - `refund: true`  → every payment on the invoice is refunded in full
 *    through the durable refund path (provider idempotency keys make
 *    retries safe) before the invoice is voided.
 *  - `refund: false` → the deposit is retained as revenue; the invoice
 *    is voided and the retention is recorded in the audit metadata.
 *
 * The void itself is a status-guarded write under a FOR UPDATE row lock,
 * so concurrent cancels, payment settlement and refund creation
 * serialize. Cancelling an already-VOID invoice is idempotent. When the
 * deposit was still gating an ACCEPTED service request (no job created
 * yet), the request is moved to CANCELLED with a ServiceRequestEvent.
 */
export async function cancelDepositInvoice(
  context: AuthContext,
  invoiceId: string,
  input: { reason: string; refund: boolean },
) {
  const reason = input.reason.trim();
  if (!reason) {
    throw new AppError(
      "DEPOSIT_CANCEL_REASON_REQUIRED",
      "A cancellation reason is required",
      422,
    );
  }

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, companyId: context.companyId },
    select: {
      id: true,
      kind: true,
      status: true,
      quoteId: true,
      serviceRequestId: true,
      customerId: true,
      invoiceNumber: true,
    },
  });
  if (!invoice) {
    throw new AppError("RESOURCE_NOT_FOUND", "Invoice not found", 404);
  }
  if (invoice.kind !== "DEPOSIT") {
    throw new AppError(
      "INVOICE_NOT_DEPOSIT",
      "Only deposit invoices can be cancelled through this action",
      422,
    );
  }
  if (invoice.status === "VOID") {
    return { invoiceId: invoice.id, alreadyCancelled: true, refunds: [] };
  }

  // Refund before voiding: createRefund only accepts PAID/PARTIALLY_PAID
  // invoices, and each refund is independently idempotent/resumable.
  const refunds: { paymentId: string; refundId: string; status: string }[] =
    [];
  if (input.refund) {
    const payments = await prisma.payment.findMany({
      where: { invoiceId: invoice.id, companyId: context.companyId },
      select: { id: true, amountMinor: true },
    });
    for (const payment of payments) {
      const refunded = await prisma.refund.aggregate({
        where: {
          paymentId: payment.id,
          status: { not: "FAILED" },
        },
        _sum: { amountMinor: true },
      });
      const refundable =
        payment.amountMinor - (refunded._sum.amountMinor ?? 0n);
      if (refundable <= 0n) continue;
      const refund = await createRefund(context, invoice.id, {
        paymentId: payment.id,
        amountMinor: Number(refundable),
        reason: `Deposit cancellation: ${reason}`,
      });
      refunds.push({
        paymentId: payment.id,
        refundId: refund.id,
        status: refund.status,
      });
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string; status: string }[]>`
      SELECT id, status FROM invoices WHERE id = ${invoice.id}::uuid FOR UPDATE`;
    if (locked.length === 0) {
      throw new AppError("RESOURCE_NOT_FOUND", "Invoice not found", 404);
    }
    if (locked[0].status === "VOID") {
      return { alreadyCancelled: true as const };
    }

    await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: "VOID", balanceDueMinor: 0n },
    });

    // If the deposit was still gating the request (accepted quote, no
    // job materialized yet), cancel the request too so it cannot be
    // worked on after the money is gone.
    let requestCancelled = false;
    if (invoice.serviceRequestId && invoice.quoteId) {
      const jobExists = await tx.job.findFirst({
        where: {
          companyId: context.companyId,
          sourceQuoteId: invoice.quoteId,
        },
        select: { id: true },
      });
      if (!jobExists) {
        const updated = await tx.serviceRequest.updateMany({
          where: {
            id: invoice.serviceRequestId,
            companyId: context.companyId,
            status: "ACCEPTED",
          },
          data: { status: "CANCELLED" },
        });
        if (updated.count > 0) {
          requestCancelled = true;
          await tx.serviceRequestEvent.create({
            data: {
              companyId: context.companyId,
              requestId: invoice.serviceRequestId,
              actorUserId: context.userId,
              type: "CANCELLED",
              fromStatus: "ACCEPTED",
              toStatus: "CANCELLED",
              metadata: {
                reason,
                depositInvoiceId: invoice.id,
                depositRetained: !input.refund,
              },
            },
          });
        }
      }
    }

    await tx.portalAuditEvent.create({
      data: {
        companyId: context.companyId,
        customerId: invoice.customerId,
        actorUserId: context.userId,
        action: "DEPOSIT_INVOICE_CANCELLED",
        resourceType: "INVOICE",
        resourceId: invoice.id,
        metadata: {
          invoiceNumber: invoice.invoiceNumber,
          reason,
          refundRequested: input.refund,
          depositRetained: !input.refund,
          requestCancelled,
        },
      },
    });

    return { alreadyCancelled: false as const, requestCancelled };
  });

  return {
    invoiceId: invoice.id,
    alreadyCancelled: result.alreadyCancelled,
    refunds,
    requestCancelled:
      "requestCancelled" in result ? result.requestCancelled : false,
  };
}
