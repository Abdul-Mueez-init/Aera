import { prisma } from "../../db/prisma.js";
import { logger } from "../../common/logger.js";
import { captureBackgroundError } from "../../common/observability.js";
import { env } from "../../config/env.js";
import {
  manualPaymentProvider,
  type PaymentProvider,
  type PaymentRequest,
} from "./payment.port.js";
import { closePortalIfDone } from "../portal/portal.grants.js";

const MAX_RETRIES = 3;

export async function createPaymentOperation(
  companyId: string,
  invoiceId: string,
  userId: string,
  amountMinor: bigint,
  currency: string,
  method: "CASH" | "CARD" | "BANK_TRANSFER" | "OTHER",
  provider: string,
  reference: string | undefined,
  idempotencyKey: string,
) {
  return await prisma.paymentOperation.create({
    data: {
      companyId,
      invoiceId,
      userId,
      amountMinor,
      currency,
      method,
      provider,
      reference,
      idempotencyKey,
      status: "PENDING",
    },
  });
}

export async function processPaymentOperation(
  operationId: string,
  provider: PaymentProvider,
): Promise<void> {
  // Atomically claim the operation using conditional update
  // This prevents race conditions where multiple workers process the same operation
  const claimed = await prisma.paymentOperation.updateMany({
    where: {
      id: operationId,
      status: { in: ["PENDING", "FAILED"] },
      retryCount: { lt: MAX_RETRIES },
    },
    data: {
      status: "PROCESSING",
      updatedAt: new Date(),
    },
  });

  if (claimed.count === 0) {
    // Operation was already claimed or exceeds retry limit
    const operation = await prisma.paymentOperation.findUnique({
      where: { id: operationId },
      select: { status: true, retryCount: true },
    });

    if (!operation) {
      throw new Error(`Payment operation ${operationId} not found`);
    }

    logger.info(
      {
        operationId,
        status: operation.status,
        retryCount: operation.retryCount,
      },
      "Payment operation already claimed or exceeds retry limit",
    );
    return;
  }

  // Fetch the operation details after successful claim
  const operation = await prisma.paymentOperation.findUnique({
    where: { id: operationId },
  });

  if (!operation) {
    throw new Error(`Payment operation ${operationId} not found after claim`);
  }

  try {
    const request: PaymentRequest = {
      amountMinor: operation.amountMinor,
      currency: operation.currency,
      method: operation.method as "CASH" | "CARD" | "BANK_TRANSFER" | "OTHER",
      reference: operation.reference ?? undefined,
    };

    const result = await provider.recordPayment(request);

    // Mark as PROVIDER_ACCEPTED (intermediate state before ledger commit)
    await prisma.paymentOperation.update({
      where: { id: operationId },
      data: {
        status: "PROVIDER_ACCEPTED",
        providerPaymentId: result.providerPaymentId,
        updatedAt: new Date(),
      },
    });

    logger.info(
      { operationId, providerPaymentId: result.providerPaymentId },
      "Payment operation accepted by provider",
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const newRetryCount = operation.retryCount + 1;

    if (newRetryCount >= MAX_RETRIES) {
      // Mark as permanently failed
      await prisma.paymentOperation.update({
        where: { id: operationId },
        data: {
          status: "FAILED",
          errorMessage,
          retryCount: newRetryCount,
          updatedAt: new Date(),
        },
      });

      logger.error(
        { operationId, errorMessage, retryCount: newRetryCount },
        "Payment operation failed permanently after max retries",
      );
      captureBackgroundError(error, "payment-operation", {
        operationId,
        retryCount: newRetryCount,
      });
    } else {
      // Mark as failed for retry with exponential backoff
      await prisma.paymentOperation.update({
        where: { id: operationId },
        data: {
          status: "FAILED",
          errorMessage,
          retryCount: newRetryCount,
          updatedAt: new Date(),
        },
      });

      logger.warn(
        { operationId, errorMessage, retryCount: newRetryCount },
        "Payment operation failed, will retry with backoff",
      );
    }

    throw error;
  }
}

export async function processPendingPaymentOperations(
  provider: PaymentProvider,
  limit: number = 10,
): Promise<void> {
  const pendingOperations = await prisma.paymentOperation.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      retryCount: { lt: MAX_RETRIES },
      // Never re-run the provider for an operation that already produced a
      // provider payment id: the provider accepted money for it, and a
      // re-run could double-charge. Such operations need ledger recovery
      // (or manual reconciliation), not a provider retry.
      providerPaymentId: null,
    },
    take: limit,
    orderBy: { createdAt: "asc" },
  });

  logger.info(
    { count: pendingOperations.length },
    "Processing pending/failed payment operations",
  );

  for (const operation of pendingOperations) {
    try {
      await processPaymentOperation(operation.id, provider);
    } catch (error) {
      // Log error but continue processing other operations
      logger.error(
        { operationId: operation.id, error },
        "Failed to process payment operation",
      );
    }
  }
}

/**
 * Process PROVIDER_ACCEPTED operations that haven't been committed to the ledger.
 * This is called by a background worker to retry ledger commits.
 */
export async function processProviderAcceptedOperations(
  limit: number = 10,
): Promise<void> {
  const acceptedOperations = await prisma.paymentOperation.findMany({
    where: {
      status: "PROVIDER_ACCEPTED",
      ledgerPaymentId: null,
    },
    take: limit,
    orderBy: { createdAt: "asc" },
  });

  logger.info(
    { count: acceptedOperations.length },
    "Processing PROVIDER_ACCEPTED operations for ledger commit",
  );

  for (const operation of acceptedOperations) {
    let outcome = "claimed-elsewhere" as
      "committed" | "claimed-elsewhere" | "conflict";
    try {
      // Attempt to commit the ledger payment. The operation is claimed
      // inside the transaction (PROVIDER_ACCEPTED -> PROCESSING) and the
      // invoice balance update is conditional on sufficient balance and a
      // payable status, so concurrent committers (this sweep, a retried
      // recordPayment) can never double-credit the invoice.
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.paymentOperation.updateMany({
          where: {
            id: operation.id,
            status: "PROVIDER_ACCEPTED",
            ledgerPaymentId: null,
          },
          data: { status: "PROCESSING" },
        });
        if (claimed.count !== 1) {
          return; // Another committer owns this operation now.
        }

        const updated = await tx.invoice.updateMany({
          where: {
            id: operation.invoiceId,
            companyId: operation.companyId,
            balanceDueMinor: { gte: operation.amountMinor },
            status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
          },
          data: {
            amountPaidMinor: { increment: operation.amountMinor },
            balanceDueMinor: { decrement: operation.amountMinor },
          },
        });
        if (updated.count !== 1) {
          throw new Error(
            `LEDGER_CONFLICT: Invoice ${operation.invoiceId} no longer accepts this payment (balance or status changed)`,
          );
        }

        const updatedInvoice = await tx.invoice.findUniqueOrThrow({
          where: { id: operation.invoiceId },
          select: { id: true, jobId: true, balanceDueMinor: true },
        });

        // Derive status from post-update balance
        const newStatus =
          updatedInvoice.balanceDueMinor === 0n ? "PAID" : "PARTIALLY_PAID";
        const paidAt = newStatus === "PAID" ? new Date() : null;

        await tx.invoice.update({
          where: { id: operation.invoiceId },
          data: {
            status: newStatus,
            ...(paidAt ? { paidAt } : {}),
          },
        });

        // Create the payment record
        const payment = await tx.payment.create({
          data: {
            companyId: operation.companyId,
            invoiceId: operation.invoiceId,
            createdBy: operation.userId,
            amountMinor: operation.amountMinor,
            currency: operation.currency,
            method: operation.method,
            provider: operation.provider,
            providerPaymentId: operation.providerPaymentId,
            reference: operation.reference,
            idempotencyKey: operation.idempotencyKey,
          },
        });

        // Mark operation as COMPLETED
        await completePaymentOperation(operation.id, payment.id, tx);

        // Close portal if invoice is now fully paid
        if (newStatus === "PAID" && updatedInvoice.jobId) {
          await closePortalIfDone(updatedInvoice.jobId, tx);
        }

        outcome = "committed";
      });

      if (outcome === "committed") {
        logger.info(
          { operationId: operation.id },
          "Successfully committed PROVIDER_ACCEPTED operation to ledger",
        );
      }
    } catch (error) {
      // Only a genuine ledger conflict parks the operation; any other
      // (transient) failure leaves it PROVIDER_ACCEPTED for the next
      // sweep to retry.
      if (
        error instanceof Error &&
        error.message.startsWith("LEDGER_CONFLICT:")
      ) {
        outcome = "conflict";
      }
      logger.error(
        { operationId: operation.id, error },
        "Failed to commit PROVIDER_ACCEPTED operation to ledger",
      );
      captureBackgroundError(error, "payment-ledger-commit", {
        operationId: operation.id,
      });
    }

    if (outcome === "conflict") {
      // The provider accepted this payment but the ledger can no longer
      // take it (invoice paid another way, voided, or balance consumed).
      // Park the operation as FAILED with its provider payment id retained:
      // that is the reconciliation queue state, and recordPayment refuses
      // to silently retry keys in this state.
      await prisma.paymentOperation.updateMany({
        where: { id: operation.id, status: "PROVIDER_ACCEPTED" },
        data: {
          status: "FAILED",
          errorMessage:
            "Provider accepted the payment but the invoice balance/status no longer accepts it; manual reconciliation required",
        },
      });
    }
  }
}

/**
 * One recovery sweep: retry provider processing for operations that never
 * reached the provider, then commit ledger entries for operations the
 * provider already accepted. This closes the crash window between
 * provider acceptance and ledger commit.
 */
export async function runPaymentOperationSweep(): Promise<void> {
  await processPendingPaymentOperations(manualPaymentProvider);
  await processProviderAcceptedOperations();
}

const PAYMENT_SWEEP_INITIAL_DELAY_MS = 30_000;

/**
 * Start the periodic payment-operation recovery sweep. Mirrors the
 * invoice-reminder scheduler: serialized ticks, unref'd timers, and
 * per-tick error containment so one bad sweep never kills the loop.
 */
export function startPaymentOperationScheduler(): () => void {
  let stopped = false;
  let running = false;

  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      await runPaymentOperationSweep();
    } catch (error) {
      logger.error({ error }, "Payment operation sweep failed");
      captureBackgroundError(error, "payment-operation-sweep");
    } finally {
      running = false;
    }
  };

  const initialTimer = setTimeout(() => {
    void tick();
  }, PAYMENT_SWEEP_INITIAL_DELAY_MS);
  initialTimer.unref();

  const timer = setInterval(() => {
    void tick();
  }, env.PAYMENT_OPERATION_SWEEP_MINUTES * 60_000);
  timer.unref();

  logger.info(
    { intervalMinutes: env.PAYMENT_OPERATION_SWEEP_MINUTES },
    "Payment operation recovery sweep scheduled",
  );

  return () => {
    stopped = true;
    clearTimeout(initialTimer);
    clearInterval(timer);
  };
}

export async function getPaymentOperation(operationId: string) {
  return await prisma.paymentOperation.findUnique({
    where: { id: operationId },
  });
}

export async function getPaymentOperationsByInvoice(
  companyId: string,
  invoiceId: string,
) {
  return await prisma.paymentOperation.findMany({
    where: {
      companyId,
      invoiceId,
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Mark a payment operation as COMPLETED after the ledger payment record is created.
 * This is called within the same transaction that creates the Payment record.
 */
export async function completePaymentOperation(
  operationId: string,
  ledgerPaymentId: string,
  tx?: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
) {
  const db = tx ?? prisma;
  await db.paymentOperation.update({
    where: { id: operationId },
    data: {
      status: "COMPLETED",
      ledgerPaymentId,
      completedAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

/**
 * Reconcile payment operations that are marked COMPLETED but missing ledgerPaymentId.
 * This handles the case where the operation was marked COMPLETED but the ledger commit failed.
 */
export async function reconcileOrphanedPaymentOperations(
  companyId: string,
  invoiceId: string,
): Promise<void> {
  const orphaned = await prisma.paymentOperation.findMany({
    where: {
      companyId,
      invoiceId,
      status: "COMPLETED",
      ledgerPaymentId: null,
    },
  });

  if (orphaned.length === 0) {
    return;
  }

  logger.warn(
    { companyId, invoiceId, count: orphaned.length },
    "Found orphaned payment operations marked COMPLETED without ledger payment",
  );

  for (const operation of orphaned) {
    // Check if a payment record exists with the same idempotency key.
    // Payment no longer has a unique (companyId, idempotencyKey) constraint
    // (dropped in migration 20261009180000), so this is a scoped findFirst, not
    // a findUnique. Scoping by companyId AND invoiceId keeps the lookup
    // tenant-safe and served by the (companyId, invoiceId, receivedAt) index.
    const existingPayment = await prisma.payment.findFirst({
      where: {
        companyId: operation.companyId,
        invoiceId: operation.invoiceId,
        idempotencyKey: operation.idempotencyKey,
      },
      orderBy: { createdAt: "asc" },
    });

    if (existingPayment) {
      // Link the operation to the existing payment
      await prisma.paymentOperation.update({
        where: { id: operation.id },
        data: {
          ledgerPaymentId: existingPayment.id,
        },
      });

      logger.info(
        { operationId: operation.id, paymentId: existingPayment.id },
        "Reconciled orphaned payment operation with existing payment",
      );
    } else {
      // No payment exists - this is a data integrity issue
      // Mark the operation as FAILED for manual review
      await prisma.paymentOperation.update({
        where: { id: operation.id },
        data: {
          status: "FAILED",
          errorMessage: "Reconciliation failed: no ledger payment found",
          updatedAt: new Date(),
        },
      });

      logger.error(
        { operationId: operation.id },
        "Payment operation marked COMPLETED but no ledger payment exists - manual review required",
      );
      captureBackgroundError(
        new Error(`Orphaned payment operation: ${operation.id}`),
        "payment-reconciliation",
        { operationId: operation.id },
      );
    }
  }
}
