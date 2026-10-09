import { prisma } from "../../db/prisma.js";
import { logger } from "../../common/logger.js";
import { captureBackgroundError } from "../../common/observability.js";
import type { PaymentProvider, PaymentRequest } from "./payment.port.js";

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
      { operationId, status: operation.status, retryCount: operation.retryCount },
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
    try {
      // Attempt to commit the ledger payment
      await prisma.$transaction(async (tx) => {
        // Verify the invoice still exists and has sufficient balance
        const invoice = await tx.invoice.findUnique({
          where: { id: operation.invoiceId },
          select: {
            id: true,
            balanceDueMinor: true,
            amountPaidMinor: true,
            status: true,
          },
        });

        if (!invoice) {
          throw new Error(`Invoice ${operation.invoiceId} not found`);
        }

        if (invoice.balanceDueMinor < operation.amountMinor) {
          throw new Error(`Insufficient balance on invoice ${operation.invoiceId}`);
        }

        // Update invoice balance
        const updatedInvoice = await tx.invoice.update({
          where: { id: operation.invoiceId },
          data: {
            amountPaidMinor: { increment: operation.amountMinor },
            balanceDueMinor: { decrement: operation.amountMinor },
          },
          select: {
            id: true,
            balanceDueMinor: true,
          },
        });

        // Derive status from post-update balance
        const newStatus = updatedInvoice.balanceDueMinor === 0n ? "PAID" : "PARTIALLY_PAID";
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
      });

      logger.info(
        { operationId: operation.id },
        "Successfully committed PROVIDER_ACCEPTED operation to ledger",
      );
    } catch (error) {
      logger.error(
        { operationId: operation.id, error },
        "Failed to commit PROVIDER_ACCEPTED operation to ledger",
      );
      captureBackgroundError(error, "payment-ledger-commit", {
        operationId: operation.id,
      });
    }
  }
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
    // Check if a payment record exists with the same idempotency key
    const existingPayment = await prisma.payment.findUnique({
      where: {
        companyId_idempotencyKey: {
          companyId: operation.companyId,
          idempotencyKey: operation.idempotencyKey,
        },
      },
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
