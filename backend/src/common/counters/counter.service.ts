import { prisma } from "../../db/prisma.js";

export interface CounterKind {
  JOB_NUMBER: "JOB_NUMBER";
  INVOICE_NUMBER: "INVOICE_NUMBER";
}

async function getNextCounterInTransaction(
  companyId: string,
  kind: keyof CounterKind,
  transaction: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
): Promise<number> {
  // Use raw SQL with FOR UPDATE to lock the row for this company/kind combination
  const counter = await transaction.$queryRaw<Array<{ id: string; lastValue: number }>>`
    SELECT id, "lastValue" FROM company_counters
    WHERE "companyId" = ${companyId} AND kind = ${kind}
    FOR UPDATE
  `;

  if (counter.length > 0) {
    // Increment existing counter
    const updated = await transaction.companyCounter.update({
      where: { id: counter[0].id },
      data: { lastValue: counter[0].lastValue + 1 },
    });
    return updated.lastValue;
  } else {
    // Create new counter starting at 1 using upsert to handle race conditions
    const upserted = await transaction.companyCounter.upsert({
      where: {
        companyId_kind: {
          companyId,
          kind,
        },
      },
      create: {
        companyId,
        kind,
        lastValue: 1,
      },
      update: {
        lastValue: {
          increment: 1,
        },
      },
    });
    return upserted.lastValue;
  }
}

export async function getNextCounter(
  companyId: string,
  kind: keyof CounterKind,
  existingTx?: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
): Promise<number> {
  if (existingTx) {
    return getNextCounterInTransaction(companyId, kind, existingTx);
  }
  return prisma.$transaction(async (transaction) => 
    getNextCounterInTransaction(companyId, kind, transaction)
  );
}

export async function getNextJobNumber(
  companyId: string,
  existingTx?: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
): Promise<number> {
  return getNextCounter(companyId, "JOB_NUMBER", existingTx);
}

export async function getNextInvoiceNumber(
  companyId: string,
  existingTx?: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
): Promise<number> {
  return getNextCounter(companyId, "INVOICE_NUMBER", existingTx);
}
