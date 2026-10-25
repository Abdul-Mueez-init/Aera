import { AppError } from "../../common/errors.js";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { getCompanyContacts } from "./portal.contacts.js";
import { createPortalSession, revokePortalSession } from "./portal.session.js";
import { hashToken } from "./portal.tokens.js";
import { closePortalIfDone } from "./portal.grants.js";
import { processQuoteResponse } from "../quotes/quote.service.js";

function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, nestedValue: unknown) =>
      typeof nestedValue === "bigint" ? nestedValue.toString() : nestedValue,
    ),
  ) as T;
}

/**
 * POST /api/v1/portal/exchange
 * Exchange a link token for a session.
 * Single-use, atomic burn.
 */
export async function exchangeToken(token: string, userAgent?: string) {
  const tokenHash = hashToken(token);

  // Find grant by hash
  const grant = await prisma.portalAccessGrant.findUnique({
    where: { linkTokenHash: tokenHash },
    include: {
      company: {
        select: {
          name: true,
          phone: true,
        },
      },
    },
  });

  if (!grant) {
    throw new AppError("PORTAL_LINK_INVALID", "Invalid portal link", 401);
  }

  // Check if deactivated
  if (grant.status === "DEACTIVATED") {
    const contacts = await getCompanyContacts(grant.companyId);
    throw new AppError(
      "PORTAL_ACCESS_DEACTIVATED",
      "Portal access has been deactivated",
      410,
      { state: "DEACTIVATED", ...contacts },
    );
  }

  // An archived customer must not be able to open a fresh session even
  // if a grant somehow remained ACTIVE (defence in depth alongside the
  // archive-time deactivation in archiveCustomer).
  const grantCustomer = await prisma.customer.findFirst({
    where: { id: grant.customerId, companyId: grant.companyId },
    select: { status: true },
  });
  if (!grantCustomer || grantCustomer.status !== "ACTIVE") {
    const contacts = await getCompanyContacts(grant.companyId);
    throw new AppError(
      "PORTAL_ACCESS_DEACTIVATED",
      "Portal access has been deactivated",
      410,
      { state: "DEACTIVATED", ...contacts },
    );
  }

  // Check if already used — the response carries the company contact
  // payload so the "already used" screen can show who to ask for a new link.
  if (grant.linkConsumedAt) {
    const contacts = await getCompanyContacts(grant.companyId);
    throw new AppError(
      "PORTAL_LINK_ALREADY_USED",
      "This link was already opened on another device — ask your service provider to send a new one",
      409,
      { state: "ALREADY_USED", ...contacts },
    );
  }

  // Check if expired
  if (grant.linkExpiresAt < new Date()) {
    const contacts = await getCompanyContacts(grant.companyId);
    throw new AppError("PORTAL_LINK_EXPIRED", "Portal link has expired", 410, {
      state: "DEACTIVATED",
      ...contacts,
    });
  }

  // Burn + session + audit commit in ONE transaction: if session creation
  // fails, the burn rolls back and the link stays usable. The guarded
  // updateMany is the single-use guarantee under concurrency — exactly one
  // concurrent exchange can win it.
  const now = new Date();
  const exchanged = await prisma.$transaction(async (tx) => {
    const burnResult = await tx.portalAccessGrant.updateMany({
      where: {
        id: grant.id,
        status: "ACTIVE",
        linkConsumedAt: null,
        linkExpiresAt: { gt: now },
      },
      data: { linkConsumedAt: now },
    });

    if (burnResult.count !== 1) {
      return null;
    }

    const { sessionToken } = await createPortalSession(grant.id, userAgent, tx);

    await tx.portalAuditEvent.create({
      data: {
        companyId: grant.companyId,
        jobId: grant.jobId,
        customerId: grant.customerId,
        grantId: grant.id,
        action: "PORTAL_LINK_EXCHANGED",
      },
    });

    return { sessionToken };
  });

  if (!exchanged) {
    // Lost the race - treat as already used
    const contacts = await getCompanyContacts(grant.companyId);
    throw new AppError(
      "PORTAL_LINK_ALREADY_USED",
      "This link was already opened on another device — ask your service provider to send a new one",
      409,
      { state: "ALREADY_USED", ...contacts },
    );
  }

  return { sessionToken: exchanged.sessionToken, grant };
}

/**
 * GET /api/v1/portal/session
 * Lightweight probe to check if session is active.
 */
export async function getPortalSession() {
  // This will be called by middleware which validates the session
  // The route handler just returns the session state
  return { state: "ACTIVE" };
}

/**
 * GET /api/v1/portal/job
 * Get job-scoped snapshot for the portal.
 */
export async function getPortalJob(
  companyId: string,
  customerId: string,
  jobId: string,
) {
  const job = await prisma.job.findFirst({
    where: { id: jobId, companyId, customerId },
    select: {
      id: true,
      jobNumber: true,
      serviceType: true,
      problemDescription: true,
      status: true,
      scheduledStart: true,
      scheduledEnd: true,
      completedAt: true,
      handshakeVersion: true,
      handshakeFailedAttempts: true,
      handshakeLockedUntil: true,
      handshakeVerifiedAt: true,
      serviceAddress: {
        select: {
          line1: true,
          line2: true,
          city: true,
          region: true,
          postalCode: true,
        },
      },
      assignedTechnician: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
      quotes: {
        where: {
          status: { in: ["SENT", "APPROVED", "DECLINED"] },
        },
        take: 20,
        orderBy: { createdAt: "desc" },
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
      },
      invoices: {
        where: { status: { not: "DRAFT" } },
        take: 10,
        orderBy: { createdAt: "desc" },
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
          items: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              description: true,
              quantity: true,
              totalMinor: true,
            },
          },
        },
      },
      reviews: {
        select: {
          id: true,
          rating: true,
          comment: true,
        },
      },
      company: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!job) {
    throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  }

  // Derive handshake code if EN_ROUTE and not verified
  let handshake: { code: string; technicianName: string } | null = null;
  if (
    job.status === "EN_ROUTE" &&
    !job.handshakeVerifiedAt &&
    job.assignedTechnician
  ) {
    // Derive code from handshakeVersion
    const { deriveHandshakeCode } = await import("./portal.tokens.js");
    const code = deriveHandshakeCode(
      env.PORTAL_CODE_SECRET ?? "",
      companyId,
      jobId,
      job.handshakeVersion,
    );
    handshake = {
      code,
      technicianName: `${job.assignedTechnician.firstName} ${job.assignedTechnician.lastName.charAt(0)}.`,
    };
  }

  return jsonSafe({
    job: {
      jobNumber: job.jobNumber,
      serviceType: job.serviceType,
      problemDescription: job.problemDescription,
      status: job.status,
      scheduledStart: job.scheduledStart,
      scheduledEnd: job.scheduledEnd,
      completedAt: job.completedAt,
      address: job.serviceAddress,
      // Privacy: the customer sees first name + last initial only,
      // never the technician's full surname.
      technician: job.assignedTechnician
        ? {
            firstName: job.assignedTechnician.firstName,
            lastInitial: job.assignedTechnician.lastName.charAt(0),
          }
        : null,
      handshake,
    },
    quotes: job.quotes,
    invoices: job.invoices,
    review: job.reviews?.[0] || null,
    company: { name: job.company.name },
  });
}

/**
 * POST /api/v1/portal/quotes/:quoteId/respond
 * Respond to a quote (approve/decline).
 */
export async function respondToQuote(
  companyId: string,
  customerId: string,
  jobId: string,
  quoteId: string,
  action: "APPROVED" | "DECLINED",
) {
  // Verify quote belongs to the session's job and company
  const quote = await prisma.quote.findFirst({
    where: {
      id: quoteId,
      companyId,
      jobId,
      customerId,
    },
    select: {
      id: true,
      status: true,
      expiresAt: true,
    },
  });

  if (!quote) {
    throw new AppError("RESOURCE_NOT_FOUND", "Quote not found", 404);
  }

  // Idempotent repeat of the same decision (handoff 5.5: the portal
  // respond reuses the shared approval domain logic).
  if (quote.status === action) {
    return { id: quote.id, status: quote.status };
  }

  if (quote.status === "APPROVED" || quote.status === "DECLINED") {
    throw new AppError(
      "QUOTE_ALREADY_DECIDED",
      "This quote has already been decided",
      409,
    );
  }

  // Expiry is enforced exactly like the staff respond path: lazily
  // transition to EXPIRED and reject with 410 QUOTE_EXPIRED.
  const now = new Date();
  const isPastExpiry =
    quote.expiresAt !== null && quote.expiresAt.getTime() <= now.getTime();
  if (quote.status === "EXPIRED" || isPastExpiry) {
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
      "QUOTE_ALREADY_DECIDED",
      "This quote has already been decided",
      409,
    );
  }

  // Shared domain logic: guarded transition, QuoteApprovalEvent with
  // source CUSTOMER, and linked-job advancement on approval.
  await processQuoteResponse({
    quoteId,
    companyId,
    jobId,
    action,
    source: "CUSTOMER",
    now,
  });

  await prisma.portalAuditEvent.create({
    data: {
      companyId,
      jobId,
      customerId,
      action: "PORTAL_QUOTE_RESPONDED",
      metadata: { quoteId, decision: action },
    },
  });

  return { id: quote.id, status: action };
}

/**
 * POST /api/v1/portal/reviews
 * Submit a customer review.
 */
export async function submitReview(
  companyId: string,
  customerId: string,
  jobId: string,
  rating: number,
  comment?: string,
) {
  // Verify job belongs to session and is COMPLETED
  const job = await prisma.job.findFirst({
    where: { id: jobId, companyId, customerId, status: "COMPLETED" },
    select: { id: true },
  });

  if (!job) {
    throw new AppError(
      "REVIEW_JOB_NOT_ELIGIBLE",
      "Completed service job not found",
      422,
    );
  }

  try {
    const review = await prisma.customerReview.create({
      data: {
        companyId,
        customerId,
        jobId,
        rating,
        comment: comment?.trim() || undefined,
      },
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
      },
    });

    await prisma.portalAuditEvent.create({
      data: {
        companyId,
        jobId,
        customerId,
        action: "PORTAL_REVIEW_SUBMITTED",
        metadata: { reviewId: review.id, rating },
      },
    });

    // Close portal if job is done (completed + paid + reviewed)
    await closePortalIfDone(jobId);

    return review;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      throw new AppError(
        "REVIEW_ALREADY_SUBMITTED",
        "This service job already has a review",
        409,
      );
    }
    throw error;
  }
}

/**
 * POST /api/v1/portal/logout
 * Revoke the current session.
 */
export async function portalLogout(sessionId: string) {
  await revokePortalSession(sessionId);
}
