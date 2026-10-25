import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import {
  processPendingPaymentOperations,
  processProviderAcceptedOperations,
  reconcileOrphanedPaymentOperations,
} from "../src/modules/payments/payment-operation.service.js";
import type { PaymentProvider } from "../src/modules/payments/payment.port.js";

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

/** A PROVIDER_ACCEPTED operation stranded before its ledger commit. */
function createAcceptedOperation(
  seed: Seed,
  idempotencyKey: string,
  amountMinor: bigint,
) {
  return prisma.paymentOperation.create({
    data: {
      companyId: seed.companyId,
      invoiceId: seed.invoiceId,
      userId: seed.userId,
      amountMinor,
      currency: "USD",
      method: "CASH",
      provider: "manual",
      providerPaymentId: `provider-${idempotencyKey}`,
      idempotencyKey,
      status: "PROVIDER_ACCEPTED",
    },
  });
}

describe("processProviderAcceptedOperations (recovery sweep)", () => {
  it("commits a stranded PROVIDER_ACCEPTED operation to the ledger", async () => {
    const seed = await seedInvoice("sweep-commit");
    const operation = await createAcceptedOperation(
      seed,
      unique("key-sweep-commit"),
      10000n,
    );

    await processProviderAcceptedOperations();

    const reloaded = await prisma.paymentOperation.findUniqueOrThrow({
      where: { id: operation.id },
    });
    expect(reloaded.status).toBe("COMPLETED");
    expect(reloaded.ledgerPaymentId).not.toBeNull();

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: seed.invoiceId },
    });
    expect(invoice.status).toBe("PAID");
    expect(invoice.balanceDueMinor).toBe(0n);
    expect(invoice.amountPaidMinor).toBe(10000n);

    const payments = await prisma.payment.findMany({
      where: { invoiceId: seed.invoiceId },
    });
    expect(payments).toHaveLength(1);
    expect(payments[0]?.amountMinor).toBe(10000n);
  });

  it("never double-credits when two sweeps race over the same operations", async () => {
    const seed = await seedInvoice("sweep-race");
    // Two accepted operations whose sum exceeds the balance: only the
    // first may commit; the invoice must never go negative.
    await createAcceptedOperation(seed, unique("key-race-a"), 6000n);
    await createAcceptedOperation(seed, unique("key-race-b"), 6000n);

    await Promise.all([
      processProviderAcceptedOperations(),
      processProviderAcceptedOperations(),
    ]);

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: seed.invoiceId },
    });
    expect(invoice.balanceDueMinor).toBeGreaterThanOrEqual(0n);
    expect(invoice.amountPaidMinor).toBe(6000n);

    const payments = await prisma.payment.findMany({
      where: { invoiceId: seed.invoiceId },
    });
    expect(payments).toHaveLength(1);

    const operations = await prisma.paymentOperation.findMany({
      where: { invoiceId: seed.invoiceId },
      orderBy: { createdAt: "asc" },
    });
    expect(operations.map((op) => op.status).sort()).toEqual([
      "COMPLETED",
      "FAILED",
    ]);
    const parked = operations.find((op) => op.status === "FAILED");
    expect(parked?.providerPaymentId).not.toBeNull();
    expect(parked?.errorMessage).toMatch(/reconciliation/i);
  });

  it("leaves a PROVIDER_ACCEPTED operation for the next sweep when the invoice is already PAID by that same payment's twin", async () => {
    const seed = await seedInvoice("sweep-settled");
    const operation = await createAcceptedOperation(
      seed,
      unique("key-settled"),
      4000n,
    );
    // The invoice was settled by another payment channel meanwhile: the
    // accepted operation can no longer commit and must be parked for
    // reconciliation, not forced through.
    await prisma.invoice.update({
      where: { id: seed.invoiceId },
      data: { status: "PAID", balanceDueMinor: 0n, amountPaidMinor: 10000n },
    });

    await processProviderAcceptedOperations();

    const reloaded = await prisma.paymentOperation.findUniqueOrThrow({
      where: { id: operation.id },
    });
    expect(reloaded.status).toBe("FAILED");
    expect(reloaded.errorMessage).toMatch(/reconciliation/i);
    const payments = await prisma.payment.findMany({
      where: { invoiceId: seed.invoiceId },
    });
    expect(payments).toHaveLength(0);
  });
});

describe("processPendingPaymentOperations (provider retry guard)", () => {
  it("never re-runs the provider for a FAILED operation that already has a provider payment id", async () => {
    const seed = await seedInvoice("sweep-guard");
    const marker = unique("ref-guard");
    const operation = await prisma.paymentOperation.create({
      data: {
        companyId: seed.companyId,
        invoiceId: seed.invoiceId,
        userId: seed.userId,
        amountMinor: 1000n,
        currency: "USD",
        method: "CASH",
        provider: "manual",
        providerPaymentId: "provider-already-paid",
        idempotencyKey: unique("key-guard"),
        reference: marker,
        status: "FAILED",
        retryCount: 1,
      },
    });

    // The sweep scans every company's operations, so only calls carrying
    // this operation's unique reference count as a re-run of THIS one.
    let providerCalls = 0;
    const countingProvider: PaymentProvider = {
      name: "manual",
      async recordPayment(request) {
        if (request.reference === marker) providerCalls += 1;
        return { providerPaymentId: "provider-second-charge" };
      },
    };

    await processPendingPaymentOperations(countingProvider);

    expect(providerCalls).toBe(0);
    const reloaded = await prisma.paymentOperation.findUniqueOrThrow({
      where: { id: operation.id },
    });
    expect(reloaded.providerPaymentId).toBe("provider-already-paid");
  });
});
