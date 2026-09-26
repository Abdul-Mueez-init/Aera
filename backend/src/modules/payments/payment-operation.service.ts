import { prisma } from "../../db/prisma.js";
import { logger } from "../../common/logger.js";
import type { PaymentProvider, PaymentRequest } from "./payment.port.js";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000; // 1 second

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
  const operation = await prisma.paymentOperation.findUnique({
    where: { id: operationId },
  });

  if (!operation) {
    throw new Error(`Payment operation ${operationId} not found`);
  }

  if (operation.status !== "PENDING" && operation.status !== "FAILED") {
    logger.info(
      { operationId, status: operation.status },
      "Payment operation already processed or in progress",
    );
    return;
  }

  // Mark as processing to prevent concurrent processing
  await prisma.paymentOperation.update({
    where: { id: operationId },
    data: {
      status: "PROCESSING",
      updatedAt: new Date(),
    },
  });

  try {
    const request: PaymentRequest = {
      amountMinor: operation.amountMinor,
      currency: operation.currency,
      method: operation.method as "CASH" | "CARD" | "BANK_TRANSFER" | "OTHER",
      reference: operation.reference ?? undefined,
    };

    const result = await provider.recordPayment(request);

    // Mark as completed
    await prisma.paymentOperation.update({
      where: { id: operationId },
      data: {
        status: "COMPLETED",
        providerPaymentId: result.providerPaymentId,
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    logger.info(
      { operationId, providerPaymentId: result.providerPaymentId },
      "Payment operation completed successfully",
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
    } else {
      // Mark as failed for retry
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
        "Payment operation failed, will retry",
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
      status: "PENDING",
      retryCount: { lt: MAX_RETRIES },
    },
    take: limit,
    orderBy: { createdAt: "asc" },
  });

  logger.info(
    { count: pendingOperations.length },
    "Processing pending payment operations",
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