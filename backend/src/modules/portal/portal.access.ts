import { AppError } from "../../common/errors.js";
import { prisma } from "../../db/prisma.js";
import type { PortalRequest } from "./portal.middleware.js";

type PortalContext = NonNullable<PortalRequest["portal"]>;

export function workspaceContext(request: PortalRequest): PortalContext {
  const context = request.portal;
  if (!context || context.scope !== "WORKSPACE") {
    throw new AppError("RESOURCE_NOT_FOUND", "Portal resource not found", 404);
  }
  return context;
}

export async function assertCanReadRequest(
  context: PortalContext,
  requestId: string,
) {
  const request = await prisma.serviceRequest.findFirst({
    where: {
      id: requestId,
      companyId: context.companyId,
      customerId: context.customerId,
    },
    select: { id: true },
  });
  if (!request) {
    throw new AppError("RESOURCE_NOT_FOUND", "Request not found", 404);
  }
}

export async function assertCanReadQuote(
  context: PortalContext,
  quoteId: string,
) {
  const quote = await prisma.quote.findFirst({
    where: {
      id: quoteId,
      companyId: context.companyId,
      customerId: context.customerId,
    },
    select: { id: true },
  });
  if (!quote) {
    throw new AppError("RESOURCE_NOT_FOUND", "Quote not found", 404);
  }
}

export async function assertCanReadJob(context: PortalContext, jobId: string) {
  const job = await prisma.job.findFirst({
    where: {
      id: jobId,
      companyId: context.companyId,
      customerId: context.customerId,
    },
    select: { id: true },
  });
  if (!job) {
    throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  }
}

export async function assertCanReadInvoice(
  context: PortalContext,
  invoiceId: string,
) {
  const invoice = await prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      companyId: context.companyId,
      customerId: context.customerId,
      status: { not: "DRAFT" },
    },
    select: { id: true },
  });
  if (!invoice) {
    throw new AppError("RESOURCE_NOT_FOUND", "Invoice not found", 404);
  }
}
