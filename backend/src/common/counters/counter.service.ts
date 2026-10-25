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
  // One atomic statement: insert the row at 1 or increment it in place.
  // The old SELECT-then-Prisma-upsert bootstrap could surface a raw
  // unique-violation 500 when two first-ever allocations for a company
  // raced; ON CONFLICT serializes them inside Postgres instead.
  const rows = await transaction.$queryRaw<Array<{ lastValue: number }>>`
    INSERT INTO company_counters (id, "companyId", kind, "lastValue", "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), ${companyId}::uuid, ${kind}, 1, now(), now())
    ON CONFLICT ("companyId", kind)
    DO UPDATE SET "lastValue" = company_counters."lastValue" + 1, "updatedAt" = now()
    RETURNING "lastValue"
  `;
  const value = rows[0]?.lastValue;
  if (value === undefined) {
    throw new Error(`Counter allocation failed for ${companyId}/${kind}`);
  }
  return value;
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
    getNextCounterInTransaction(companyId, kind, transaction),
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
