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
  // Use FOR UPDATE to lock the row for this company/kind combination
  const counter = await transaction.companyCounter.findUnique({
    where: {
      companyId_kind: {
        companyId,
        kind,
      },
    },
  });

  if (counter) {
    // Increment existing counter
    const updated = await transaction.companyCounter.update({
      where: {
        companyId_kind: {
          companyId,
          kind,
        },
      },
      data: {
        lastValue: counter.lastValue + 1,
      },
    });
    return updated.lastValue;
  } else {
    // Create new counter starting at 1
    const created = await transaction.companyCounter.create({
      data: {
        companyId,
        kind,
        lastValue: 1,
      },
    });
    return created.lastValue;
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
