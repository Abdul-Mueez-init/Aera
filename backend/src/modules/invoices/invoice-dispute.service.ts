import { prisma } from "../../db/prisma.js";
import { AppError } from "../../common/errors.js";
import type { AuthContext } from "../../common/auth/auth.types.js";
import { notificationPublisher } from "../notifications/notification.port.js";

/** Minimal portal-session shape needed for customer-scoped disputes. */
export interface DisputePortalContext {
  companyId: string;
  customerId: string;
}

/**
 * Phase 7.6 — invoice disputes.
 *
 * A dispute is an audit trail, never a state change: it must not alter
 * invoice status, balance or payment state. While a dispute is OPEN or
 * UNDER_REVIEW the reminder sweep suppresses reminders for that invoice.
 * Monetary corrections happen through credits or void-and-reissue, which
 * the resolver records as the resolution.
 */

const OPEN_STATUSES = ["OPEN", "UNDER_REVIEW"] as const;

export async function createPortalDispute(
  context: DisputePortalContext,
  invoiceId: string,
  input: {
    reason: "INCORRECT_AMOUNT" | "DUPLICATE_CHARGE" | "SERVICE_NOT_RENDERED" | "GOODS_NOT_RECEIVED" | "OTHER";
    message: string;
  },
) {
  const invoice = await prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      companyId: context.companyId,
      customerId: context.customerId,
      status: { not: "DRAFT" },
    },
    select: { id: true, invoiceNumber: true },
  });
  if (!invoice) {
    throw new AppError("RESOURCE_NOT_FOUND", "Invoice not found", 404);
  }

  const existing = await prisma.invoiceDispute.findFirst({
    where: {
      invoiceId,
      companyId: context.companyId,
      status: { in: [...OPEN_STATUSES] },
    },
    select: { id: true },
  });
  if (existing) {
    throw new AppError(
      "DISPUTE_ALREADY_OPEN",
      "An open dispute already exists for this invoice",
      409,
    );
  }

  const dispute = await prisma.$transaction(async (tx) => {
    const created = await tx.invoiceDispute.create({
      data: {
        companyId: context.companyId,
        invoiceId,
        customerId: context.customerId,
        reason: input.reason,
        message: input.message.trim(),
        status: "OPEN",
      },
    });
    await tx.invoiceDisputeEvent.create({
      data: {
        companyId: context.companyId,
        disputeId: created.id,
        type: "CREATED",
        toStatus: "OPEN",
        note: input.message.trim(),
      },
    });
    return created;
  });

  void notificationPublisher.publish({
    type: "INVOICE_DISPUTE_OPENED",
    companyId: context.companyId,
    invoiceId,
    disputeId: dispute.id,
  });
  return dispute;
}

export async function listDisputes(
  context: AuthContext,
  status?: "OPEN" | "UNDER_REVIEW" | "RESOLVED",
  page = 1,
  pageSize = 20,
) {
  const where = {
    companyId: context.companyId,
    ...(status ? { status } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.invoiceDispute.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        invoiceId: true,
        customerId: true,
        reason: true,
        message: true,
        status: true,
        resolution: true,
        resolutionNote: true,
        resolvedAt: true,
        createdAt: true,
        invoice: { select: { invoiceNumber: true, totalMinor: true, currency: true } },
        customer: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.invoiceDispute.count({ where }),
  ]);
  return {
    items: JSON.parse(
      JSON.stringify(items, (_k, v: unknown) =>
        typeof v === "bigint" ? v.toString() : v,
      ),
    ),
    meta: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
  };
}

async function getDisputeOrThrow(context: AuthContext, disputeId: string) {
  const dispute = await prisma.invoiceDispute.findFirst({
    where: { id: disputeId, companyId: context.companyId },
    select: { id: true, status: true, invoiceId: true },
  });
  if (!dispute) {
    throw new AppError("RESOURCE_NOT_FOUND", "Dispute not found", 404);
  }
  return dispute;
}

export async function markDisputeUnderReview(
  context: AuthContext,
  disputeId: string,
) {
  const dispute = await getDisputeOrThrow(context, disputeId);
  if (dispute.status !== "OPEN") {
    throw new AppError(
      "DISPUTE_NOT_OPEN",
      "Only open disputes can be moved to review",
      409,
    );
  }
  return prisma.$transaction(async (tx) => {
    await tx.invoiceDispute.update({
      where: { id: dispute.id },
      data: { status: "UNDER_REVIEW" },
    });
    await tx.invoiceDisputeEvent.create({
      data: {
        companyId: context.companyId,
        disputeId: dispute.id,
        actorUserId: context.userId,
        type: "STATUS_CHANGED",
        fromStatus: "OPEN",
        toStatus: "UNDER_REVIEW",
      },
    });
    return tx.invoiceDispute.findUniqueOrThrow({ where: { id: dispute.id } });
  });
}

export async function resolveDispute(
  context: AuthContext,
  disputeId: string,
  input: {
    resolution: "UPHELD" | "ADJUSTED" | "REFUNDED";
    note: string;
  },
) {
  const dispute = await getDisputeOrThrow(context, disputeId);
  if (dispute.status === "RESOLVED") {
    throw new AppError("DISPUTE_ALREADY_RESOLVED", "Dispute is already resolved", 409);
  }
  const fromStatus = dispute.status;
  const resolved = await prisma.$transaction(async (tx) => {
    await tx.invoiceDispute.update({
      where: { id: dispute.id },
      data: {
        status: "RESOLVED",
        resolution: input.resolution,
        resolutionNote: input.note.trim(),
        resolvedBy: context.userId,
        resolvedAt: new Date(),
      },
    });
    await tx.invoiceDisputeEvent.create({
      data: {
        companyId: context.companyId,
        disputeId: dispute.id,
        actorUserId: context.userId,
        type: "RESOLVED",
        fromStatus,
        toStatus: "RESOLVED",
        note: `${input.resolution}: ${input.note.trim()}`,
      },
    });
    return tx.invoiceDispute.findUniqueOrThrow({ where: { id: dispute.id } });
  });

  void notificationPublisher.publish({
    type: "INVOICE_DISPUTE_RESOLVED",
    companyId: context.companyId,
    invoiceId: dispute.invoiceId,
    disputeId: dispute.id,
  });
  return resolved;
}

export async function listInvoiceDisputes(
  context: { companyId: string },
  invoiceId: string,
) {
  return prisma.invoiceDispute.findMany({
    where: { invoiceId, companyId: context.companyId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      reason: true,
      message: true,
      status: true,
      resolution: true,
      resolutionNote: true,
      resolvedAt: true,
      createdAt: true,
      events: {
        orderBy: { createdAt: "asc" },
        select: { type: true, toStatus: true, note: true, createdAt: true },
      },
    },
  });
}
