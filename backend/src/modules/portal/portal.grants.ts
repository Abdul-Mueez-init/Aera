import { env } from "../../config/env.js";
import { AppError } from "../../common/errors.js";
import type { AuthContext } from "../../common/auth/auth.types.js";
import { prisma } from "../../db/prisma.js";
import { generateToken, hashToken } from "./portal.tokens.js";

/**
 * Issue a new portal access grant for a job.
 * Returns the grant and the plaintext link token (only once).
 */
export async function issueGrant(
  context: AuthContext,
  jobId: string,
) {
  // Verify job belongs to caller's company
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { companyId: true, customerId: true },
  });

  if (!job) {
    throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  }

  if (job.companyId !== context.companyId) {
    throw new AppError("TENANT_ACCESS_DENIED", "Access denied", 403);
  }

  // Check if an ACTIVE grant already exists
  const existingGrant = await prisma.portalAccessGrant.findFirst({
    where: {
      jobId,
      status: "ACTIVE",
    },
  });

  if (existingGrant) {
    throw new AppError(
      "PORTAL_ACCESS_ALREADY_ACTIVE",
      "Portal access is already active for this job",
      409,
    );
  }

  // Abuse limit: max 5 issuances per job per hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentGrants = await prisma.portalAccessGrant.count({
    where: {
      jobId,
      createdAt: { gte: oneHourAgo },
    },
  });

  if (recentGrants >= 5) {
    throw new AppError("RATE_LIMITED", "Too many portal access issuances", 429);
  }

  // Generate grant
  const linkToken = generateToken();
  const linkTokenHash = hashToken(linkToken);
  const linkExpiresAt = new Date(
    Date.now() + env.PORTAL_LINK_UNUSED_TTL_HOURS * 60 * 60 * 1000,
  );

  let grant: { id: string; linkExpiresAt: Date };
  try {
    grant = await prisma.portalAccessGrant.create({
      data: {
        companyId: context.companyId,
        customerId: job.customerId,
        jobId,
        issuedBy: context.userId,
        linkTokenHash,
        linkExpiresAt,
        status: "ACTIVE",
      },
      select: {
        id: true,
        linkExpiresAt: true,
      },
    });
  } catch (error) {
    // Lost a concurrent-issue race: the partial unique index
    // (one ACTIVE grant per job) fired after the check above.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
    ) {
      throw new AppError(
        "PORTAL_ACCESS_ALREADY_ACTIVE",
        "Portal access is already active for this job",
        409,
      );
    }
    throw error;
  }

  // Audit the issuance
  await prisma.portalAuditEvent.create({
    data: {
      companyId: context.companyId,
      jobId,
      customerId: job.customerId,
      grantId: grant.id,
      actorUserId: context.userId,
      action: "PORTAL_LINK_ISSUED",
    },
  });

  // Build link
  const link = `${env.PORTAL_PUBLIC_BASE_URL}/open#t=${linkToken}`;

  return { grant, link };
}

/**
 * Reissue a portal access grant (deactivate old, create new).
 * Works on COMPLETED jobs for "reactivation".
 */
export async function reissueGrant(
  context: AuthContext,
  jobId: string,
) {
  // Verify job belongs to caller's company
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { companyId: true, customerId: true },
  });

  if (!job) {
    throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  }

  if (job.companyId !== context.companyId) {
    throw new AppError("TENANT_ACCESS_DENIED", "Access denied", 403);
  }

  // Transaction: deactivate current ACTIVE grant + revoke sessions + create new grant
  const result = await prisma.$transaction(async (tx) => {
    // Find current ACTIVE grant
    const currentGrant = await tx.portalAccessGrant.findFirst({
      where: { jobId, status: "ACTIVE" },
    });

    if (currentGrant) {
      // Deactivate current grant
      await tx.portalAccessGrant.update({
        where: { id: currentGrant.id },
        data: {
          status: "DEACTIVATED",
          deactivatedAt: new Date(),
          deactivatedReason: "REISSUED",
          deactivatedBy: context.userId,
        },
      });

      // Revoke all sessions for this grant
      await tx.portalSession.updateMany({
        where: { grantId: currentGrant.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      // Audit the reissue
      await tx.portalAuditEvent.create({
        data: {
          companyId: currentGrant.companyId,
          jobId,
          customerId: currentGrant.customerId,
          grantId: currentGrant.id,
          actorUserId: context.userId,
          action: "PORTAL_REISSUED",
        },
      });
    }

    // Generate new grant
    const linkToken = generateToken();
    const linkTokenHash = hashToken(linkToken);
    const linkExpiresAt = new Date(
      Date.now() + env.PORTAL_LINK_UNUSED_TTL_HOURS * 60 * 60 * 1000,
    );

    const newGrant = await tx.portalAccessGrant.create({
      data: {
        companyId: context.companyId,
        customerId: job.customerId,
        jobId,
        issuedBy: context.userId,
        linkTokenHash,
        linkExpiresAt,
        status: "ACTIVE",
      },
      select: {
        id: true,
        linkExpiresAt: true,
      },
    });

    // Build link
    const link = `${env.PORTAL_PUBLIC_BASE_URL}/open#t=${linkToken}`;

    return { grant: newGrant, link };
  });

  return result;
}

/**
 * Deactivate a portal access grant manually.
 */
export async function deactivateGrant(
  context: AuthContext,
  jobId: string,
) {
  // Verify job belongs to caller's company
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { companyId: true },
  });

  if (!job) {
    throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  }

  if (job.companyId !== context.companyId) {
    throw new AppError("TENANT_ACCESS_DENIED", "Access denied", 403);
  }

  // Find ACTIVE grant
  const grant = await prisma.portalAccessGrant.findFirst({
    where: { jobId, status: "ACTIVE" },
  });

  if (!grant) {
    // Idempotent: nothing to deactivate
    return;
  }

  // Transaction: deactivate grant + revoke sessions
  await prisma.$transaction(async (tx) => {
    await tx.portalAccessGrant.update({
      where: { id: grant.id },
      data: {
        status: "DEACTIVATED",
        deactivatedAt: new Date(),
        deactivatedReason: "MANUAL",
        deactivatedBy: context.userId,
      },
    });

    await tx.portalSession.updateMany({
      where: { grantId: grant.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // Audit the deactivation
    await tx.portalAuditEvent.create({
      data: {
        companyId: grant.companyId,
        jobId,
        customerId: grant.customerId,
        grantId: grant.id,
        actorUserId: context.userId,
        action: "PORTAL_DEACTIVATED",
        metadata: { reason: "MANUAL" },
      },
    });
  });
}

/**
 * Get portal access status for a job.
 */
export async function getGrantStatus(context: AuthContext, jobId: string) {
  // Verify job belongs to caller's company
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { companyId: true },
  });

  if (!job) {
    throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  }

  if (job.companyId !== context.companyId) {
    throw new AppError("TENANT_ACCESS_DENIED", "Access denied", 403);
  }

  const grant = await prisma.portalAccessGrant.findFirst({
    where: { jobId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      createdAt: true,
      linkConsumedAt: true,
      deactivatedAt: true,
      deactivatedReason: true,
    },
  });

  if (!grant) {
    return null;
  }

  // Get lastSeenAt from any session
  const session = await prisma.portalSession.findFirst({
    where: { grantId: grant.id },
    orderBy: { lastSeenAt: "desc" },
    select: { lastSeenAt: true },
  });

  return {
    status: grant.status,
    createdAt: grant.createdAt,
    linkConsumedAt: grant.linkConsumedAt,
    lastSeenAt: session?.lastSeenAt || null,
    deactivatedAt: grant.deactivatedAt,
    deactivatedReason: grant.deactivatedReason,
  };
}

/**
 * Close portal access if job is done.
 * Called inside job/invoice/payment transactions when possible.
 *
 * Closes (AUTO_*) when:
 * - job CANCELLED → AUTO_CANCELLED
 * - job COMPLETED and no invoice for the job in DRAFT, ISSUED, PARTIALLY_PAID, OVERDUE
 *   and a CustomerReview exists → AUTO_COMPLETED
 */
export async function closePortalIfDone(
  jobId: string,
  tx?: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
): Promise<void> {
  const db = tx ?? prisma;

  // Get job and ACTIVE grant in one query
  const job = await db.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      companyId: true,
      status: true,
    },
  });

  if (!job) {
    return;
  }

  // Find ACTIVE grant for this job
  const grant = await db.portalAccessGrant.findFirst({
    where: {
      jobId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      companyId: true,
      customerId: true,
    },
  });

  if (!grant) {
    // No active grant to close
    return;
  }

  let reason: "AUTO_CANCELLED" | "AUTO_COMPLETED" | null = null;

  if (job.status === "CANCELLED") {
    reason = "AUTO_CANCELLED";
  } else if (job.status === "COMPLETED") {
    // Check if job has unpaid invoice
    const unpaidInvoice = await db.invoice.findFirst({
      where: {
        jobId,
        status: { in: ["DRAFT", "ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
      },
      select: { id: true },
    });

    if (!unpaidInvoice) {
      // No unpaid invoice - check if review exists
      const review = await db.customerReview.findFirst({
        where: { jobId },
        select: { id: true },
      });

      if (review) {
        reason = "AUTO_COMPLETED";
      }
    }
  }

  if (!reason) {
    // Job not in a done state that requires portal closure
    return;
  }

  // Deactivate grant and revoke sessions
  await db.portalAccessGrant.update({
    where: { id: grant.id },
    data: {
      status: "DEACTIVATED",
      deactivatedAt: new Date(),
      deactivatedReason: reason,
    },
  });

  await db.portalSession.updateMany({
    where: { grantId: grant.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  // Write audit event
  await db.portalAuditEvent.create({
    data: {
      companyId: grant.companyId,
      jobId,
      customerId: grant.customerId,
      grantId: grant.id,
      action: "PORTAL_DEACTIVATED",
      metadata: { reason },
    },
  });
}
