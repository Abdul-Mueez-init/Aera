import { AppError } from "../../common/errors.js";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import type { PortalRequest } from "./portal.middleware.js";

type PortalContext = NonNullable<PortalRequest["portal"]>;

/**
 * JOB-scope sessions are pinned to exactly one job: every resource read
 * must additionally satisfy the job linkage or the session could reach a
 * sibling job/quote/invoice of the same customer (IDOR within tenant).
 * WORKSPACE sessions see the whole customer and return null (no filter).
 */
function jobScopeJobIds(context: PortalContext): string[] | null {
  // JOB scope with a null jobId (impossible per the CHECK constraint, but
  // defence in depth) must deny everything: an empty `in` list matches
  // no rows rather than falling back to unfiltered access.
  if (context.scope !== "JOB") return null;
  return context.jobId ? [context.jobId] : [];
}

export function workspaceContext(request: PortalRequest): PortalContext {
  // Phase 2 ships dark behind WORKSPACE_PORTAL_ENABLED: with the flag off
  // the workspace surface is indistinguishable from an unknown route.
  if (!env.WORKSPACE_PORTAL_ENABLED) {
    throw new AppError("RESOURCE_NOT_FOUND", "Portal resource not found", 404);
  }
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
  const jobIds = jobScopeJobIds(context);
  const request = await prisma.serviceRequest.findFirst({
    where: {
      id: requestId,
      companyId: context.companyId,
      customerId: context.customerId,
      // JOB scope: only the request that produced this job.
      ...(jobIds ? { jobs: { some: { id: { in: jobIds } } } } : {}),
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
  const jobIds = jobScopeJobIds(context);
  const quote = await prisma.quote.findFirst({
    where: {
      id: quoteId,
      companyId: context.companyId,
      customerId: context.customerId,
      // JOB scope: quotes on the job itself, its basis job, or the request
      // that produced the job.
      ...(jobIds
        ? {
            OR: [
              { jobId: { in: jobIds } },
              { basisJobId: { in: jobIds } },
              { serviceRequest: { jobs: { some: { id: { in: jobIds } } } } },
            ],
          }
        : {}),
    },
    select: { id: true },
  });
  if (!quote) {
    throw new AppError("RESOURCE_NOT_FOUND", "Quote not found", 404);
  }
}

export async function assertCanReadJob(context: PortalContext, jobId: string) {
  const jobIds = jobScopeJobIds(context);
  const job = await prisma.job.findFirst({
    where: {
      id: jobId,
      companyId: context.companyId,
      customerId: context.customerId,
      // JOB scope: the session may only ever touch its own job.
      ...(jobIds ? { id: { in: jobIds } } : {}),
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
  const jobIds = jobScopeJobIds(context);
  const invoice = await prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      companyId: context.companyId,
      customerId: context.customerId,
      status: { not: "DRAFT" },
      // JOB scope: invoices on the job or on its source request.
      ...(jobIds
        ? {
            OR: [
              { jobId: { in: jobIds } },
              { serviceRequest: { jobs: { some: { id: { in: jobIds } } } } },
            ],
          }
        : {}),
    },
    select: { id: true },
  });
  if (!invoice) {
    throw new AppError("RESOURCE_NOT_FOUND", "Invoice not found", 404);
  }
}
