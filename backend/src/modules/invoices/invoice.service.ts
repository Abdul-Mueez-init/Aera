import { AppError } from "../../common/errors.js";
import type { AuthContext } from "../../common/auth/auth.types.js";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { logger } from "../../common/logger.js";
import {
  manualPaymentProvider,
  type PaymentProvider,
} from "../payments/payment.port.js";
import {
  createPaymentOperation,
  processPaymentOperation,
  completePaymentOperation,
} from "../payments/payment-operation.service.js";
import { notificationPublisher } from "../notifications/notification.port.js";
import { getNextInvoiceNumber } from "../../common/counters/counter.service.js";
import { calculateLineItemTotal } from "../../common/money/money.service.js";
import { closePortalIfDone } from "../portal/portal.grants.js";

export type InvoiceStatusValue =
  "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "VOID" | "OVERDUE";
export type PaymentMethodValue = "CASH" | "CARD" | "BANK_TRANSFER" | "OTHER";

export interface PaymentInput {
  amountMinor: number;
  method: PaymentMethodValue;
  currency: string;
  reference?: string;
  idempotencyKey: string;
}

function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, nestedValue: unknown) =>
      typeof nestedValue === "bigint" ? nestedValue.toString() : nestedValue,
    ),
  ) as T;
}

const invoiceSelect = {
  id: true,
  companyId: true,
  customerId: true,
  jobId: true,
  quoteId: true,
  invoiceNumber: true,
  status: true,
  subtotalMinor: true,
  discountMinor: true,
  taxMinor: true,
  totalMinor: true,
  amountPaidMinor: true,
  balanceDueMinor: true,
  currency: true,
  dueAt: true,
  issuedAt: true,
  paidAt: true,
  createdAt: true,
  updatedAt: true,
  customer: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  job: { select: { id: true, jobNumber: true, status: true } },
  quote: { select: { id: true, status: true } },
  items: {
    orderBy: { sortOrder: "asc" as const },
    select: {
      id: true,
      description: true,
      quantity: true,
      unitPriceMinor: true,
      totalMinor: true,
      sortOrder: true,
    },
  },
  payments: {
    orderBy: { receivedAt: "desc" as const },
    select: {
      id: true,
      amountMinor: true,
      currency: true,
      method: true,
      provider: true,
      reference: true,
      idempotencyKey: true,
      receivedAt: true,
    },
  },
} as const;

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

// multiplyMinorByQuantity is now imported from money.service.ts

async function nextInvoiceNumber(
  transaction: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  companyId: string,
) {
  const nextNumber = await getNextInvoiceNumber(companyId, transaction);
  return `INV-${nextNumber.toString().padStart(6, "0")}`;
}

export interface GenerateInvoiceOptions {
  allowZeroAmount?: boolean;
}

async function getCompletedJobSource(
  context: AuthContext,
  jobId: string,
  db:
    | typeof prisma
    | Parameters<Parameters<typeof prisma.$transaction>[0]>[0] = prisma,
) {
  const job = await db.job.findFirst({
    where: { id: jobId, companyId: context.companyId },
    select: {
      id: true,
      customerId: true,
      status: true,
      serviceType: true,
      problemDescription: true,
      assignedTechnicianId: true,
      quotes: {
        where: { status: "APPROVED" },
        orderBy: { approvedAt: "desc" },
        take: 1,
        select: {
          id: true,
          subtotalMinor: true,
          discountMinor: true,
          taxMinor: true,
          totalMinor: true,
          currency: true,
          items: {
            orderBy: { sortOrder: "asc" },
            select: {
              description: true,
              quantity: true,
              unitPriceMinor: true,
              totalMinor: true,
              sortOrder: true,
            },
          },
        },
      },
      parts: {
        orderBy: { createdAt: "asc" },
        select: {
          name: true,
          quantity: true,
          unitPriceMinor: true,
          currency: true,
        },
      },
    },
  });
  if (!job) {
    throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  }
  if (job.status !== "COMPLETED") {
    throw new AppError(
      "INVOICE_JOB_NOT_COMPLETED",
      "Only completed jobs can generate invoices",
      422,
    );
  }
  return job;
}

export async function generateInvoiceFromJob(
  context: AuthContext,
  jobId: string,
  options: GenerateInvoiceOptions = {},
  existingTx?: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
) {
  const db = existingTx ?? prisma;
  const existing = await db.invoice.findFirst({
    where: { companyId: context.companyId, jobId },
    select: invoiceSelect,
  });
  if (existing) {
    return jsonSafe(existing);
  }

  const job = await getCompletedJobSource(context, jobId, db);
  const quote = job.quotes[0];
  const currency = quote?.currency ?? job.parts[0]?.currency ?? "USD";

  type InvoiceItemDraft = {
    description: string;
    quantity: string | number | { toString(): string };
    unitPriceMinor: bigint;
    totalMinor: bigint;
    sortOrder: number;
  };

  let items: InvoiceItemDraft[];

  if (quote && quote.items.length > 0) {
    items = quote.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
      totalMinor: item.totalMinor,
      sortOrder: item.sortOrder,
    }));
  } else if (job.parts.length > 0) {
    items = job.parts.map((part, index) => ({
      description: part.name,
      quantity: part.quantity,
      unitPriceMinor: part.unitPriceMinor,
      totalMinor: calculateLineItemTotal(
        part.unitPriceMinor,
        part.quantity.toString(),
      ),
      sortOrder: index,
    }));
  } else {
    if (!options.allowZeroAmount) {
      throw new AppError(
        "INVOICE_ZERO_AMOUNT",
        "Cannot generate a $0 invoice without billable items (approved quote or parts). To generate a zero-cost invoice, set allowZeroAmount to true.",
        422,
      );
    }
    items = [
      {
        description: `${job.serviceType} (Zero-cost / Courtesy Service)`,
        quantity: 1,
        unitPriceMinor: BigInt(0),
        totalMinor: BigInt(0),
        sortOrder: 0,
      },
    ];
  }

  const subtotalMinor = quote
    ? quote.subtotalMinor
    : items.reduce((sum, item) => sum + item.totalMinor, BigInt(0));
  const discountMinor = quote?.discountMinor ?? BigInt(0);
  const taxMinor = quote?.taxMinor ?? BigInt(0);
  const totalMinor =
    quote?.totalMinor ?? subtotalMinor - discountMinor + taxMinor;

  // Money invariant: an invoice must never be persisted with negative or
  // internally inconsistent totals. Quote totals are normally recomputed
  // at quote-write time, but this is the last line of defence before a
  // corrupt total becomes a customer-facing balance.
  if (
    subtotalMinor < 0n ||
    discountMinor < 0n ||
    taxMinor < 0n ||
    totalMinor < 0n ||
    totalMinor !== subtotalMinor - discountMinor + taxMinor ||
    items.some((item) => item.totalMinor < 0n || item.unitPriceMinor < 0n)
  ) {
    throw new AppError(
      "INVOICE_INVALID_TOTALS",
      "Invoice totals are inconsistent (total must equal subtotal - discount + tax, with no negative amounts)",
      422,
    );
  }

  if (totalMinor === BigInt(0) && !options.allowZeroAmount) {
    throw new AppError(
      "INVOICE_ZERO_AMOUNT",
      "Cannot generate a $0 invoice without billable items (approved quote or parts). To generate a zero-cost invoice, set allowZeroAmount to true.",
      422,
    );
  }

  const executeCreate = async (
    transaction: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  ) => {
    const innerExisting = await transaction.invoice.findFirst({
      where: { companyId: context.companyId, jobId },
      select: invoiceSelect,
    });
    if (innerExisting) {
      return innerExisting;
    }

    const invoiceNumber = await nextInvoiceNumber(
      transaction,
      context.companyId,
    );
    return transaction.invoice.create({
      data: {
        companyId: context.companyId,
        customerId: job.customerId,
        jobId: job.id,
        quoteId: quote?.id,
        createdBy: context.userId,
        invoiceNumber,
        subtotalMinor,
        discountMinor,
        taxMinor,
        totalMinor,
        balanceDueMinor: totalMinor,
        currency,
        items: {
          create: items.map((item) => ({
            companyId: context.companyId,
            description: item.description,
            quantity: item.quantity.toString(),
            unitPriceMinor: item.unitPriceMinor,
            totalMinor: item.totalMinor,
            sortOrder: item.sortOrder,
          })),
        },
      },
      select: invoiceSelect,
    });
  };

  try {
    const invoice = existingTx
      ? await executeCreate(existingTx)
      : await prisma.$transaction(async (transaction) =>
          executeCreate(transaction),
        );
    return jsonSafe(invoice);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const invoice = await db.invoice.findFirst({
        where: { companyId: context.companyId, jobId },
        select: invoiceSelect,
      });
      if (invoice) return jsonSafe(invoice);
    }
    throw error;
  }
}

export async function listInvoices(
  context: AuthContext,
  status?: InvoiceStatusValue,
  page = 1,
  pageSize = 20,
) {
  // Same pagination contract as listJobs: { items, meta }. The old
  // silent `take: 100` truncated the list while the client presented
  // totals computed from it as if they were complete.
  const where = {
    companyId: context.companyId,
    ...(status ? { status } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.invoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: invoiceSelect,
    }),
    prisma.invoice.count({ where }),
  ]);
  return {
    items: jsonSafe(items),
    meta: {
      page,
      pageSize,
      total,
      pageCount: Math.ceil(total / pageSize),
    },
  };
}

export async function getInvoice(context: AuthContext, invoiceId: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, companyId: context.companyId },
    select: invoiceSelect,
  });
  if (!invoice) {
    throw new AppError("RESOURCE_NOT_FOUND", "Invoice not found", 404);
  }
  return jsonSafe(invoice);
}

export async function listInvoicePayments(
  context: AuthContext,
  invoiceId: string,
) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, companyId: context.companyId },
    select: { payments: invoiceSelect.payments },
  });
  if (!invoice) {
    throw new AppError("RESOURCE_NOT_FOUND", "Invoice not found", 404);
  }
  return jsonSafe(invoice.payments);
}

export async function issueInvoice(context: AuthContext, invoiceId: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, companyId: context.companyId },
    select: { id: true, status: true, dueAt: true },
  });
  if (!invoice) {
    throw new AppError("RESOURCE_NOT_FOUND", "Invoice not found", 404);
  }
  if (
    invoice.status === "ISSUED" ||
    invoice.status === "PARTIALLY_PAID" ||
    invoice.status === "PAID"
  ) {
    return getInvoice(context, invoiceId);
  }
  if (invoice.status !== "DRAFT") {
    throw new AppError("INVOICE_NOT_ISSUABLE", "Invoice cannot be issued", 409);
  }
  const issuedAt = new Date();
  // Status-guarded claim: only the caller that actually flips DRAFT ->
  // ISSUED publishes the notification, so two concurrent issue calls
  // cannot both notify the customer.
  const claimed = await prisma.invoice.updateMany({
    where: { id: invoiceId, companyId: context.companyId, status: "DRAFT" },
    data: {
      status: "ISSUED",
      issuedAt,
      dueAt:
        invoice.dueAt ??
        new Date(
          issuedAt.getTime() + env.INVOICE_PAYMENT_TERMS_DAYS * 86_400_000,
        ),
    },
  });
  if (claimed.count !== 1) {
    // Lost the race: another caller issued it first. Stay idempotent and
    // do not publish a duplicate notification.
    const current = await prisma.invoice.findFirst({
      where: { id: invoiceId, companyId: context.companyId },
      select: { status: true },
    });
    if (
      current &&
      (current.status === "ISSUED" ||
        current.status === "PARTIALLY_PAID" ||
        current.status === "PAID")
    ) {
      return getInvoice(context, invoiceId);
    }
    throw new AppError("INVOICE_NOT_ISSUABLE", "Invoice cannot be issued", 409);
  }
  void notificationPublisher.publish({
    type: "INVOICE_ISSUED",
    companyId: context.companyId,
    invoiceId,
  });
  return getInvoice(context, invoiceId);
}

export async function recordPayment(
  context: AuthContext,
  invoiceId: string,
  input: PaymentInput,
  provider: PaymentProvider = manualPaymentProvider,
) {
  // Check for existing payment operation first (idempotency)
  const existingOperation = await prisma.paymentOperation.findUnique({
    where: {
      companyId_idempotencyKey: {
        companyId: context.companyId,
        idempotencyKey: input.idempotencyKey,
      },
    },
    select: {
      id: true,
      invoiceId: true,
      status: true,
      amountMinor: true,
      currency: true,
      method: true,
      providerPaymentId: true,
      retryCount: true,
    },
  });

  // An operation left behind by an earlier attempt with the same key is
  // RESUMED, not rejected: PROVIDER_ACCEPTED means the provider already
  // took the money and only the ledger commit is missing; FAILED without
  // a provider payment id never reached the provider and can safely run
  // again. Only genuinely terminal states are errors.
  let resumeOperationId: string | undefined;
  let providerAlreadyAccepted = false;

  if (existingOperation) {
    if (existingOperation.invoiceId !== invoiceId) {
      throw new AppError(
        "PAYMENT_IDEMPOTENCY_CONFLICT",
        "Idempotency key was used for another invoice",
        409,
      );
    }
    // If operation exists and is completed, return current invoice state
    if (existingOperation.status === "COMPLETED") {
      return getInvoice(context, invoiceId);
    }
    if (existingOperation.status === "PROCESSING") {
      throw new AppError(
        "PAYMENT_OPERATION_PENDING",
        "Payment operation is still being processed",
        409,
      );
    }
    if (
      existingOperation.status === "FAILED" &&
      existingOperation.providerPaymentId
    ) {
      // The provider accepted money for this key but the ledger commit
      // failed permanently. Never silently re-run or re-commit it.
      throw new AppError(
        "PAYMENT_OPERATION_RECONCILIATION_REQUIRED",
        "This payment was accepted by the provider but could not be recorded; it requires manual reconciliation",
        409,
      );
    }
    if (
      existingOperation.status === "FAILED" &&
      existingOperation.retryCount >= 3
    ) {
      throw new AppError(
        "PAYMENT_OPERATION_FAILED",
        "Previous payment operation failed",
        500,
      );
    }
    // The retry must carry the same payment the key was created for.
    if (
      existingOperation.amountMinor !== BigInt(input.amountMinor) ||
      existingOperation.currency !== input.currency.toUpperCase() ||
      existingOperation.method !== input.method
    ) {
      throw new AppError(
        "PAYMENT_IDEMPOTENCY_CONFLICT",
        "Idempotency key was used with a different payment amount, currency or method",
        409,
      );
    }
    resumeOperationId = existingOperation.id;
    providerAlreadyAccepted = existingOperation.status === "PROVIDER_ACCEPTED";
  }

  if (input.amountMinor < 0) {
    throw new AppError(
      "PAYMENT_INVALID_AMOUNT",
      "Payment amount cannot be negative",
      422,
    );
  }

  // Validate invoice first (outside transaction)
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, companyId: context.companyId },
    select: { status: true, balanceDueMinor: true, currency: true },
  });
  if (!invoice)
    throw new AppError("RESOURCE_NOT_FOUND", "Invoice not found", 404);
  if (invoice.status === "DRAFT" || invoice.status === "VOID") {
    throw new AppError("INVOICE_NOT_PAYABLE", "Invoice is not payable", 409);
  }
  if (invoice.currency !== input.currency.toUpperCase()) {
    throw new AppError(
      "PAYMENT_CURRENCY_MISMATCH",
      "Payment currency does not match invoice",
      422,
    );
  }
  // Reject impossible amounts BEFORE any operation is created or the
  // provider is called, so a bad attempt never strands an operation or
  // burns the idempotency key. A zero payment is only meaningful as the
  // settlement of a zero-balance invoice (marks it PAID).
  if (input.amountMinor === 0 && invoice.balanceDueMinor > 0n) {
    throw new AppError(
      "PAYMENT_INVALID_AMOUNT",
      "Payment amount must be greater than zero while the invoice has a balance due",
      422,
    );
  }
  if (BigInt(input.amountMinor) > invoice.balanceDueMinor) {
    throw new AppError(
      invoice.balanceDueMinor === 0n
        ? "INVOICE_ALREADY_PAID"
        : "PAYMENT_EXCEEDS_BALANCE_DUE",
      invoice.balanceDueMinor === 0n
        ? "Invoice is already paid in full"
        : "Payment amount exceeds the invoice balance due",
      422,
    );
  }

  // Create the payment operation record (outbox pattern), unless this
  // call is resuming one an earlier attempt left behind.
  let paymentOperationId = resumeOperationId;
  if (!paymentOperationId) {
    try {
      const created = await createPaymentOperation(
        context.companyId,
        invoiceId,
        context.userId,
        BigInt(input.amountMinor),
        input.currency.toUpperCase(),
        input.method,
        provider.name,
        input.reference?.trim(),
        input.idempotencyKey,
      );
      paymentOperationId = created.id;
    } catch (error) {
      // A concurrent request with the same key won the create race. Its
      // operation decides the outcome: replay it if it already finished,
      // otherwise report the payment as in flight — never a raw 500.
      if (!isUniqueConstraintError(error)) throw error;
      const raced = await prisma.paymentOperation.findUnique({
        where: {
          companyId_idempotencyKey: {
            companyId: context.companyId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        select: { status: true },
      });
      if (raced?.status === "COMPLETED") {
        return getInvoice(context, invoiceId);
      }
      throw new AppError(
        "PAYMENT_OPERATION_PENDING",
        "Payment operation is still being processed",
        409,
      );
    }
  }

  // Process the payment operation (external provider call), unless the
  // provider already accepted this operation on an earlier attempt.
  // This happens OUTSIDE the database transaction.
  if (!providerAlreadyAccepted) {
    try {
      await processPaymentOperation(paymentOperationId, provider);
    } catch (providerError) {
      // Provider failed - operation is marked as FAILED and will be retried
      // We don't update the invoice balance until provider succeeds
      logger.error(
        { paymentOperationId, error: providerError },
        "Payment provider call failed",
      );
      throw new AppError(
        "PAYMENT_PROVIDER_ERROR",
        "Payment provider failed to process payment",
        502,
      );
    }
  }
  const paymentOperation = { id: paymentOperationId };

  // Provider succeeded - now update invoice balance and create payment record in transaction
  try {
    await prisma.$transaction(async (transaction) => {
      // Claim the operation for this commit. The recovery sweep can race
      // us for the same PROVIDER_ACCEPTED operation; exactly one
      // committer may proceed, or the invoice would be credited twice.
      const claimed = await transaction.paymentOperation.updateMany({
        where: {
          id: paymentOperation.id,
          status: "PROVIDER_ACCEPTED",
          ledgerPaymentId: null,
        },
        data: { status: "PROCESSING" },
      });
      if (claimed.count !== 1) {
        throw new AppError(
          "PAYMENT_OPERATION_CLAIM_LOST",
          "Payment operation was claimed by another process",
          409,
        );
      }

      // Atomically update the invoice balance and get the post-update state
      const updatedInvoice = await transaction.invoice.update({
        where: {
          id: invoiceId,
          companyId: context.companyId,
          balanceDueMinor: { gte: BigInt(input.amountMinor) },
          status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
        },
        data: {
          amountPaidMinor: { increment: BigInt(input.amountMinor) },
          balanceDueMinor: { decrement: BigInt(input.amountMinor) },
        },
        select: {
          id: true,
          jobId: true,
          balanceDueMinor: true,
          amountPaidMinor: true,
        },
      });

      // Derive status from the authoritative post-update balance
      const newStatus =
        updatedInvoice.balanceDueMinor === 0n ? "PAID" : "PARTIALLY_PAID";
      const paidAt = newStatus === "PAID" ? new Date() : null;

      // Update the status and paidAt in the same transaction
      await transaction.invoice.update({
        where: { id: invoiceId },
        data: {
          status: newStatus,
          ...(paidAt ? { paidAt } : {}),
        },
      });

      // Get the PROVIDER_ACCEPTED operation to get providerPaymentId
      const acceptedOperation = await transaction.paymentOperation.findUnique({
        where: { id: paymentOperation.id },
        select: { providerPaymentId: true },
      });

      // Create the payment record
      const payment = await transaction.payment.create({
        data: {
          companyId: context.companyId,
          invoiceId,
          createdBy: context.userId,
          amountMinor: BigInt(input.amountMinor),
          currency: input.currency.toUpperCase(),
          method: input.method,
          provider: provider.name,
          providerPaymentId: acceptedOperation?.providerPaymentId,
          reference: input.reference?.trim(),
          idempotencyKey: input.idempotencyKey,
        },
      });

      // Mark the operation as COMPLETED with the ledger payment ID
      await completePaymentOperation(
        paymentOperation.id,
        payment.id,
        transaction,
      );

      // Close portal if invoice is now fully paid
      if (newStatus === "PAID" && updatedInvoice.jobId) {
        await closePortalIfDone(updatedInvoice.jobId, transaction);
      }
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return getInvoice(context, invoiceId);
    }
    if (
      error instanceof AppError &&
      error.code === "PAYMENT_OPERATION_CLAIM_LOST"
    ) {
      // The recovery sweep won the commit race. If it completed the
      // operation, this payment is recorded — replay success; if it is
      // still mid-commit, report the payment as in flight.
      const current = await prisma.paymentOperation.findUnique({
        where: { id: paymentOperation.id },
        select: { status: true },
      });
      if (current?.status === "COMPLETED") {
        return getInvoice(context, invoiceId);
      }
      throw new AppError(
        "PAYMENT_OPERATION_PENDING",
        "Payment operation is still being processed",
        409,
      );
    }
    // The conditional invoice update matched nothing: another payment
    // consumed the balance (or settled the invoice) after this one was
    // validated. The provider DID accept this payment, so park the
    // operation with its provider id retained — the reconciliation
    // state — instead of reporting it as a plain failure.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2025"
    ) {
      await prisma.paymentOperation.updateMany({
        where: { id: paymentOperation.id, status: "PROVIDER_ACCEPTED" },
        data: {
          status: "FAILED",
          errorMessage:
            "Provider accepted the payment but the invoice balance/status no longer accepts it; manual reconciliation required",
        },
      });
      const current = await prisma.invoice.findFirst({
        where: { id: invoiceId, companyId: context.companyId },
        select: { status: true, balanceDueMinor: true },
      });
      if (
        current &&
        (current.status === "PAID" || current.balanceDueMinor === 0n)
      ) {
        throw new AppError(
          "INVOICE_ALREADY_PAID",
          "Invoice is already paid in full",
          422,
        );
      }
      throw new AppError(
        "PAYMENT_EXCEEDS_BALANCE_DUE",
        "Payment amount exceeds the invoice balance due",
        422,
      );
    }
    throw error;
  }

  return getInvoice(context, invoiceId);
}
