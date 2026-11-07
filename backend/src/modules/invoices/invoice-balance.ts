import type { Prisma } from "../../generated/prisma/index.js";

type Tx = Prisma.TransactionClient;

/**
 * Phase 7.5 — single source of truth for invoice money state.
 *
 * amountPaidMinor  = Σ payments on the invoice
 * creditApplied    = Σ InvoiceCreditApplication rows targeting the invoice
 * balanceDueMinor  = totalMinor − amountPaid − credits (floored at 0)
 *
 * Every monetary write (ledger payment, credit application, refund
 * bookkeeping) must call this inside the same transaction so the stored
 * columns can never drift from the underlying rows. It is idempotent and
 * safe to call repeatedly.
 */
export async function recomputeInvoiceBalance(
  invoiceId: string,
  tx: Tx,
): Promise<{
  amountPaidMinor: bigint;
  creditAppliedMinor: bigint;
  balanceDueMinor: bigint;
  status: string;
}> {
  const invoice = await tx.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    select: {
      totalMinor: true,
      status: true,
      paidAt: true,
    },
  });

  // VOID invoices are terminal; DRAFT invoices have no ledger activity yet
  // but may already carry deposit credits — recompute their balanceDue so
  // issue-time and pay-time guards see the net amount.
  const paidAgg = await tx.payment.aggregate({
    where: { invoiceId },
    _sum: { amountMinor: true },
  });
  const creditAgg = await tx.invoiceCreditApplication.aggregate({
    where: { targetInvoiceId: invoiceId },
    _sum: { amountMinor: true },
  });

  const amountPaidMinor = paidAgg._sum.amountMinor ?? 0n;
  const creditAppliedMinor = creditAgg._sum.amountMinor ?? 0n;
  const rawBalance = invoice.totalMinor - amountPaidMinor - creditAppliedMinor;
  const balanceDueMinor = rawBalance > 0n ? rawBalance : 0n;

  const settled = amountPaidMinor + creditAppliedMinor;
  let status: string;
  if (invoice.status === "VOID") {
    status = "VOID";
  } else if (invoice.status === "DRAFT") {
    // A draft stays a draft even when credits/payments already exist
    // (deposit and diagnostic credits are applied at creation time).
    // Promoting it here would make issueInvoice treat it as already
    // issued and skip the ISSUED transition entirely.
    status = "DRAFT";
  } else if (balanceDueMinor === 0n) {
    // Zero-total invoices are settled by definition — without this a
    // $0 invoice could absorb unlimited $0 payments forever.
    status = "PAID";
  } else if (settled > 0n) {
    status = "PARTIALLY_PAID";
  } else {
    status = invoice.status === "OVERDUE" ? "OVERDUE" : "ISSUED";
  }

  const paidAt = status === "PAID" ? (invoice.paidAt ?? new Date()) : null;

  await tx.invoice.update({
    where: { id: invoiceId },
    data: {
      amountPaidMinor,
      balanceDueMinor,
      status: status as never,
      ...(status === "PAID" ? { paidAt } : {}),
    },
  });

  return { amountPaidMinor, creditAppliedMinor, balanceDueMinor, status };
}

/**
 * Phase 7.4/7.5 — apply paid deposit invoices to a final invoice.
 *
 * For every PAID DEPOSIT invoice on the same service request, credit the
 * target invoice up to what the deposit actually paid minus what earlier
 * targets already consumed. The source row is locked FOR UPDATE so two
 * final invoices racing for the same deposit serialize; the
 * (sourceInvoiceId, targetInvoiceId) unique index makes a duplicate
 * application impossible even if the lock were bypassed.
 */
export async function applyDepositCredits(
  tx: Tx,
  args: {
    companyId: string;
    serviceRequestId: string;
    targetInvoiceId: string;
  },
): Promise<{ appliedMinor: bigint }> {
  const deposits = await tx.invoice.findMany({
    where: {
      companyId: args.companyId,
      serviceRequestId: args.serviceRequestId,
      kind: "DEPOSIT",
      status: "PAID",
      id: { not: args.targetInvoiceId },
    },
    select: { id: true },
  });
  if (deposits.length === 0) return { appliedMinor: 0n };

  const target = await tx.invoice.findUniqueOrThrow({
    where: { id: args.targetInvoiceId },
    select: { balanceDueMinor: true },
  });
  let remaining = target.balanceDueMinor;

  let appliedMinor = 0n;
  for (const deposit of deposits) {
    if (remaining <= 0n) break;

    // Lock the source invoice row: concurrent final invoices must see a
    // consistent view of how much of this deposit is already consumed.
    const locked = await tx.$queryRaw<
      { id: string; amountPaidMinor: bigint }[]
    >`SELECT id, "amountPaidMinor" FROM invoices WHERE id = ${deposit.id}::uuid FOR UPDATE`;
    if (locked.length === 0) continue;

    const consumedAgg = await tx.invoiceCreditApplication.aggregate({
      where: { sourceInvoiceId: deposit.id },
      _sum: { amountMinor: true },
    });
    const creditable =
      locked[0].amountPaidMinor - (consumedAgg._sum.amountMinor ?? 0n);
    const amount = creditable < remaining ? creditable : remaining;
    if (amount <= 0n) continue;

    try {
      await tx.invoiceCreditApplication.create({
        data: {
          companyId: args.companyId,
          sourceInvoiceId: deposit.id,
          targetInvoiceId: args.targetInvoiceId,
          amountMinor: amount,
        },
      });
      appliedMinor += amount;
      remaining -= amount;
    } catch (error) {
      // Unique (sourceInvoiceId, targetInvoiceId) — already applied.
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        continue;
      }
      throw error;
    }
  }

  if (appliedMinor > 0n) {
    await recomputeInvoiceBalance(args.targetInvoiceId, tx);
  }
  return { appliedMinor };
}

/**
 * Credit a target invoice from any paid source invoice (diagnostic fee,
 * deposit, goodwill credit). The source row is locked FOR UPDATE and the
 * creditable amount is `amountPaidMinor − Σ credits already sourced from
 * it`, so a PARTIALLY_PAID source can never credit money it did not
 * actually receive and two targets racing for the same source serialize.
 * The unique (sourceInvoiceId, targetInvoiceId) index makes a duplicate
 * application impossible.
 */
export async function applyPaidInvoiceCredit(
  tx: Tx,
  args: {
    companyId: string;
    sourceInvoiceId: string;
    targetInvoiceId: string;
  },
): Promise<{ appliedMinor: bigint }> {
  const locked = await tx.$queryRaw<
    { id: string; amountPaidMinor: bigint }[]
  >`SELECT id, "amountPaidMinor" FROM invoices WHERE id = ${args.sourceInvoiceId}::uuid AND "companyId" = ${args.companyId}::uuid FOR UPDATE`;
  if (locked.length === 0) return { appliedMinor: 0n };

  const consumedAgg = await tx.invoiceCreditApplication.aggregate({
    where: { sourceInvoiceId: args.sourceInvoiceId },
    _sum: { amountMinor: true },
  });
  const creditable =
    locked[0].amountPaidMinor - (consumedAgg._sum.amountMinor ?? 0n);
  if (creditable <= 0n) return { appliedMinor: 0n };

  const target = await tx.invoice.findUniqueOrThrow({
    where: { id: args.targetInvoiceId },
    select: { balanceDueMinor: true },
  });
  const amount =
    creditable < target.balanceDueMinor ? creditable : target.balanceDueMinor;
  if (amount <= 0n) return { appliedMinor: 0n };

  try {
    await tx.invoiceCreditApplication.create({
      data: {
        companyId: args.companyId,
        sourceInvoiceId: args.sourceInvoiceId,
        targetInvoiceId: args.targetInvoiceId,
        amountMinor: amount,
      },
    });
  } catch (error) {
    // Unique (sourceInvoiceId, targetInvoiceId) — already applied.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return { appliedMinor: 0n };
    }
    throw error;
  }

  await recomputeInvoiceBalance(args.targetInvoiceId, tx);
  return { appliedMinor: amount };
}
