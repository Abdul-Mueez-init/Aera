import { AppError } from "../../common/errors.js";
import type { AuthContext } from "../../common/auth/auth.types.js";
import { logger } from "../../common/logger.js";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import type { Prisma } from "../../generated/prisma/index.js";
import { inProcessQueue } from "../../queue/in-process-queue.adapter.js";
import {
  deriveHandshakeCode,
  timingSafeCompare,
} from "../portal/portal.tokens.js";
import { sendHandshakeCode } from "../portal/portal-delivery.service.js";

/**
 * Technician–customer handshake (handoff 5.7, Uber-style).
 *
 * The 6-digit code is derived (never stored) from PORTAL_CODE_SECRET and
 * the job's handshakeVersion. It is shown/sent to the CUSTOMER only. The
 * assigned TECHNICIAN must type it into POST /jobs/:jobId/start to move a
 * job EN_ROUTE → IN_PROGRESS. Staff (OWNER/DISPATCHER) may override with
 * a mandatory reason; every outcome is written to PortalAuditEvent.
 */

const HANDSHAKE_CODE_JOB_TYPE = "portal.handshake-code-delivery";

interface HandshakeJobSnapshot {
  id: string;
  companyId: string;
  customerId: string;
  status: string;
  assignedTechnicianId: string | null;
  handshakeVersion: number;
  handshakeFailedAttempts: number;
  handshakeLockedUntil: Date | null;
  handshakeVerifiedAt: Date | null;
}

async function loadHandshakeJob(jobId: string): Promise<HandshakeJobSnapshot> {
  const job = await prisma.job.findFirst({
    where: { id: jobId },
    select: {
      id: true,
      companyId: true,
      customerId: true,
      status: true,
      assignedTechnicianId: true,
      handshakeVersion: true,
      handshakeFailedAttempts: true,
      handshakeLockedUntil: true,
      handshakeVerifiedAt: true,
    },
  });

  // Tenant convention (job.policy.ts / job.service.ts): a job in another
  // company is indistinguishable from a missing job.
  if (!job) {
    throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  }
  return job;
}

function assertJobInCompany(
  context: AuthContext,
  job: HandshakeJobSnapshot,
): void {
  if (job.companyId !== context.companyId) {
    throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  }
}

/**
 * The started-job response uses job.service's getJob so its shape matches
 * every other job command. It is imported lazily because job.service.ts
 * imports this module (EN_ROUTE / assignment hooks), which would
 * otherwise be a static import cycle.
 */
async function getStartedJob(context: AuthContext, jobId: string) {
  const { getJob } = await import("./job.service.js");
  return getJob(context, jobId);
}

/**
 * Start a job with the customer handshake code. Assigned technician only.
 *
 * Failure bookkeeping (attempt increment + lockout) is committed in its
 * own statement BEFORE the error is thrown, so a failed attempt can never
 * be rolled back by the error response.
 */
export async function startJobWithCode(
  context: AuthContext,
  jobId: string,
  code: string,
) {
  const job = await loadHandshakeJob(jobId);
  assertJobInCompany(context, job);

  if (
    context.role !== "TECHNICIAN" ||
    job.assignedTechnicianId !== context.userId ||
    job.status !== "EN_ROUTE"
  ) {
    throw new AppError(
      "HANDSHAKE_NOT_AVAILABLE",
      "Handshake start is only available to the assigned technician while the job is en route",
      409,
    );
  }

  const now = new Date();
  if (job.handshakeLockedUntil && job.handshakeLockedUntil > now) {
    throw new AppError(
      "HANDSHAKE_LOCKED",
      `Too many failed attempts. Try again after ${job.handshakeLockedUntil.toISOString()}.`,
      423,
    );
  }

  const expectedCode = deriveHandshakeCode(
    env.PORTAL_CODE_SECRET ?? "",
    context.companyId,
    jobId,
    job.handshakeVersion,
  );

  if (!timingSafeCompare(code, expectedCode)) {
    const attempts = job.handshakeFailedAttempts + 1;
    const attemptsRemaining = Math.max(
      0,
      env.HANDSHAKE_MAX_ATTEMPTS - attempts,
    );
    const locksNow = attempts >= env.HANDSHAKE_MAX_ATTEMPTS;
    const lockedUntil = locksNow
      ? new Date(now.getTime() + env.HANDSHAKE_LOCK_MINUTES * 60 * 1000)
      : null;

    // Own committed statement: never inside a transaction that then throws.
    await prisma.job.update({
      where: { id: jobId },
      data: {
        handshakeFailedAttempts: attempts,
        ...(locksNow ? { handshakeLockedUntil: lockedUntil } : {}),
      },
    });
    await prisma.portalAuditEvent.create({
      data: {
        companyId: context.companyId,
        jobId,
        customerId: job.customerId,
        actorUserId: context.userId,
        action: "HANDSHAKE_FAILED",
        metadata: { attempts, attemptsRemaining },
      },
    });
    if (locksNow) {
      await prisma.portalAuditEvent.create({
        data: {
          companyId: context.companyId,
          jobId,
          customerId: job.customerId,
          actorUserId: context.userId,
          action: "HANDSHAKE_LOCKED",
          metadata: {
            attempts,
            lockedUntil: lockedUntil?.toISOString() ?? null,
          },
        },
      });
    }

    throw new AppError(
      "HANDSHAKE_INVALID",
      `Invalid handshake code. ${attemptsRemaining} attempt${attemptsRemaining === 1 ? "" : "s"} remaining.`,
      422,
    );
  }

  await prisma.$transaction(async (transaction) => {
    const result = await transaction.job.updateMany({
      where: {
        id: jobId,
        companyId: context.companyId,
        status: "EN_ROUTE",
        handshakeVersion: job.handshakeVersion,
      },
      data: {
        status: "IN_PROGRESS",
        startedAt: now,
        handshakeVerifiedAt: now,
        handshakeFailedAttempts: 0,
        handshakeLockedUntil: null,
      },
    });
    if (result.count !== 1) {
      throw new AppError(
        "HANDSHAKE_NOT_AVAILABLE",
        "Job is no longer awaiting a handshake start",
        409,
      );
    }
    await transaction.jobStatusHistory.create({
      data: {
        companyId: context.companyId,
        jobId,
        actorUserId: context.userId,
        fromStatus: "EN_ROUTE",
        toStatus: "IN_PROGRESS",
        reason: "Handshake verified",
      },
    });
    await transaction.portalAuditEvent.create({
      data: {
        companyId: context.companyId,
        jobId,
        customerId: job.customerId,
        actorUserId: context.userId,
        action: "HANDSHAKE_VERIFIED",
      },
    });
  });

  return getStartedJob(context, jobId);
}

/**
 * Staff override: start an EN_ROUTE job without the code.
 * OWNER/DISPATCHER only; a reason is required (validated at the route)
 * and is recorded in both the status history and the audit event.
 */
export async function overrideStartJob(
  context: AuthContext,
  jobId: string,
  reason: string,
) {
  if (context.role !== "OWNER" && context.role !== "DISPATCHER") {
    throw new AppError(
      "AUTH_FORBIDDEN",
      "Only owners and dispatchers can override a handshake start",
      403,
    );
  }

  const job = await loadHandshakeJob(jobId);
  assertJobInCompany(context, job);

  if (job.status !== "EN_ROUTE") {
    throw new AppError(
      "HANDSHAKE_NOT_AVAILABLE",
      "Handshake override is only available while the job is en route",
      409,
    );
  }

  const now = new Date();
  await prisma.$transaction(async (transaction) => {
    const result = await transaction.job.updateMany({
      where: {
        id: jobId,
        companyId: context.companyId,
        status: "EN_ROUTE",
      },
      data: {
        status: "IN_PROGRESS",
        startedAt: now,
        handshakeVerifiedAt: now,
        handshakeFailedAttempts: 0,
        handshakeLockedUntil: null,
      },
    });
    if (result.count !== 1) {
      throw new AppError(
        "HANDSHAKE_NOT_AVAILABLE",
        "Job is no longer awaiting a handshake start",
        409,
      );
    }
    await transaction.jobStatusHistory.create({
      data: {
        companyId: context.companyId,
        jobId,
        actorUserId: context.userId,
        fromStatus: "EN_ROUTE",
        toStatus: "IN_PROGRESS",
        reason: `Handshake override: ${reason}`,
      },
    });
    await transaction.portalAuditEvent.create({
      data: {
        companyId: context.companyId,
        jobId,
        customerId: job.customerId,
        actorUserId: context.userId,
        action: "HANDSHAKE_OVERRIDDEN",
        metadata: { reason },
      },
    });
  });

  return getStartedJob(context, jobId);
}

/**
 * Regenerate the handshake code for an EN_ROUTE job (staff only).
 * Bumps handshakeVersion, which changes the derived code, resets the
 * attempt/lock/verified state, audits HANDSHAKE_REGENERATED, and
 * re-delivers the new code to the customer after commit.
 */
export async function regenerateHandshake(context: AuthContext, jobId: string) {
  if (context.role !== "OWNER" && context.role !== "DISPATCHER") {
    throw new AppError(
      "AUTH_FORBIDDEN",
      "Only owners and dispatchers can regenerate a handshake code",
      403,
    );
  }

  const job = await loadHandshakeJob(jobId);
  assertJobInCompany(context, job);

  if (job.status !== "EN_ROUTE") {
    throw new AppError(
      "HANDSHAKE_NOT_AVAILABLE",
      "Handshake code regeneration is only available while the job is en route",
      409,
    );
  }

  const newVersion = await prisma.$transaction(async (transaction) => {
    await prepareHandshakeOnEnRoute(transaction, job);
    const updated = await transaction.job.findUniqueOrThrow({
      where: { id: jobId },
      select: { handshakeVersion: true },
    });
    await transaction.portalAuditEvent.create({
      data: {
        companyId: context.companyId,
        jobId,
        customerId: job.customerId,
        actorUserId: context.userId,
        action: "HANDSHAKE_REGENERATED",
        metadata: { newVersion: updated.handshakeVersion },
      },
    });
    return updated.handshakeVersion;
  });

  queueHandshakeCodeDelivery(jobId);

  return { success: true, newVersion };
}

/**
 * Prepare a fresh handshake for a job entering (or re-entering) EN_ROUTE.
 * Must run inside the caller's transaction: bumps handshakeVersion (which
 * changes the derived code) and clears attempts, lock and verification.
 */
export async function prepareHandshakeOnEnRoute(
  transaction: Prisma.TransactionClient,
  job: { id: string },
): Promise<void> {
  await transaction.job.update({
    where: { id: job.id },
    data: {
      handshakeVersion: { increment: 1 },
      handshakeFailedAttempts: 0,
      handshakeLockedUntil: null,
      handshakeVerifiedAt: null,
    },
  });
}

interface HandshakeCodeDeliveryJob {
  jobId: string;
}

/**
 * Deliver the current handshake code to the customer by SMS and email.
 * Runs through the in-process queue so delivery can never fail or block
 * the business transition that triggered it. Every outcome is caught and
 * audited per channel (HANDSHAKE_CODE_SENT); this function never throws.
 */
async function processHandshakeCodeDelivery(
  payload: HandshakeCodeDeliveryJob,
): Promise<void> {
  try {
    const job = await prisma.job.findUnique({
      where: { id: payload.jobId },
      select: {
        id: true,
        companyId: true,
        customerId: true,
        status: true,
        handshakeVersion: true,
        assignedTechnician: { select: { firstName: true } },
      },
    });

    // Stale delivery (job moved on, or was reassigned and a newer code
    // was issued): the current code is delivered by the newest enqueue.
    if (!job || job.status !== "EN_ROUTE") {
      return;
    }

    const code = deriveHandshakeCode(
      env.PORTAL_CODE_SECRET ?? "",
      job.companyId,
      job.id,
      job.handshakeVersion,
    );

    const results = await sendHandshakeCode(
      job.companyId,
      job.customerId,
      job.assignedTechnician?.firstName ?? "Your technician",
      code,
      ["SMS", "EMAIL"],
    );

    for (const result of results) {
      await prisma.portalAuditEvent.create({
        data: {
          companyId: job.companyId,
          jobId: job.id,
          customerId: job.customerId,
          action: "HANDSHAKE_CODE_SENT",
          metadata: { channel: result.channel, status: result.status },
        },
      });
    }
  } catch (error) {
    logger.warn(
      { err: error, jobId: payload.jobId },
      "Handshake code delivery failed",
    );
  }
}

inProcessQueue.registerHandler<HandshakeCodeDeliveryJob>(
  HANDSHAKE_CODE_JOB_TYPE,
  processHandshakeCodeDelivery,
);

/**
 * Fire-and-forget enqueue of handshake code delivery. Call AFTER the
 * transition transaction has committed. Never throws.
 */
export function queueHandshakeCodeDelivery(jobId: string): void {
  void inProcessQueue
    .enqueue<HandshakeCodeDeliveryJob>(HANDSHAKE_CODE_JOB_TYPE, { jobId })
    .catch((error: unknown) => {
      logger.warn(
        { err: error, jobId },
        "Failed to enqueue handshake code delivery",
      );
    });
}
