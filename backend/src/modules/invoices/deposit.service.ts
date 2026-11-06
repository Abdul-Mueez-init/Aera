import { AppError } from "../../common/errors.js";
import { getNextInvoiceNumber } from "../../common/counters/counter.service.js";
import { prisma } from "../../db/prisma.js";
import type { Prisma } from "../../generated/prisma/index.js";

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
