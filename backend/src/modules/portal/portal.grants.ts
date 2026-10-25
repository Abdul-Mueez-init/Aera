import { env } from "../../config/env.js";
import { AppError } from "../../common/errors.js";
import type { AuthContext } from "../../common/auth/auth.types.js";
import { prisma } from "../../db/prisma.js";
import { generateToken, hashToken } from "./portal.tokens.js";

type PrismaLike =
  typeof prisma | Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Per-job issuance cap: at most 5 grants created per job per hour.
 * issueGrant enforced this from the start; reissueGrant did not, which
 * let a staff session mint fresh links (each one revoking the customer's
 * live session and triggering SMS/email delivery) without bound.
 */
async function assertIssuanceCap(db: PrismaLike, jobId: string) {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentGrants = await db.portalAccessGrant.count({
    where: {
      jobId,
      createdAt: { gte: oneHourAgo },
    },
  });
  if (recentGrants >= 5) {
    throw new AppError("RATE_LIMITED", "Too many portal access issuances", 429);
  }
}

/**
 * Load a job scoped to the caller's company, in the query itself.
 * A job in another company is indistinguishable from a missing job:
 * both are 404 RESOURCE_NOT_FOUND (a 403 would confirm the id exists).
 */
async function loadJobInCompany(
  db: PrismaLike,
  companyId: string,
  jobId: string,
) {
  const job = await db.job.findFirst({
    where: { id: jobId, companyId },
    select: { id: true, customerId: true, jobNumber: true },
  });

  if (!job) {
    throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  }

  return job;
}

/**
 * Issue a new portal access grant for a job.
 * Returns the grant, the customerId (from the same company-scoped query)
 * and the plaintext link token (only once).
 */
export async function issueGrant(context: AuthContext, jobId: string) {
  const job = await loadJobInCompany(prisma, context.companyId, jobId);

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

  // Generate grant
  const linkToken = generateToken();
  const linkTokenHash = hashToken(linkToken);
  const linkExpiresAt = new Date(
    Date.now() + env.PORTAL_LINK_UNUSED_TTL_HOURS * 60 * 60 * 1000,
  );

  // The issuance cap check, the grant and its audit event commit together:
  // a grant must never exist without its PORTAL_LINK_ISSUED trail.
  let grant: { id: string; linkExpiresAt: Date };
  try {
    grant = await prisma.$transaction(async (tx) => {
      // Abuse limit: max 5 issuances per job per hour (shared with
      // reissue — see assertIssuanceCap).
      await assertIssuanceCap(tx, jobId);

      const created = await tx.portalAccessGrant.create({
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

      await tx.portalAuditEvent.create({
        data: {
          companyId: context.companyId,
          jobId,
          customerId: job.customerId,
          grantId: created.id,
          actorUserId: context.userId,
          action: "PORTAL_LINK_ISSUED",
        },
      });

      return created;
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

  // Build link
  const link = `${env.PORTAL_PUBLIC_BASE_URL}/open#t=${linkToken}`;

  return { grant, link, customerId: job.customerId, jobNumber: job.jobNumber };
}

/**
 * Reissue a portal access grant (deactivate old, create new).
 * Works on COMPLETED jobs for "reactivation".
 */
export async function reissueGrant(context: AuthContext, jobId: string) {
  const job = await loadJobInCompany(prisma, context.companyId, jobId);

  // Transaction: deactivate current ACTIVE grant + revoke sessions + create new grant
  const result = await prisma.$transaction(async (tx) => {
    // Same per-job issuance cap as issueGrant.
    await assertIssuanceCap(tx, jobId);

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

    if (!currentGrant) {
      // Reissue used as a first issuance (no ACTIVE grant existed): the
      // issuance itself must still land in the audit trail.
      await tx.portalAuditEvent.create({
        data: {
          companyId: context.companyId,
          jobId,
          customerId: job.customerId,
          grantId: newGrant.id,
          actorUserId: context.userId,
          action: "PORTAL_LINK_ISSUED",
        },
      });
    }

    // Build link
    const link = `${env.PORTAL_PUBLIC_BASE_URL}/open#t=${linkToken}`;

    return { grant: newGrant, link };
  });

  return { ...result, customerId: job.customerId, jobNumber: job.jobNumber };
}

/**
 * Deactivate a portal access grant manually.
 */
export async function deactivateGrant(
  context: AuthContext,
  jobId: string,
  reason?: string,
) {
  await loadJobInCompany(prisma, context.companyId, jobId);

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
        metadata: {
          reason: "MANUAL",
          ...(reason ? { note: reason } : {}),
        },
      },
    });
  });
}

/**
 * Get portal access status for a job.
 */
export async function getGrantStatus(context: AuthContext, jobId: string) {
  await loadJobInCompany(prisma, context.companyId, jobId);

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

  // Last 20 audit events for this job (staff-side portal activity trail).
  const recentEvents = await prisma.portalAuditEvent.findMany({
    where: { companyId: context.companyId, jobId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      grantId: true,
      actorUserId: true,
      action: true,
      metadata: true,
      createdAt: true,
    },
  });

  return {
    status: grant.status,
    createdAt: grant.createdAt,
    linkConsumedAt: grant.linkConsumedAt,
    lastSeenAt: session?.lastSeenAt || null,
    deactivatedAt: grant.deactivatedAt,
    deactivatedReason: grant.deactivatedReason,
    recentEvents,
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
  const job = await db.job.findFirst({
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
