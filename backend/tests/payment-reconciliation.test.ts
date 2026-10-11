import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { reconcileOrphanedPaymentOperations } from "../src/modules/payments/payment-operation.service.js";

const app = buildApp();

function unique(label: string) {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

/** Registers a company and seeds one issued invoice for it. */
async function seedInvoice(label: string) {
  const suffix = unique(label);
  const response = await request(app)
    .post("/api/v1/auth/register")
    .send({
      email: `owner-${suffix}@example.com`,
      password: "correct-horse-battery-staple",
      firstName: "Owner",
      lastName: label,
      companyName: `Company ${suffix}`,
    });
  expect(response.status).toBe(201);

  const companyId = response.body.data.company.id as string;
  const userId = response.body.data.user.id as string;

  const customer = await prisma.customer.create({
    data: { companyId, firstName: "Pat", lastName: "Payer" },
  });
  const invoice = await prisma.invoice.create({
    data: {
      companyId,
      customerId: customer.id,
      invoiceNumber: `INV-${suffix}`,
      status: "ISSUED",
      subtotalMinor: 10000n,
      totalMinor: 10000n,
      balanceDueMinor: 10000n,
      currency: "USD",
    },
  });

  return { companyId, userId, invoiceId: invoice.id };
}

type Seed = Awaited<ReturnType<typeof seedInvoice>>;

/** A COMPLETED operation whose ledger link was never written. */
function createOrphanedOperation(seed: Seed, idempotencyKey: string) {
  return prisma.paymentOperation.create({
    data: {
      companyId: seed.companyId,
      invoiceId: seed.invoiceId,
      userId: seed.userId,
      amountMinor: 2500n,
      currency: "USD",
      method: "CASH",
      provider: "manual",
      idempotencyKey,
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });
}

function createLedgerPayment(seed: Seed, idempotencyKey: string) {
  return prisma.payment.create({
    data: {
      companyId: seed.companyId,
      invoiceId: seed.invoiceId,
      createdBy: seed.userId,
      amountMinor: 2500n,
      currency: "USD",
      method: "CASH",
      idempotencyKey,
    },
  });
}

describe("reconcileOrphanedPaymentOperations", () => {
  it("links an orphaned COMPLETED operation to the ledger payment with the same idempotency key", async () => {
    const seed = await seedInvoice("recon-link");
    const key = unique("key-link");
    const operation = await createOrphanedOperation(seed, key);
    const payment = await createLedgerPayment(seed, key);

    await reconcileOrphanedPaymentOperations(seed.companyId, seed.invoiceId);

    const reloaded = await prisma.paymentOperation.findUniqueOrThrow({
      where: { id: operation.id },
    });
    expect(reloaded.ledgerPaymentId).toBe(payment.id);
    expect(reloaded.status).toBe("COMPLETED");
  });

  it("marks the operation FAILED when no ledger payment exists, and never borrows another company's payment", async () => {
    const seed = await seedInvoice("recon-fail-a");
    const other = await seedInvoice("recon-fail-b");
    const key = unique("key-shared");

    const operation = await createOrphanedOperation(seed, key);
    // Another tenant happens to hold a payment with the very same key.
    await createLedgerPayment(other, key);

    await reconcileOrphanedPaymentOperations(seed.companyId, seed.invoiceId);

    const reloaded = await prisma.paymentOperation.findUniqueOrThrow({
      where: { id: operation.id },
    });
    expect(reloaded.status).toBe("FAILED");
    expect(reloaded.ledgerPaymentId).toBeNull();
    expect(reloaded.errorMessage).toMatch(/no ledger payment found/i);
  });
});
