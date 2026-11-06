import { AppError } from "../../common/errors.js";
import type { Prisma } from "../../generated/prisma/index.js";
import type { AuthContext } from "../../common/auth/auth.types.js";
import { prisma } from "../../db/prisma.js";
import { env } from "../../config/env.js";
import { getNextJobNumber } from "../../common/counters/counter.service.js";
import { assertRequestTransition } from "../requests/request.state.js";
import { notificationPublisher } from "../notifications/notification.port.js";
import { bookingGate } from "../scheduling/booking.gate.js";
import { evaluateDepositGate } from "../invoices/deposit.service.js";
import {
  calculateLineItemTotal,
  calculateSubtotal,
  calculateTax,
  calculateTotal,
  validateMonetaryCalculations,
} from "../../common/money/money.service.js";

export type QuoteStatusValue =
  "DRAFT" | "SENT" | "APPROVED" | "DECLINED" | "EXPIRED";
export type QuoteApprovalActionValue = "APPROVED" | "DECLINED";

export interface QuoteItemInput {
  description: string;
  quantity: string; // Changed to string for exact decimal arithmetic
  unitPriceMinor: number;
}

export interface CreateQuoteInput {
  customerId: string;
  jobId?: string;
  serviceRequestId?: string;
  basisJobId?: string;
  kind?: "INSPECTION" | "REPAIR" | "INSTALLATION" | "CHANGE_ORDER" | "GENERAL";
  currency: string;
  discountMinor?: number;
  taxRateBps?: number;
  expiresAt?: Date;
  assumptions?: string;
  exclusions?: string;
  depositType?: "NONE" | "FIXED" | "PERCENT";
  depositValue?: number;
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
  serviceRequestId: true,
  basisJobId: true,
  supersedesQuoteId: true,
  kind: true,
  assumptions: true,
  exclusions: true,
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
  depositType: true,
  depositValue: true,
  depositMinor: true,
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

export function computeQuoteTotals(
  input: Pick<CreateQuoteInput, "items" | "discountMinor" | "taxRateBps">,
) {
  // Use exact integer arithmetic for all money calculations
  const subtotalMinor = calculateSubtotal(
    input.items.map((item) => ({
      unitPriceMinor: BigInt(item.unitPriceMinor),
      quantity: item.quantity,
    })),
  );
  const discountMinor = BigInt(input.discountMinor ?? 0);
  const taxableMinor = subtotalMinor - discountMinor;
  const taxMinor = calculateTax(taxableMinor, input.taxRateBps ?? 0);
  const totalMinor = calculateTotal(subtotalMinor, discountMinor, taxMinor);

  return {
    subtotalMinor: Number(subtotalMinor),
    discountMinor: Number(discountMinor),
    taxMinor: Number(taxMinor),
    taxRateBps: input.taxRateBps ?? 0,
    totalMinor: Number(totalMinor),
  };
}

/**
 * Phase 7.4 — deposit terms. FIXED depositValue is minor units of the
 * quote currency; PERCENT depositValue is basis points of the total.
 */
export function assertDepositTerms(
  depositType: "NONE" | "FIXED" | "PERCENT",
  depositValue: bigint,
) {
  if (depositType === "NONE") return;
  if (depositValue <= 0n) {
    throw new AppError(
      "QUOTE_INVALID_DEPOSIT",
      "Deposit value must be greater than zero when a deposit is required",
      422,
    );
  }
  if (depositType === "PERCENT" && depositValue > 10_000n) {
    throw new AppError(
      "QUOTE_INVALID_DEPOSIT",
      "Percentage deposit cannot exceed 100%",
      422,
    );
  }
}

export function computeDepositMinor(
  depositType: "NONE" | "FIXED" | "PERCENT",
  depositValue: bigint,
  totalMinor: bigint,
): bigint | null {
  if (depositType === "NONE" || depositValue <= 0n) return null;
  if (depositType === "FIXED") {
    return depositValue < totalMinor ? depositValue : totalMinor;
  }
  // PERCENT: basis points, rounded half-up.
  return (totalMinor * depositValue + 5_000n) / 10_000n;
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

function assertTotals(totals: ReturnType<typeof computeQuoteTotals>) {
  try {
    validateMonetaryCalculations(
      BigInt(totals.subtotalMinor),
      BigInt(totals.discountMinor),
      totals.taxRateBps,
    );
  } catch {
    throw new AppError("QUOTE_INVALID_TOTALS", "Quote totals are invalid", 422);
  }
}

export async function createQuote(
  context: AuthContext,
  input: CreateQuoteInput,
) {
  await assertQuoteReferences(context, input.customerId, input.jobId);
  if (input.serviceRequestId) {
    const request = await prisma.serviceRequest.findFirst({
      where: {
        id: input.serviceRequestId,
        companyId: context.companyId,
        customerId: input.customerId,
      },
      select: { id: true },
    });
    if (!request) {
      throw new AppError(
        "QUOTE_INVALID_REQUEST",
        "Service request not found",
        422,
      );
    }
  }
  if (input.basisJobId) {
    const basisJob = await prisma.job.findFirst({
      where: {
        id: input.basisJobId,
        companyId: context.companyId,
        customerId: input.customerId,
      },
      select: { id: true },
    });
    if (!basisJob) {
      throw new AppError(
        "QUOTE_INVALID_JOB",
        "Basis job must belong to the customer",
        422,
      );
    }
  }
  if (env.QUOTE_BEFORE_JOB_ENABLED && !input.jobId && !input.serviceRequestId) {
    throw new AppError(
      "QUOTE_REQUIRES_REQUEST",
      "Quote must be linked to a service request or job",
      422,
    );
  }
  const totals = computeQuoteTotals(input);
  assertTotals(totals);

  // Phase 7.4 — deposit terms default from company settings when the
  // caller doesn't specify them.
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: context.companyId },
    select: { defaultDepositType: true, defaultDepositValue: true },
  });
  const depositType = input.depositType ?? company.defaultDepositType;
  const depositValue =
    input.depositValue !== undefined
      ? BigInt(input.depositValue)
      : company.defaultDepositValue;
  assertDepositTerms(depositType, depositValue);

  const quote = await prisma.$transaction(async (transaction) => {
    return transaction.quote.create({
      data: {
        companyId: context.companyId,
        customerId: input.customerId,
        jobId: input.jobId,
        serviceRequestId: input.serviceRequestId,
        basisJobId: input.basisJobId,
        kind: input.kind ?? "GENERAL",
        depositType,
        depositValue,
        assumptions: input.assumptions?.trim(),
        exclusions: input.exclusions?.trim(),
        currency: input.currency.toUpperCase(),
        expiresAt: input.expiresAt,
        ...totals,
        items: {
          create: input.items.map((item, index) => ({
            companyId: context.companyId,
            description: item.description.trim(),
            quantity: item.quantity,
            unitPriceMinor: BigInt(item.unitPriceMinor),
            totalMinor: calculateLineItemTotal(
              BigInt(item.unitPriceMinor),
              item.quantity,
            ),
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
  page = 1,
  pageSize = 20,
) {
  if (status === "SENT" || status === "EXPIRED" || !status) {
    await prisma.quote.updateMany({
      where: {
        companyId: context.companyId,
        status: "SENT",
        expiresAt: { lte: new Date() },
      },
      data: { status: "EXPIRED" },
    });
  }

  // Same pagination contract as listJobs: { items, meta }. The old
  // silent `take: 100` truncated the list while the client labelled
  // `quotes.length` as the total count.
  const where = {
    companyId: context.companyId,
    ...(status ? { status } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.quote.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: quoteSelect,
    }),
    prisma.quote.count({ where }),
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

export async function getQuote(context: AuthContext, quoteId: string) {
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, companyId: context.companyId },
    select: quoteSelect,
  });
  if (!quote) {
    throw new AppError("RESOURCE_NOT_FOUND", "Quote not found", 404);
  }

  if (
    quote.status === "SENT" &&
    quote.expiresAt &&
    quote.expiresAt.getTime() <= Date.now()
  ) {
    await prisma.quote.updateMany({
      where: { id: quoteId, status: "SENT" },
      data: { status: "EXPIRED" },
    });
    quote.status = "EXPIRED";
  }

  return jsonSafe(quote);
}

export async function updateQuote(
  context: AuthContext,
  quoteId: string,
  input: Omit<CreateQuoteInput, "customerId" | "jobId" | "serviceRequestId">,
) {
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, companyId: context.companyId },
    select: { id: true, status: true },
  });
  if (!quote) throw new AppError("RESOURCE_NOT_FOUND", "Quote not found", 404);
  if (quote.status !== "DRAFT") {
    throw new AppError(
      "QUOTE_NOT_EDITABLE",
      "Only draft quotes can be edited",
      409,
    );
  }
  const totals = computeQuoteTotals(input);
  assertTotals(totals);
  const depositType = input.depositType ?? "NONE";
  const depositValue = BigInt(input.depositValue ?? 0);
  assertDepositTerms(depositType, depositValue);
  const updated = await prisma.$transaction(async (transaction) => {
    await transaction.quoteItem.deleteMany({
      where: { quoteId, companyId: context.companyId },
    });
    return transaction.quote.update({
      where: { id: quoteId },
      data: {
        currency: input.currency.toUpperCase(),
        kind: input.kind ?? "GENERAL",
        depositType,
        depositValue,
        depositMinor: null,
        assumptions: input.assumptions?.trim(),
        exclusions: input.exclusions?.trim(),
        expiresAt: input.expiresAt,
        ...totals,
        items: {
          create: input.items.map((item, index) => ({
            companyId: context.companyId,
            description: item.description.trim(),
            quantity: item.quantity,
            unitPriceMinor: BigInt(item.unitPriceMinor),
            totalMinor: calculateLineItemTotal(
              BigInt(item.unitPriceMinor),
              item.quantity,
            ),
            sortOrder: index,
          })),
        },
      },
      select: quoteSelect,
    });
  });
  return jsonSafe(updated);
}

export async function reviseQuote(context: AuthContext, quoteId: string) {
  const original = await prisma.quote.findFirst({
    where: { id: quoteId, companyId: context.companyId },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!original)
    throw new AppError("RESOURCE_NOT_FOUND", "Quote not found", 404);
  if (!["SENT", "APPROVED", "DECLINED", "EXPIRED"].includes(original.status)) {
    throw new AppError(
      "QUOTE_NOT_REVISIONABLE",
      "Quote cannot be revised in its current state",
      409,
    );
  }
  const revision = await prisma.quote.create({
    data: {
      companyId: context.companyId,
      customerId: original.customerId,
      jobId: original.jobId,
      serviceRequestId: original.serviceRequestId,
      kind: original.kind,
      depositType: original.depositType,
      depositValue: original.depositValue,
      supersedesQuoteId: original.id,
      currency: original.currency,
      assumptions: original.assumptions,
      exclusions: original.exclusions,
      subtotalMinor: original.subtotalMinor,
      discountMinor: original.discountMinor,
      taxMinor: original.taxMinor,
      taxRateBps: original.taxRateBps,
      totalMinor: original.totalMinor,
      expiresAt: original.expiresAt,
      items: {
        create: original.items.map((item) => ({
          companyId: context.companyId,
          description: item.description,
          quantity: item.quantity,
          unitPriceMinor: item.unitPriceMinor,
          totalMinor: item.totalMinor,
          sortOrder: item.sortOrder,
        })),
      },
    },
    select: quoteSelect,
  });
  return jsonSafe(revision);
}

export async function sendQuote(context: AuthContext, quoteId: string) {
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, companyId: context.companyId },
    select: {
      id: true,
      status: true,
      jobId: true,
      serviceRequestId: true,
      supersedesQuoteId: true,
      expiresAt: true,
    },
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
  if (!env.QUOTE_BEFORE_JOB_ENABLED && !quote.jobId) {
    throw new AppError(
      "QUOTE_REQUIRES_JOB",
      "Connect this quote to a job first",
      422,
    );
  }
  if (quote.expiresAt && quote.expiresAt.getTime() <= Date.now()) {
    throw new AppError(
      "QUOTE_EXPIRED",
      "Cannot send an expired quote. Update expiration date first",
      422,
    );
  }

  const sent = await prisma.$transaction(async (transaction) => {
    // Phase 7.4 — freeze the deposit amount at send time so later edits
    // to terms can't change what an accepted customer owes.
    const depositQuote = await transaction.quote.findUniqueOrThrow({
      where: { id: quoteId },
      select: {
        depositType: true,
        depositValue: true,
        totalMinor: true,
      },
    });
    const depositMinor = computeDepositMinor(
      depositQuote.depositType,
      depositQuote.depositValue,
      depositQuote.totalMinor,
    );
    const updated = await transaction.quote.update({
      where: { id: quoteId },
      data: {
        status: "SENT",
        sentAt: new Date(),
        declinedAt: null,
        depositMinor,
      },
      select: quoteSelect,
    });
    if (quote.supersedesQuoteId) {
      await transaction.quote.updateMany({
        where: {
          id: quote.supersedesQuoteId,
          companyId: context.companyId,
          status: "SENT",
        },
        data: {
          status: "EXPIRED",
          supersededByQuoteId: quoteId,
        },
      });
    }
    if (env.QUOTE_BEFORE_JOB_ENABLED && quote.serviceRequestId) {
      const request = await transaction.serviceRequest.findFirstOrThrow({
        where: {
          id: quote.serviceRequestId!,
          companyId: context.companyId,
        },
        select: { status: true },
      });
      if (request.status !== "QUOTED") {
        assertRequestTransition(request.status, "QUOTED");
        await transaction.serviceRequest.update({
          where: { id: quote.serviceRequestId! },
          data: { status: "QUOTED" },
        });
        await transaction.serviceRequestEvent.create({
          data: {
            companyId: context.companyId,
            requestId: quote.serviceRequestId!,
            actorUserId: context.userId,
            type: "STATUS_CHANGED",
            fromStatus: request.status,
            toStatus: "QUOTED",
          },
        });
      }
    }
    return updated;
  });
  void notificationPublisher.publish({
    type: "QUOTE_SENT",
    companyId: context.companyId,
    quoteId,
  });
  return jsonSafe(sent);
}

export interface ProcessQuoteResponseOptions {
  quoteId: string;
  companyId: string;
  jobId: string | null;
  action: QuoteApprovalActionValue;
  source: "CUSTOMER" | "STAFF";
  actorUserId?: string;
  reason?: string;
  now?: Date;
  portalSessionId?: string;
  userAgentHash?: string;
}

/**
 * Phase 4.4 — acceptance gates. An ordered list evaluated inside the
 * acceptance transaction after the quote is marked APPROVED and the
 * acceptance snapshot is written. A WAIT result leaves a durable state
 * (request ACCEPTED, no job) that the gate's completion path resumes by
 * calling `createJobFromQuote` again. Phase 4 ships with no gates; Phase 5
 * adds BookingGate and Phase 7 adds DepositGate.
 */
export interface AcceptanceGateContext {
  companyId: string;
  quoteId: string;
  serviceRequestId: string | null;
  /** The acceptance transaction — gates must read/write through it so
   *  they see uncommitted acceptance state and roll back with it. */
  transaction?: Prisma.TransactionClient;
}
export interface AcceptanceGateResult {
  result: "PASS" | "WAIT";
  reason?: string;
}
export interface AcceptanceGate {
  name: string;
  evaluate(ctx: AcceptanceGateContext): Promise<AcceptanceGateResult>;
}

/**
 * Ordered gates evaluated on quote acceptance. Phase 5 registers the
 * BookingGate when BOOKING_ENABLED is on; Phase 7 adds DepositGate.
 */
export const QUOTE_ACCEPTANCE_GATES: AcceptanceGate[] = [
  ...(env.BOOKING_ENABLED ? [bookingGate] : []),
  ...(env.DEPOSITS_ENABLED
    ? [
        {
          name: "deposit",
          evaluate: (ctx: AcceptanceGateContext) =>
            evaluateDepositGate({
              companyId: ctx.companyId,
              quoteId: ctx.quoteId,
              serviceRequestId: ctx.serviceRequestId,
              transaction: ctx.transaction,
            }),
        },
      ]
    : []),
];

/**
 * Phase 7.4 — called by every payment-commit path (checkout settlement,
 * staff recordPayment, operation sweep) after an invoice balance is
 * recomputed. When a DEPOSIT invoice has just become PAID, resume the
 * accepted quote: createJobFromQuote is idempotent via sourceQuoteId.
 */
export async function resumeJobAfterDepositPayment(
  transaction: Prisma.TransactionClient,
  args: { companyId: string; invoiceId: string },
): Promise<void> {
  const invoice = await transaction.invoice.findFirst({
    where: { id: args.invoiceId, companyId: args.companyId },
    select: { kind: true, status: true, quoteId: true },
  });
  if (
    invoice?.kind === "DEPOSIT" &&
    invoice.status === "PAID" &&
    invoice.quoteId
  ) {
    await createJobFromQuote(transaction, {
      companyId: args.companyId,
      quoteId: invoice.quoteId,
      actorUserId: null,
    });
  }
}

/**
 * Phase 4.5 — single place that derives request status from quote states.
 * When no SENT or APPROVED quote remains for a request sitting in QUOTED,
 * it moves to [toStatus] (DECLINED after a decline, EXPIRED after the last
 * open quote lapses) and records the event. No-op otherwise.
 */
export async function recomputeRequestStatusAfterQuoteEvent(
  transaction: Prisma.TransactionClient,
  args: {
    companyId: string;
    requestId: string;
    toStatus: "DECLINED" | "EXPIRED";
    actorUserId?: string | null;
  },
) {
  const openQuote = await transaction.quote.findFirst({
    where: {
      serviceRequestId: args.requestId,
      companyId: args.companyId,
      status: { in: ["SENT", "APPROVED"] },
    },
    select: { id: true },
  });
  if (openQuote) return;
  const request = await transaction.serviceRequest.findFirst({
    where: { id: args.requestId, companyId: args.companyId },
    select: { status: true },
  });
  if (request?.status !== "QUOTED") return;
  await transaction.serviceRequest.update({
    where: { id: args.requestId },
    data: { status: args.toStatus },
  });
  await transaction.serviceRequestEvent.create({
    data: {
      companyId: args.companyId,
      requestId: args.requestId,
      actorUserId: args.actorUserId ?? null,
      type: "STATUS_CHANGED",
      fromStatus: "QUOTED",
      toStatus: args.toStatus,
    },
  });
}

/**
 * Shared quote-decision domain logic (handoff 5.5): transition-guarded
 * status update, QuoteApprovalEvent, and linked-job advancement on
 * approval. Used by the staff respond command and the customer portal
 * respond so both surfaces enforce identical expiry/idempotency rules.
 */
/**
 * Phase 5.5 — idempotent job creation from an accepted request-linked
 * quote. `Job.sourceQuoteId` is globally unique, so a second call (gate
 * resume, retried hold confirm, parallel accepts) returns the existing
 * job instead of duplicating. Returns null for CHANGE_ORDER quotes and
 * quotes without a service request.
 */
export async function createJobFromQuote(
  transaction: Prisma.TransactionClient,
  input: {
    companyId: string;
    quoteId: string;
    actorUserId?: string | null;
  },
): Promise<{ id: string } | null> {
  const quote = await transaction.quote.findFirst({
    where: { id: input.quoteId, companyId: input.companyId },
    select: { id: true, kind: true, serviceRequestId: true },
  });
  if (!quote?.serviceRequestId || quote.kind === "CHANGE_ORDER") return null;

  const existing = await transaction.job.findFirst({
    where: { sourceQuoteId: quote.id },
    select: { id: true },
  });
  if (existing) return existing;

  const request = await transaction.serviceRequest.findFirstOrThrow({
    where: { id: quote.serviceRequestId, companyId: input.companyId },
    select: {
      id: true,
      customerId: true,
      serviceAddressId: true,
      serviceCategory: true,
      description: true,
      priority: true,
      status: true,
    },
  });
  if (request.status !== "ACCEPTED") {
    assertRequestTransition(request.status, "ACCEPTED");
    await transaction.serviceRequest.update({
      where: { id: request.id },
      data: { status: "ACCEPTED" },
    });
    await transaction.serviceRequestEvent.create({
      data: {
        companyId: input.companyId,
        requestId: request.id,
        actorUserId: input.actorUserId ?? null,
        type: "STATUS_CHANGED",
        fromStatus: request.status,
        toStatus: "ACCEPTED",
      },
    });
  }

  const type =
    quote.kind === "INSPECTION"
      ? "DIAGNOSTIC"
      : quote.kind === "REPAIR"
        ? "REPAIR"
        : quote.kind === "INSTALLATION"
          ? "INSTALLATION"
          : "OTHER";
  const jobNumber = await getNextJobNumber(input.companyId, transaction);
  const createdJob = await transaction.job.create({
    data: {
      companyId: input.companyId,
      customerId: request.customerId,
      serviceAddressId: request.serviceAddressId,
      serviceRequestId: request.id,
      sourceQuoteId: quote.id,
      jobNumber,
      type,
      serviceType: request.serviceCategory,
      problemDescription: request.description,
      priority: request.priority,
    },
  });
  // Link the quote back to the job it created: request-first quotes are
  // created with serviceRequestId only, so without this the job's
  // `quotes` relation (used by invoice generation and job context) never
  // sees its own accepted quote.
  await transaction.quote.updateMany({
    where: { id: quote.id, companyId: input.companyId, jobId: null },
    data: { jobId: createdJob.id },
  });

  const historyActorId =
    input.actorUserId ??
    (
      await transaction.companyMember.findFirst({
        where: { companyId: input.companyId, role: "OWNER", status: "ACTIVE" },
        select: { userId: true },
      })
    )?.userId;
  if (historyActorId) {
    await transaction.jobStatusHistory.create({
      data: {
        companyId: input.companyId,
        jobId: createdJob.id,
        actorUserId: historyActorId,
        toStatus: "NEW",
        reason: "Created from accepted quote",
      },
    });
  }
  return createdJob;
}

/**
 * Phase 5.5 — resumes an accepted quote whose BookingGate returned WAIT.
 * Called when a SELF_SERVE_WINDOWS hold is confirmed: creates the job
 * (idempotent) and, when the hold carries a technician, schedules it.
 */
export async function resumeAcceptedQuoteBooking(
  transaction: Prisma.TransactionClient,
  input: {
    companyId: string;
    quoteId: string;
    actorUserId?: string | null;
    schedule?: {
      technicianId: string;
      windowStart: Date;
      windowEnd: Date;
    };
  },
): Promise<{ id: string } | null> {
  const quote = await transaction.quote.findFirst({
    where: { id: input.quoteId, companyId: input.companyId },
    select: { id: true, status: true, serviceRequestId: true },
  });
  if (!quote || quote.status !== "APPROVED" || !quote.serviceRequestId) {
    throw new AppError(
      "QUOTE_NOT_ACCEPTED",
      "Quote has not been accepted",
      409,
    );
  }
  const job = await createJobFromQuote(transaction, input);
  if (job && input.schedule) {
    await transaction.job.updateMany({
      where: { id: job.id, companyId: input.companyId, status: "NEW" },
      data: {
        assignedTechnicianId: input.schedule.technicianId,
        scheduledStart: input.schedule.windowStart,
        scheduledEnd: input.schedule.windowEnd,
        status: "SCHEDULED",
      },
    });
  }
  return job;
}

export async function processQuoteResponse(
  options: ProcessQuoteResponseOptions,
) {
  const { quoteId, companyId, jobId, action, source, actorUserId } = options;
  const now = options.now ?? new Date();

  await prisma.$transaction(async (transaction) => {
    const result = await transaction.quote.updateMany({
      where: {
        id: quoteId,
        companyId,
        status: "SENT",
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      data: {
        status: action,
        ...(action === "APPROVED" ? { approvedAt: now } : { declinedAt: now }),
      },
    });

    if (result.count !== 1) {
      const current = await transaction.quote.findFirst({
        where: { id: quoteId, companyId },
        select: { status: true, expiresAt: true },
      });
      if (current?.status === action) {
        return;
      }
      if (
        current?.status === "EXPIRED" ||
        (current?.expiresAt && current.expiresAt.getTime() <= now.getTime())
      ) {
        throw new AppError("QUOTE_EXPIRED", "This quote link has expired", 410);
      }
      throw new AppError(
        "QUOTE_ALREADY_RESOLVED",
        "Quote has already been resolved",
        409,
      );
    }

    const quote = await transaction.quote.findFirstOrThrow({
      where: { id: quoteId, companyId },
      select: {
        customerId: true,
        serviceRequestId: true,
        kind: true,
        assumptions: true,
        exclusions: true,
        subtotalMinor: true,
        discountMinor: true,
        taxMinor: true,
        totalMinor: true,
        currency: true,
        depositMinor: true,
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
    });

    await transaction.quoteApprovalEvent.create({
      data: {
        companyId,
        quoteId,
        actorUserId: actorUserId ?? null,
        action,
        source,
        reason: options.reason?.trim() || null,
      },
    });

    if (action === "APPROVED") {
      await transaction.quoteAcceptance.create({
        data: {
          quoteId,
          companyId,
          acceptedByType: source === "STAFF" ? "STAFF" : "PORTAL",
          actorUserId: actorUserId ?? null,
          portalSessionId: options.portalSessionId ?? null,
          subtotalMinor: quote.subtotalMinor,
          discountMinor: quote.discountMinor,
          taxMinor: quote.taxMinor,
          totalMinor: quote.totalMinor,
          currency: quote.currency,
          depositMinor: quote.depositMinor ?? 0n,
          itemsSnapshot: quote.items.map((item) => ({
            description: item.description,
            quantity: item.quantity.toString(),
            unitPriceMinor: item.unitPriceMinor.toString(),
            totalMinor: item.totalMinor.toString(),
            sortOrder: item.sortOrder,
          })),
          termsSnapshot: {
            assumptions: quote.assumptions,
            exclusions: quote.exclusions,
          },
          userAgentHash: options.userAgentHash,
          acceptedAt: now,
        },
      });

      // Phase 4.4: evaluate acceptance gates inside the same transaction.
      // A WAIT leaves a durable state — request ACCEPTED, no job — that
      // the gate's completion path resumes via createJobFromQuote.
      let gateWaitReason: string | undefined;
      for (const gate of QUOTE_ACCEPTANCE_GATES) {
        const verdict = await gate.evaluate({
          companyId,
          quoteId,
          serviceRequestId: quote.serviceRequestId,
          transaction,
        });
        if (verdict.result === "WAIT") {
          gateWaitReason = verdict.reason ?? gate.name;
          break;
        }
      }

      if (quote.serviceRequestId) {
        const request = await transaction.serviceRequest.findFirstOrThrow({
          where: { id: quote.serviceRequestId, companyId },
          select: {
            id: true,
            customerId: true,
            serviceAddressId: true,
            serviceCategory: true,
            description: true,
            priority: true,
            status: true,
          },
        });
        if (request.status !== "ACCEPTED") {
          assertRequestTransition(request.status, "ACCEPTED");
          await transaction.serviceRequest.update({
            where: { id: request.id },
            data: { status: "ACCEPTED" },
          });
          await transaction.serviceRequestEvent.create({
            data: {
              companyId,
              requestId: request.id,
              actorUserId: actorUserId ?? null,
              type: "STATUS_CHANGED",
              fromStatus: request.status,
              toStatus: "ACCEPTED",
              metadata: gateWaitReason
                ? { acceptanceGate: gateWaitReason }
                : undefined,
            },
          });
        }

        if (gateWaitReason === undefined) {
          await createJobFromQuote(transaction, {
            companyId,
            quoteId,
            actorUserId,
          });
        }
      }
    }
    if (action === "DECLINED" && quote.serviceRequestId) {
      await recomputeRequestStatusAfterQuoteEvent(transaction, {
        companyId,
        requestId: quote.serviceRequestId,
        toStatus: "DECLINED",
        actorUserId: actorUserId ?? null,
      });
    }

    if (action === "APPROVED" && jobId) {
      const job = await transaction.job.findFirst({
        where: { id: jobId, companyId },
        select: {
          id: true,
          status: true,
          scheduledStart: true,
        },
      });

      if (job && job.status === "QUOTING") {
        const nextStatus = job.scheduledStart ? "SCHEDULED" : "NEW";
        await transaction.job.update({
          where: { id: job.id },
          data: { status: nextStatus },
        });

        let historyActorId = actorUserId;
        if (!historyActorId) {
          const fallbackMember = await transaction.companyMember.findFirst({
            where: { companyId, role: "OWNER", status: "ACTIVE" },
            select: { userId: true },
          });
          historyActorId = fallbackMember?.userId;
        }

        if (historyActorId) {
          await transaction.jobStatusHistory.create({
            data: {
              companyId,
              jobId: job.id,
              actorUserId: historyActorId,
              fromStatus: "QUOTING",
              toStatus: nextStatus,
              reason:
                source === "STAFF"
                  ? "Quote approved by staff"
                  : "Quote approved by customer via shared link",
            },
          });
        }
      }
    }
  });

  void notificationPublisher.publish({
    type: action === "APPROVED" ? "QUOTE_APPROVED" : "QUOTE_DECLINED",
    companyId,
    quoteId,
  });
}

export async function respondToQuote(
  context: AuthContext,
  quoteId: string,
  action: QuoteApprovalActionValue,
  reason?: string,
) {
  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, companyId: context.companyId },
    select: {
      id: true,
      companyId: true,
      status: true,
      expiresAt: true,
      jobId: true,
    },
  });
  if (!quote) {
    throw new AppError("RESOURCE_NOT_FOUND", "Quote not found", 404);
  }

  if (quote.status === action) {
    return getQuote(context, quoteId);
  }

  const now = new Date();
  const isPastExpiry =
    quote.expiresAt !== null && quote.expiresAt.getTime() <= now.getTime();
  const isExpired =
    quote.status === "EXPIRED" ||
    (quote.status !== "APPROVED" &&
      quote.status !== "DECLINED" &&
      isPastExpiry);

  if (isExpired) {
    if (quote.status !== "EXPIRED") {
      await prisma.quote.updateMany({
        where: { id: quote.id, status: { in: ["DRAFT", "SENT"] } },
        data: { status: "EXPIRED" },
      });
    }
    throw new AppError("QUOTE_EXPIRED", "This quote has expired", 410);
  }

  if (quote.status !== "SENT") {
    throw new AppError(
      "QUOTE_ALREADY_RESOLVED",
      "Quote has already been resolved",
      409,
    );
  }

  // Phase 4.7: staff accept-on-behalf requires an audit reason, recorded
  // on the QuoteApprovalEvent. Only enforced on a real transition — an
  // idempotent repeat of the same decision returns early above.
  if (action === "APPROVED" && !reason?.trim()) {
    throw new AppError(
      "VALIDATION_FAILED",
      "A reason is required when approving on behalf of the customer",
      422,
    );
  }

  await processQuoteResponse({
    quoteId: quote.id,
    companyId: quote.companyId,
    jobId: quote.jobId,
    action,
    source: "STAFF",
    actorUserId: context.userId,
    reason,
    now,
  });

  return getQuote(context, quoteId);
}

/**
 * Phase 4.5 — ask-a-question on a quote. Posts a CUSTOMER message on the
 * linked service request (reusing the 3.4 conversation) without touching
 * the quote status, and notifies staff. Only meaningful for request-linked
 * quotes that are still open.
 */
export async function askQuoteQuestion(
  context: { companyId: string; customerId: string; sessionId?: string },
  quoteId: string,
  jobId: string | null,
  body: string,
) {
  const quote = await prisma.quote.findFirst({
    where: {
      id: quoteId,
      companyId: context.companyId,
      customerId: context.customerId,
      ...(jobId ? { jobId } : {}),
    },
    select: { id: true, status: true, serviceRequestId: true },
  });
  if (!quote) {
    throw new AppError("RESOURCE_NOT_FOUND", "Quote not found", 404);
  }
  if (!quote.serviceRequestId) {
    throw new AppError(
      "QUOTE_NOT_LINKED_TO_REQUEST",
      "This quote is not linked to a service request",
      422,
    );
  }
  if (quote.status !== "SENT" && quote.status !== "APPROVED") {
    throw new AppError(
      "QUOTE_ALREADY_RESOLVED",
      "Questions can only be asked on open quotes",
      409,
    );
  }
  const message = await prisma.serviceRequestMessage.create({
    data: {
      companyId: context.companyId,
      requestId: quote.serviceRequestId,
      authorType: "CUSTOMER",
      portalSessionId: context.sessionId ?? null,
      body: body.trim(),
    },
  });
  void notificationPublisher.publish({
    type: "REQUEST_INFO_PROVIDED",
    companyId: context.companyId,
    requestId: quote.serviceRequestId,
  });
  return jsonSafe(message);
}

export async function sweepExpiredQuotes(
  now = new Date(),
): Promise<{ expiredCount: number }> {
  // Capture the SENT quotes about to lapse so their requests can be
  // recomputed — a request returns to EXPIRED only when no other quote
  // is still SENT or APPROVED (Phase 4.5).
  const expiring = await prisma.quote.findMany({
    where: {
      status: "SENT",
      expiresAt: { lte: now },
      serviceRequestId: { not: null },
    },
    select: { companyId: true, serviceRequestId: true },
  });
  const result = await prisma.quote.updateMany({
    where: {
      status: { in: ["DRAFT", "SENT"] },
      expiresAt: { lte: now },
    },
    data: {
      status: "EXPIRED",
    },
  });
  const affected = new Map<string, { companyId: string; requestId: string }>();
  for (const quote of expiring) {
    if (quote.serviceRequestId) {
      affected.set(`${quote.companyId}:${quote.serviceRequestId}`, {
        companyId: quote.companyId,
        requestId: quote.serviceRequestId,
      });
    }
  }
  for (const target of affected.values()) {
    await prisma.$transaction((transaction) =>
      recomputeRequestStatusAfterQuoteEvent(transaction, {
        ...target,
        toStatus: "EXPIRED",
      }),
    );
  }
  return { expiredCount: result.count };
}
