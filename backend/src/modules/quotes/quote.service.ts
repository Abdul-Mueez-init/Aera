import { AppError } from "../../common/errors.js";
import type { AuthContext } from "../../common/auth/auth.types.js";
import { prisma } from "../../db/prisma.js";
import { env } from "../../config/env.js";
import { getNextJobNumber } from "../../common/counters/counter.service.js";
import { assertRequestTransition } from "../requests/request.state.js";
import { notificationPublisher } from "../notifications/notification.port.js";
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
  kind?: "INSPECTION" | "REPAIR" | "INSTALLATION" | "CHANGE_ORDER" | "GENERAL";
  currency: string;
  discountMinor?: number;
  taxRateBps?: number;
  expiresAt?: Date;
  assumptions?: string;
  exclusions?: string;
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

export function computeQuoteTotals(input: Pick<CreateQuoteInput, "items" | "discountMinor" | "taxRateBps">) {
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
      throw new AppError("QUOTE_INVALID_REQUEST", "Service request not found", 422);
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

  const quote = await prisma.$transaction(async (transaction) => {
    return transaction.quote.create({
      data: {
        companyId: context.companyId,
        customerId: input.customerId,
        jobId: input.jobId,
        serviceRequestId: input.serviceRequestId,
        kind: input.kind ?? "GENERAL",
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
    throw new AppError("QUOTE_NOT_EDITABLE", "Only draft quotes can be edited", 409);
  }
  const totals = computeQuoteTotals(input);
  assertTotals(totals);
  const updated = await prisma.$transaction(async (transaction) => {
    await transaction.quoteItem.deleteMany({ where: { quoteId, companyId: context.companyId } });
    return transaction.quote.update({
      where: { id: quoteId },
      data: {
        currency: input.currency.toUpperCase(),
        kind: input.kind ?? "GENERAL",
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
            totalMinor: calculateLineItemTotal(BigInt(item.unitPriceMinor), item.quantity),
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
  if (!original) throw new AppError("RESOURCE_NOT_FOUND", "Quote not found", 404);
  if (!["SENT", "APPROVED", "DECLINED", "EXPIRED"].includes(original.status)) {
    throw new AppError("QUOTE_NOT_REVISIONABLE", "Quote cannot be revised in its current state", 409);
  }
  const revision = await prisma.quote.create({
    data: {
      companyId: context.companyId,
      customerId: original.customerId,
      jobId: original.jobId,
      serviceRequestId: original.serviceRequestId,
      kind: original.kind,
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
    const updated = await transaction.quote.update({
      where: { id: quoteId },
      data: {
        status: "SENT",
        sentAt: new Date(),
        declinedAt: null,
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
  now?: Date;
  portalSessionId?: string;
  userAgentHash?: string;
}

/**
 * Shared quote-decision domain logic (handoff 5.5): transition-guarded
 * status update, QuoteApprovalEvent, and linked-job advancement on
 * approval. Used by the staff respond command and the customer portal
 * respond so both surfaces enforce identical expiry/idempotency rules.
 */
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
            },
          });
        }

        if (quote.kind !== "CHANGE_ORDER") {
          const type =
            quote.kind === "INSPECTION"
              ? "DIAGNOSTIC"
              : quote.kind === "REPAIR"
                ? "REPAIR"
                : quote.kind === "INSTALLATION"
                  ? "INSTALLATION"
                  : "OTHER";
          const jobNumber = await getNextJobNumber(companyId, transaction);
          const createdJob = await transaction.job.create({
            data: {
              companyId,
              customerId: request.customerId,
              serviceAddressId: request.serviceAddressId,
              serviceRequestId: request.id,
              sourceQuoteId: quoteId,
              jobNumber,
              type,
              serviceType: request.serviceCategory,
              problemDescription: request.description,
              priority: request.priority,
            },
          });
          const historyActorId =
            actorUserId ??
            (
              await transaction.companyMember.findFirst({
                where: { companyId, role: "OWNER", status: "ACTIVE" },
                select: { userId: true },
              })
            )?.userId;
          if (historyActorId) {
            await transaction.jobStatusHistory.create({
              data: {
                companyId,
                jobId: createdJob.id,
                actorUserId: historyActorId,
                toStatus: "NEW",
                reason: "Created from accepted quote",
              },
            });
          }
        }
      }
    }
    if (action === "DECLINED" && quote.serviceRequestId) {
      const openQuote = await transaction.quote.findFirst({
        where: {
          serviceRequestId: quote.serviceRequestId,
          companyId,
          id: { not: quoteId },
          status: { in: ["SENT", "APPROVED"] },
        },
        select: { id: true },
      });
      if (!openQuote) {
        const request = await transaction.serviceRequest.findFirstOrThrow({
          where: { id: quote.serviceRequestId, companyId },
          select: { status: true },
        });
        if (request.status === "QUOTED") {
          await transaction.serviceRequest.update({
            where: { id: quote.serviceRequestId },
            data: { status: "DECLINED" },
          });
          await transaction.serviceRequestEvent.create({
            data: {
              companyId,
              requestId: quote.serviceRequestId,
              actorUserId: actorUserId ?? null,
              type: "STATUS_CHANGED",
              fromStatus: "QUOTED",
              toStatus: "DECLINED",
            },
          });
        }
      }
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

  await processQuoteResponse({
    quoteId: quote.id,
    companyId: quote.companyId,
    jobId: quote.jobId,
    action,
    source: "STAFF",
    actorUserId: context.userId,
    now,
  });

  return getQuote(context, quoteId);
}

export async function sweepExpiredQuotes(
  now = new Date(),
): Promise<{ expiredCount: number }> {
  const result = await prisma.quote.updateMany({
    where: {
      status: { in: ["DRAFT", "SENT"] },
      expiresAt: { lte: now },
    },
    data: {
      status: "EXPIRED",
    },
  });
  return { expiredCount: result.count };
}
