import { randomBytes } from "node:crypto";
import { AppError } from "../../common/errors.js";
import type { AuthContext } from "../../common/auth/auth.types.js";
import { prisma } from "../../db/prisma.js";
import { notificationPublisher } from "../notifications/notification.port.js";

export type QuoteStatusValue =
  "DRAFT" | "SENT" | "APPROVED" | "DECLINED" | "EXPIRED";
export type QuoteApprovalActionValue = "APPROVED" | "DECLINED";

export interface QuoteItemInput {
  description: string;
  quantity: number;
  unitPriceMinor: number;
}

export interface CreateQuoteInput {
  customerId: string;
  jobId?: string;
  currency: string;
  discountMinor?: number;
  taxRateBps?: number;
  expiresAt?: Date;
  items: QuoteItemInput[];
}

function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, nestedValue: unknown) =>
      typeof nestedValue === "bigint" ? nestedValue.toString() : nestedValue,
    ),
  ) as T;
}

const quoteSelect = {
  id: true,
  companyId: true,
  customerId: true,
  jobId: true,
  status: true,
  subtotalMinor: true,
  discountMinor: true,
  taxMinor: true,
  taxRateBps: true,
  totalMinor: true,
  currency: true,
  expiresAt: true,
  sentAt: true,
  approvedAt: true,
  declinedAt: true,
  shareToken: true,
  createdAt: true,
  updatedAt: true,
  customer: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  job: { select: { id: true, jobNumber: true, status: true } },
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
  approvalEvents: {
    orderBy: { createdAt: "desc" as const },
    select: {
      id: true,
      action: true,
      source: true,
      createdAt: true,
      actor: { select: { id: true, firstName: true, lastName: true } },
    },
  },
} as const;

function calculateTotals(input: CreateQuoteInput) {
  const subtotalMinor = input.items.reduce(
    (total, item) => total + Math.round(item.quantity * item.unitPriceMinor),
    0,
  );
  const discountMinor = input.discountMinor ?? 0;
  const taxableMinor = subtotalMinor - discountMinor;
  const taxMinor = Math.round(
    (taxableMinor * (input.taxRateBps ?? 0)) / 10_000,
  );
  return {
    subtotalMinor,
    discountMinor,
    taxMinor,
    taxRateBps: input.taxRateBps ?? 0,
    totalMinor: taxableMinor + taxMinor,
  };
}

async function assertQuoteReferences(
  context: AuthContext,
  customerId: string,
  jobId?: string,
) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, companyId: context.companyId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!customer) {
    throw new AppError("QUOTE_INVALID_CUSTOMER", "Customer not found", 422);
  }

  if (jobId) {
    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        companyId: context.companyId,
        customerId,
        status: { notIn: ["COMPLETED", "CANCELLED"] },
      },
      select: { id: true },
    });
    if (!job) {
      throw new AppError(
        "QUOTE_INVALID_JOB",
        "Job must belong to the customer and remain active",
        422,
      );
    }
  }
}

function assertTotals(totals: ReturnType<typeof calculateTotals>) {
  if (
    totals.discountMinor < 0 ||
    totals.discountMinor > totals.subtotalMinor ||
    totals.taxRateBps < 0 ||
    totals.taxRateBps > 10_000
  ) {
    throw new AppError("QUOTE_INVALID_TOTALS", "Quote totals are invalid", 422);
  }
}

export async function createQuote(
  context: AuthContext,
  input: CreateQuoteInput,
) {
  await assertQuoteReferences(context, input.customerId, input.jobId);
  const totals = calculateTotals(input);
  assertTotals(totals);

  const quote = await prisma.$transaction(async (transaction) => {
    return transaction.quote.create({
      data: {
        companyId: context.companyId,
        customerId: input.customerId,
        jobId: input.jobId,
        currency: input.currency.toUpperCase(),
        expiresAt: input.expiresAt,
        ...totals,
        items: {
          create: input.items.map((item, index) => ({
            companyId: context.companyId,
            description: item.description.trim(),
            quantity: item.quantity,
            unitPriceMinor: BigInt(item.unitPriceMinor),
            totalMinor: BigInt(Math.round(item.quantity * item.unitPriceMinor)),
            sortOrder: index,
          })),
        },
      },
      select: quoteSelect,
    });
  });
  return jsonSafe(quote);
}

export async function listQuotes(
  context: AuthContext,
  status?: QuoteStatusValue,
) {
  const quotes = await prisma.quote.findMany({
    where: { companyId: context.companyId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: quoteSelect,
  });
  return jsonSafe(quotes);
}

export async function getQuote(context: AuthContext, quoteId: string) {
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, companyId: context.companyId },
    select: quoteSelect,
  });
  if (!quote) {
    throw new AppError("RESOURCE_NOT_FOUND", "Quote not found", 404);
  }
  return jsonSafe(quote);
}

export async function sendQuote(context: AuthContext, quoteId: string) {
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, companyId: context.companyId },
    select: { id: true, status: true, shareToken: true, jobId: true },
  });
  if (!quote) {
    throw new AppError("RESOURCE_NOT_FOUND", "Quote not found", 404);
  }
  if (quote.status !== "DRAFT" && quote.status !== "DECLINED") {
    throw new AppError(
      "QUOTE_NOT_SENDABLE",
      "Quote cannot be sent in its current state",
      409,
    );
  }

  const sent = await prisma.quote.update({
    where: { id: quoteId },
    data: {
      status: "SENT",
      sentAt: new Date(),
      shareToken: quote.shareToken ?? randomBytes(32).toString("hex"),
      declinedAt: null,
    },
    select: quoteSelect,
  });
  void notificationPublisher.publish({
    type: "QUOTE_SENT",
    companyId: context.companyId,
    quoteId,
  });
  return jsonSafe(sent);
}

export async function getPublicQuote(shareToken: string) {
  const quote = await prisma.quote.findUnique({
    where: { shareToken },
    select: {
      id: true,
      status: true,
      subtotalMinor: true,
      discountMinor: true,
      taxMinor: true,
      taxRateBps: true,
      totalMinor: true,
      currency: true,
      expiresAt: true,
      sentAt: true,
      approvedAt: true,
      declinedAt: true,
      customer: { select: { firstName: true, lastName: true } },
      items: {
        orderBy: { sortOrder: "asc" },
        select: {
          description: true,
          quantity: true,
          unitPriceMinor: true,
          totalMinor: true,
        },
      },
      job: { select: { jobNumber: true, serviceType: true } },
    },
  });
  if (!quote) {
    throw new AppError("RESOURCE_NOT_FOUND", "Quote not found", 404);
  }
  return jsonSafe(quote);
}

export async function respondToPublicQuote(
  shareToken: string,
  action: QuoteApprovalActionValue,
) {
  const quote = await prisma.quote.findUnique({
    where: { shareToken },
    select: { id: true, companyId: true, status: true },
  });
  if (!quote) {
    throw new AppError("RESOURCE_NOT_FOUND", "Quote not found", 404);
  }
  if (quote.status === action) {
    return getPublicQuote(shareToken);
  }
  if (quote.status !== "SENT") {
    throw new AppError(
      "QUOTE_ALREADY_RESOLVED",
      "Quote has already been resolved",
      409,
    );
  }

  const now = new Date();
  await prisma.$transaction(async (transaction) => {
    const result = await transaction.quote.updateMany({
      where: { id: quote.id, status: "SENT" },
      data: {
        status: action,
        ...(action === "APPROVED" ? { approvedAt: now } : { declinedAt: now }),
      },
    });
    if (result.count !== 1) {
      throw new AppError(
        "QUOTE_ALREADY_RESOLVED",
        "Quote has already been resolved",
        409,
      );
    }
    await transaction.quoteApprovalEvent.create({
      data: {
        companyId: quote.companyId,
        quoteId: quote.id,
        action,
        source: "CUSTOMER",
      },
    });
  });
  void notificationPublisher.publish({
    type: action === "APPROVED" ? "QUOTE_APPROVED" : "QUOTE_DECLINED",
    companyId: quote.companyId,
    quoteId: quote.id,
  });
  return getPublicQuote(shareToken);
}