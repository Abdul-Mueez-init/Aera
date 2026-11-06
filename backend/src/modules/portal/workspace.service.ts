import { AppError } from "../../common/errors.js";
import { prisma } from "../../db/prisma.js";
import type { PortalRequest } from "./portal.middleware.js";
import {
  assertCanReadInvoice,
  assertCanReadJob,
  assertCanReadQuote,
  assertCanReadRequest,
} from "./portal.access.js";
import type { QuoteStatus } from "../../generated/prisma/index.js";
import { createCheckoutSession } from "../payments/payment-session.service.js";

type WorkspaceContext = NonNullable<PortalRequest["portal"]>;

function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, nestedValue: unknown) =>
      typeof nestedValue === "bigint" ? nestedValue.toString() : nestedValue,
    ),
  ) as T;
}

function pageArgs(page: number, pageSize: number) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

function pageMeta(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, pageCount: Math.ceil(total / pageSize) };
}

export async function getWorkspaceMe(context: WorkspaceContext) {
  const [customer, company] = await prisma.$transaction([
    prisma.customer.findFirst({
      where: { id: context.customerId, companyId: context.companyId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        serviceAddresses: {
          where: { companyId: context.companyId },
          select: {
            id: true,
            label: true,
            line1: true,
            city: true,
            region: true,
            postalCode: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.company.findFirst({
      where: { id: context.companyId },
      select: { id: true, name: true, phone: true, defaultCurrency: true },
    }),
  ]);
  if (!customer || !company) {
    throw new AppError("RESOURCE_NOT_FOUND", "Workspace not found", 404);
  }
  return {
    customer,
    company,
    scope: context.scope,
    expiresAt: context.expiresAt,
  };
}

export async function listWorkspaceRequests(
  context: WorkspaceContext,
  page: number,
  pageSize: number,
) {
  const where = {
    companyId: context.companyId,
    customerId: context.customerId,
  };
  const [items, total] = await prisma.$transaction([
    prisma.serviceRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...pageArgs(page, pageSize),
      select: {
        id: true,
        requestNumber: true,
        title: true,
        description: true,
        serviceCategory: true,
        priority: true,
        status: true,
        requiresInspection: true,
        source: true,
        preferredWindows: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.serviceRequest.count({ where }),
  ]);
  return jsonSafe({ items, meta: pageMeta(page, pageSize, total) });
}

export async function getWorkspaceRequest(
  context: WorkspaceContext,
  requestId: string,
) {
  await assertCanReadRequest(context, requestId);
  const request = await prisma.serviceRequest.findFirst({
    where: {
      id: requestId,
      companyId: context.companyId,
      customerId: context.customerId,
    },
    select: {
      id: true,
      requestNumber: true,
      title: true,
      description: true,
      serviceCategory: true,
      priority: true,
      status: true,
      requiresInspection: true,
      source: true,
      preferredWindows: true,
      createdAt: true,
      updatedAt: true,
      serviceAddress: {
        select: {
          label: true,
          line1: true,
          line2: true,
          city: true,
          region: true,
          postalCode: true,
        },
      },
      quotes: {
        where: { status: { in: ["SENT", "APPROVED", "DECLINED"] } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          kind: true,
          status: true,
          totalMinor: true,
          currency: true,
          assumptions: true,
          exclusions: true,
          expiresAt: true,
        },
      },
      attachments: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          mimeType: true,
          kind: true,
          sizeBytes: true,
          caption: true,
          createdAt: true,
        },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        take: 200,
        select: {
          id: true,
          authorType: true,
          body: true,
          createdAt: true,
          authorUser: { select: { firstName: true, lastName: true } },
        },
      },
      appointmentProposals: {
        where: { status: { in: ["OPEN", "PICKED"] } },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          windows: true,
          pickedWindow: true,
          status: true,
          expiresAt: true,
          pickedAt: true,
          quoteId: true,
          jobId: true,
        },
      },
    },
  });
  if (!request)
    throw new AppError("RESOURCE_NOT_FOUND", "Request not found", 404);
  return jsonSafe(request);
}

export async function listWorkspaceQuotes(
  context: WorkspaceContext,
  page: number,
  pageSize: number,
) {
  const where = {
    companyId: context.companyId,
    customerId: context.customerId,
    status: { in: ["SENT", "APPROVED", "DECLINED"] as QuoteStatus[] },
  };
  const [items, total] = await prisma.$transaction([
    prisma.quote.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...pageArgs(page, pageSize),
      select: {
        id: true,
        serviceRequestId: true,
        jobId: true,
        kind: true,
        status: true,
        subtotalMinor: true,
        discountMinor: true,
        taxMinor: true,
        totalMinor: true,
        currency: true,
        expiresAt: true,
        sentAt: true,
        approvedAt: true,
      },
    }),
    prisma.quote.count({ where }),
  ]);
  return jsonSafe({ items, meta: pageMeta(page, pageSize, total) });
}

export async function getWorkspaceQuote(
  context: WorkspaceContext,
  quoteId: string,
) {
  await assertCanReadQuote(context, quoteId);
  const quote = await prisma.quote.findFirst({
    where: {
      id: quoteId,
      companyId: context.companyId,
      customerId: context.customerId,
      status: { in: ["SENT", "APPROVED", "DECLINED"] },
    },
    select: {
      id: true,
      serviceRequestId: true,
      jobId: true,
      kind: true,
      status: true,
      subtotalMinor: true,
      discountMinor: true,
      taxMinor: true,
      totalMinor: true,
      currency: true,
      expiresAt: true,
      sentAt: true,
      approvedAt: true,
      items: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          description: true,
          quantity: true,
          unitPriceMinor: true,
          totalMinor: true,
        },
      },
    },
  });
  if (!quote) throw new AppError("RESOURCE_NOT_FOUND", "Quote not found", 404);
  return jsonSafe(quote);
}

export async function listWorkspaceJobs(
  context: WorkspaceContext,
  page: number,
  pageSize: number,
) {
  const where = {
    companyId: context.companyId,
    customerId: context.customerId,
  };
  const [items, total] = await prisma.$transaction([
    prisma.job.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...pageArgs(page, pageSize),
      select: {
        id: true,
        jobNumber: true,
        type: true,
        serviceType: true,
        problemDescription: true,
        status: true,
        scheduledStart: true,
        scheduledEnd: true,
        completedAt: true,
        completionSummary: true,
        handshakeVerifiedAt: true,
        reviewState: true,
        findings: {
          where: { customerVisible: true },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            summary: true,
            recommendedWork: true,
            equipmentInfo: true,
            likelyParts: true,
            estimatedLaborMinutes: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.job.count({ where }),
  ]);
  return jsonSafe({
    items: items.map((item) => ({
      ...item,
      arrivedVerifiedAt: item.handshakeVerifiedAt,
    })),
    meta: pageMeta(page, pageSize, total),
  });
}

export async function getWorkspaceJob(
  context: WorkspaceContext,
  jobId: string,
) {
  await assertCanReadJob(context, jobId);
  const job = await prisma.job.findFirst({
    where: {
      id: jobId,
      companyId: context.companyId,
      customerId: context.customerId,
    },
    select: {
      id: true,
      jobNumber: true,
      type: true,
      serviceType: true,
      problemDescription: true,
      status: true,
      scheduledStart: true,
      scheduledEnd: true,
      completedAt: true,
      completionSummary: true,
      handshakeVerifiedAt: true,
      reviewState: true,
      findings: {
        where: { customerVisible: true },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          summary: true,
          recommendedWork: true,
          equipmentInfo: true,
          likelyParts: true,
          estimatedLaborMinutes: true,
          createdAt: true,
        },
      },
      serviceAddress: {
        select: {
          label: true,
          line1: true,
          line2: true,
          city: true,
          region: true,
          postalCode: true,
        },
      },
      assignedTechnician: { select: { firstName: true, lastName: true } },
      appointmentProposals: {
        where: { status: { in: ["OPEN", "PICKED"] } },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: {
          id: true,
          windows: true,
          pickedWindow: true,
          status: true,
          expiresAt: true,
          pickedAt: true,
        },
      },
      reviews: {
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
        },
        take: 1,
      },
    },
  });
  if (!job) throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  return jsonSafe({
    ...job,
    arrivedVerifiedAt: job.handshakeVerifiedAt,
  });
}

export async function listWorkspaceInvoices(
  context: WorkspaceContext,
  page: number,
  pageSize: number,
) {
  const where = {
    companyId: context.companyId,
    customerId: context.customerId,
    status: { not: "DRAFT" as const },
  };
  const [items, total] = await prisma.$transaction([
    prisma.invoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...pageArgs(page, pageSize),
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        totalMinor: true,
        amountPaidMinor: true,
        balanceDueMinor: true,
        currency: true,
        issuedAt: true,
        dueAt: true,
      },
    }),
    prisma.invoice.count({ where }),
  ]);
  return jsonSafe({ items, meta: pageMeta(page, pageSize, total) });
}

export async function getWorkspaceInvoice(
  context: WorkspaceContext,
  invoiceId: string,
) {
  await assertCanReadInvoice(context, invoiceId);
  const invoice = await prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      companyId: context.companyId,
      customerId: context.customerId,
      status: { not: "DRAFT" },
    },
    select: {
      id: true,
      invoiceNumber: true,
      kind: true,
      status: true,
      totalMinor: true,
      amountPaidMinor: true,
      balanceDueMinor: true,
      currency: true,
      issuedAt: true,
      dueAt: true,
      paidAt: true,
      items: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          description: true,
          quantity: true,
          totalMinor: true,
        },
      },
      // Credits applied TO this invoice (e.g. a deposit invoice covering
      // part of this one). Whitelisted: only the source invoice number,
      // the applied amount and when it was applied.
      creditTargets: {
        orderBy: { createdAt: "asc" },
        select: {
          amountMinor: true,
          createdAt: true,
          sourceInvoice: { select: { invoiceNumber: true } },
        },
      },
      // Phase 7.3 — payments the customer made against this invoice.
      payments: {
        orderBy: { receivedAt: "desc" },
        select: {
          id: true,
          amountMinor: true,
          currency: true,
          method: true,
          provider: true,
          receivedAt: true,
        },
      },
      // Phase 7.3 — checkout sessions so the client can show
      // pending/failed/expired payment states without trusting redirects.
      paymentSessions: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          status: true,
          amountMinor: true,
          currency: true,
          expiresAt: true,
          createdAt: true,
        },
      },
      disputes: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          reason: true,
          status: true,
          resolution: true,
          resolutionNote: true,
          createdAt: true,
          resolvedAt: true,
        },
      },
    },
  });
  if (!invoice)
    throw new AppError("RESOURCE_NOT_FOUND", "Invoice not found", 404);
  return jsonSafe(invoice);
}

/**
 * Phase 7.3 — start (or idempotently replay) an online checkout session
 * for this invoice's outstanding balance.
 */
export async function payWorkspaceInvoice(
  context: WorkspaceContext,
  invoiceId: string,
  idempotencyKey: string,
) {
  await assertCanReadInvoice(context, invoiceId);
  const invoice = await prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      companyId: context.companyId,
      customerId: context.customerId,
      status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
    },
    select: { id: true, balanceDueMinor: true },
  });
  if (!invoice || invoice.balanceDueMinor <= 0n) {
    throw new AppError("INVOICE_NOT_PAYABLE", "Invoice is not payable", 409);
  }
  const session = await createCheckoutSession({
    companyId: context.companyId,
    invoiceId,
    portalSessionId: context.sessionId,
    idempotencyKey,
  });
  return jsonSafe({
    sessionId: session.id,
    checkoutUrl: session.checkoutUrl,
    amountMinor: session.amountMinor,
    currency: session.currency,
    status: session.status,
    expiresAt: session.expiresAt,
  });
}

/** Phase 7.3 — customer's payment history across their invoices. */
export async function listWorkspacePayments(
  context: WorkspaceContext,
  page: number,
  pageSize: number,
) {
  const where = {
    companyId: context.companyId,
    invoice: {
      customerId: context.customerId,
      status: { not: "DRAFT" as const },
    },
  };
  const [items, total] = await prisma.$transaction([
    prisma.payment.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      ...pageArgs(page, pageSize),
      select: {
        id: true,
        invoiceId: true,
        amountMinor: true,
        currency: true,
        method: true,
        provider: true,
        reference: true,
        receivedAt: true,
        invoice: { select: { invoiceNumber: true, kind: true } },
      },
    }),
    prisma.payment.count({ where }),
  ]);
  return jsonSafe({ items, meta: pageMeta(page, pageSize, total) });
}

/** Phase 7.3 — receipt for a single payment. */
export async function getWorkspacePaymentReceipt(
  context: WorkspaceContext,
  paymentId: string,
) {
  const payment = await prisma.payment.findFirst({
    where: {
      id: paymentId,
      companyId: context.companyId,
      invoice: { customerId: context.customerId },
    },
    select: {
      id: true,
      invoiceId: true,
      amountMinor: true,
      currency: true,
      method: true,
      provider: true,
      providerPaymentId: true,
      reference: true,
      receivedAt: true,
      invoice: {
        select: {
          invoiceNumber: true,
          kind: true,
          totalMinor: true,
          company: { select: { name: true } },
        },
      },
    },
  });
  if (!payment) {
    throw new AppError("RESOURCE_NOT_FOUND", "Payment not found", 404);
  }
  await assertCanReadInvoice(context, payment.invoiceId);
  return jsonSafe(payment);
}
