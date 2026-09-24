import { AppError } from "../../common/errors.js";
import type { AuthContext } from "../../common/auth/auth.types.js";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import {
  manualPaymentProvider,
  type PaymentProvider,
} from "../payments/payment.port.js";
import { notificationPublisher } from "../notifications/notification.port.js";
import { getNextInvoiceNumber } from "../../common/counters/counter.service.js";

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

function multiplyMinorByQuantity(unitPriceMinor: bigint, quantity: string) {
  const [whole, fraction = ""] = quantity.split(".");
  const scale = 10n ** BigInt(fraction.length);
  const numerator = BigInt(`${whole}${fraction}`);
  return (unitPriceMinor * numerator + scale / 2n) / scale;
}

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
  db: typeof prisma | Parameters<Parameters<typeof prisma.$transaction>[0]>[0] = prisma,
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
      totalMinor: multiplyMinorByQuantity(
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
    quote?.totalMinor ?? (subtotalMinor - discountMinor + taxMinor);

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
) {
  const invoices = await prisma.invoice.findMany({
    where: { companyId: context.companyId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: invoiceSelect,
  });
  return jsonSafe(invoices);
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
  await prisma.invoice.update({
    where: { id: invoiceId },
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
  const existingPayment = await prisma.payment.findUnique({
    where: {
      companyId_idempotencyKey: {
        companyId: context.companyId,
        idempotencyKey: input.idempotencyKey,
      },
    },
    select: { invoiceId: true },
  });
  if (existingPayment) {
    if (existingPayment.invoiceId !== invoiceId) {
      throw new AppError(
        "PAYMENT_IDEMPOTENCY_CONFLICT",
        "Idempotency key was used for another invoice",
        409,
      );
    }
    return getInvoice(context, invoiceId);
  }
  if (input.amountMinor <= 0) {
    throw new AppError(
      "PAYMENT_INVALID_AMOUNT",
      "Payment amount must be positive",
      422,
    );
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const invoice = await transaction.invoice.findFirst({
        where: { id: invoiceId, companyId: context.companyId },
        select: { status: true, balanceDueMinor: true, currency: true },
      });
      if (!invoice)
        throw new AppError("RESOURCE_NOT_FOUND", "Invoice not found", 404);
      if (invoice.status === "DRAFT" || invoice.status === "VOID") {
        throw new AppError(
          "INVOICE_NOT_PAYABLE",
          "Invoice is not payable",
          409,
        );
      }
      if (invoice.currency !== input.currency.toUpperCase()) {
        throw new AppError(
          "PAYMENT_CURRENCY_MISMATCH",
          "Payment currency does not match invoice",
          422,
        );
      }

      const providerResult = await provider.recordPayment({
        amountMinor: BigInt(input.amountMinor),
        currency: input.currency,
        method: input.method,
        reference: input.reference,
      });
      const update = await transaction.invoice.updateMany({
        where: {
          id: invoiceId,
          companyId: context.companyId,
          balanceDueMinor: { gte: BigInt(input.amountMinor) },
          status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
        },
        data: {
          amountPaidMinor: { increment: BigInt(input.amountMinor) },
          balanceDueMinor: { decrement: BigInt(input.amountMinor) },
          status:
            invoice.balanceDueMinor === BigInt(input.amountMinor)
              ? "PAID"
              : "PARTIALLY_PAID",
          ...(invoice.balanceDueMinor === BigInt(input.amountMinor)
            ? { paidAt: new Date() }
            : {}),
        },
      });
      if (update.count !== 1) {
        throw new AppError(
          "PAYMENT_EXCEEDS_BALANCE",
          "Payment exceeds the invoice balance",
          422,
        );
      }
      await transaction.payment.create({
        data: {
          companyId: context.companyId,
          invoiceId,
          createdBy: context.userId,
          amountMinor: BigInt(input.amountMinor),
          currency: input.currency.toUpperCase(),
          method: input.method,
          provider: provider.name,
          providerPaymentId: providerResult.providerPaymentId,
          reference: input.reference?.trim(),
          idempotencyKey: input.idempotencyKey,
        },
      });
      return true;
    });
    void result;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return getInvoice(context, invoiceId);
    }
    throw error;
  }
  return getInvoice(context, invoiceId);
}
