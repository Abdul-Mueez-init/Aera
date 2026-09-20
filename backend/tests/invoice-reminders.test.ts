import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { inProcessQueue } from "../src/queue/in-process-queue.adapter.js";
import { runInvoiceReminderSweep } from "../src/modules/invoices/invoice-reminder.service.js";

const app = buildApp();
const DAY_MS = 86_400_000;
const OPTIONS = { intervalDays: 3, termsDays: 14 };

async function seedCompany(label: string) {
  const suffix = `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const email = `owner-${suffix}@example.com`;
  const res = await request(app).post("/api/v1/auth/register").send({
    email,
    password: "correct-horse-battery-staple",
    firstName: "Owner",
    lastName: label,
    companyName: `Company ${suffix}`,
  });
  expect(res.status).toBe(201);
  const auth = { Authorization: `Bearer ${res.body.data.accessToken}` };

  const member = await prisma.companyMember.findFirst({
    where: { user: { email } },
    select: { companyId: true, userId: true },
  });
  expect(member).not.toBeNull();

  const customer = await request(app)
    .post("/api/v1/customers")
    .set(auth)
    .send({ firstName: "Bilal", lastName: "Ahmed" });
  expect(customer.status).toBe(201);

  return {
    companyId: member!.companyId,
    ownerUserId: member!.userId,
    customerId: customer.body.data.id as string,
  };
}

async function createInvoice(
  company: { companyId: string; customerId: string },
  overrides: {
    status?: "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "OVERDUE";
    dueAt?: Date | null;
    issuedAt?: Date | null;
    balanceDueMinor?: bigint;
  } = {},
) {
  const balance = overrides.balanceDueMinor ?? BigInt(50000);
  return prisma.invoice.create({
    data: {
      companyId: company.companyId,
      customerId: company.customerId,
      invoiceNumber: `INV-T-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
      status: overrides.status ?? "ISSUED",
      subtotalMinor: BigInt(50000),
      totalMinor: BigInt(50000),
      balanceDueMinor: balance,
      amountPaidMinor: BigInt(50000) - balance,
      currency: "USD",
      issuedAt: overrides.issuedAt === undefined ? new Date(Date.now() - 10 * DAY_MS) : overrides.issuedAt,
      dueAt: overrides.dueAt === undefined ? new Date(Date.now() - 2 * DAY_MS) : overrides.dueAt,
    },
  });
}

async function reminders(companyId: string) {
  return prisma.notification.findMany({
    where: { companyId, type: "INVOICE_PAYMENT_REMINDER" },
    select: { recipientUserId: true, payload: true },
  });
}

async function sweep(now: Date = new Date()) {
  const result = await runInvoiceReminderSweep(now, OPTIONS);
  await inProcessQueue.onIdle();
  return result;
}

describe("invoice reminder sweep", () => {
  it("marks a past-due invoice OVERDUE and notifies the owner", async () => {
    const company = await seedCompany("overdue");
    const invoice = await createInvoice(company);

    await sweep();

    const updated = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(updated?.status).toBe("OVERDUE");

    const rows = await reminders(company.companyId);
    expect(rows).toHaveLength(1);
    expect(rows[0].recipientUserId).toBe(company.ownerUserId);
    expect(rows[0].payload).toMatchObject({ invoiceId: invoice.id });
  });

  it("ignores not-yet-due, paid, zero-balance, and draft invoices", async () => {
    const company = await seedCompany("ineligible");
    const future = await createInvoice(company, { dueAt: new Date(Date.now() + 5 * DAY_MS) });
    const paid = await createInvoice(company, { status: "PAID", balanceDueMinor: BigInt(0) });
    const draft = await createInvoice(company, { status: "DRAFT" });

    await sweep();

    expect(await reminders(company.companyId)).toHaveLength(0);
    const statuses = await prisma.invoice.findMany({
      where: { id: { in: [future.id, paid.id, draft.id] } },
      select: { id: true, status: true },
    });
    expect(statuses.find((row) => row.id === future.id)?.status).toBe("ISSUED");
    expect(statuses.find((row) => row.id === paid.id)?.status).toBe("PAID");
    expect(statuses.find((row) => row.id === draft.id)?.status).toBe("DRAFT");
  });

  it("does not re-remind inside the interval, but does after it", async () => {
    const company = await seedCompany("dedupe");
    await createInvoice(company);

    await sweep();
    await sweep();
    expect(await reminders(company.companyId)).toHaveLength(1);

    await sweep(new Date(Date.now() + 4 * DAY_MS));
    expect(await reminders(company.companyId)).toHaveLength(2);
  });

  it("falls back to issuedAt + terms when dueAt is null", async () => {
    const company = await seedCompany("legacy");
    const legacy = await createInvoice(company, {
      dueAt: null,
      issuedAt: new Date(Date.now() - 20 * DAY_MS),
    });
    await createInvoice(company, {
      dueAt: null,
      issuedAt: new Date(Date.now() - 5 * DAY_MS),
    });

    await sweep();

    const rows = await reminders(company.companyId);
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toMatchObject({ invoiceId: legacy.id });
  });

  it("keeps reminders scoped to the invoice's own company", async () => {
    const a = await seedCompany("tenant-a");
    const b = await seedCompany("tenant-b");
    const invoiceA = await createInvoice(a);
    const invoiceB = await createInvoice(b);

    await sweep();

    const rowsA = await reminders(a.companyId);
    const rowsB = await reminders(b.companyId);
    expect(rowsA).toHaveLength(1);
    expect(rowsB).toHaveLength(1);
    expect(rowsA[0].payload).toMatchObject({ invoiceId: invoiceA.id });
    expect(rowsB[0].payload).toMatchObject({ invoiceId: invoiceB.id });
    expect(rowsA[0].recipientUserId).toBe(a.ownerUserId);
    expect(rowsB[0].recipientUserId).toBe(b.ownerUserId);
  });
});