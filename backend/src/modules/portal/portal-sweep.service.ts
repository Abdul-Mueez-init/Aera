import { logger } from "../../common/logger.js";
import { captureBackgroundError } from "../../common/observability.js";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { closePortalIfDone } from "./portal.grants.js";

const DAY_MS = 86_400_000;
const PAGE_SIZE = 200;
const INITIAL_DELAY_MS = 30_000;

export interface PortalSweepOptions {
  postCompletionMaxDays?: number;
  linkUnusedTtlHours?: number;
}

export interface PortalSweepResult {
  completedJobsClosed: number;
  neverOpenedLinksClosed: number;
  reevaluatedJobs: number;
}

/**
 * One pass over portal access grants to auto-close stale or completed jobs:
 *  1. Completed jobs older than PORTAL_POST_COMPLETION_MAX_DAYS → AUTO_MAX_AGE
 *  2. ACTIVE grants with linkConsumedAt IS NULL AND linkExpiresAt < now → AUTO_LINK_UNUSED
 *  3. Re-evaluate closePortalIfDone for COMPLETED jobs with ACTIVE grants (safety net)
 *
 * Idempotent: status-guarded updates ensure idempotency. Paged by id so memory
 * stays bounded however many grants exist.
 */
export async function runPortalSweep(
  now: Date = new Date(),
  options: PortalSweepOptions = {},
): Promise<PortalSweepResult> {
  const postCompletionMaxDays =
    options.postCompletionMaxDays ?? env.PORTAL_POST_COMPLETION_MAX_DAYS;
  const linkUnusedTtlHours =
    options.linkUnusedTtlHours ?? env.PORTAL_LINK_UNUSED_TTL_HOURS;

  const completedBefore = new Date(
    now.getTime() - postCompletionMaxDays * DAY_MS,
  );
  const linkExpiredAt = new Date(
    now.getTime() - linkUnusedTtlHours * 60 * 60 * 1000,
  );

  let completedJobsClosed = 0;
  let neverOpenedLinksClosed = 0;
  let reevaluatedJobs = 0;
  let cursor: string | undefined;

  // Pass 1: Close completed jobs older than max age
  for (;;) {
    const page = await prisma.portalAccessGrant.findMany({
      where: {
        status: "ACTIVE",
        job: {
          status: "COMPLETED",
          completedAt: { lt: completedBefore },
        },
      },
      select: {
        id: true,
        companyId: true,
        customerId: true,
        jobId: true,
      },
      orderBy: { id: "asc" },
      take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }) as Array<{
      id: string;
      companyId: string;
      customerId: string;
      jobId: string;
    }>;
    if (page.length === 0) break;
    cursor = page[page.length - 1].id;

    for (const grant of page) {
      await prisma.$transaction(async (tx) => {
        // Re-check within transaction
        const current = await tx.portalAccessGrant.findUnique({
          where: { id: grant.id },
          select: { status: true },
        });

        if (!current || current.status !== "ACTIVE") {
          return;
        }

        // Deactivate grant
        await tx.portalAccessGrant.update({
          where: { id: grant.id },
          data: {
            status: "DEACTIVATED",
            deactivatedAt: now,
            deactivatedReason: "AUTO_MAX_AGE",
          },
        });

        // Revoke sessions
        await tx.portalSession.updateMany({
          where: { grantId: grant.id, revokedAt: null },
          data: { revokedAt: now },
        });

        // Audit
        await tx.portalAuditEvent.create({
          data: {
            companyId: grant.companyId,
            jobId: grant.jobId,
            customerId: grant.customerId,
            grantId: grant.id,
            action: "PORTAL_DEACTIVATED",
            metadata: { reason: "AUTO_MAX_AGE" },
          },
        });
      });

      completedJobsClosed += 1;
    }

    if (page.length < PAGE_SIZE) break;
  }

  // Reset cursor for pass 2
  cursor = undefined;

  // Pass 2: Close never-opened links that have expired
  for (;;) {
    const page = await prisma.portalAccessGrant.findMany({
      where: {
        status: "ACTIVE",
        linkConsumedAt: null,
        linkExpiresAt: { lt: linkExpiredAt },
      },
      select: {
        id: true,
        companyId: true,
        customerId: true,
        jobId: true,
      },
      orderBy: { id: "asc" },
      take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }) as Array<{
      id: string;
      companyId: string;
      customerId: string;
      jobId: string;
    }>;
    if (page.length === 0) break;
    cursor = page[page.length - 1].id;

    for (const grant of page) {
      await prisma.$transaction(async (tx) => {
        // Re-check within transaction
        const current = await tx.portalAccessGrant.findUnique({
          where: { id: grant.id },
          select: { status: true, linkConsumedAt: true },
        });

        if (!current || current.status !== "ACTIVE" || current.linkConsumedAt) {
          return;
        }

        // Deactivate grant
        await tx.portalAccessGrant.update({
          where: { id: grant.id },
          data: {
            status: "DEACTIVATED",
            deactivatedAt: now,
            deactivatedReason: "AUTO_LINK_UNUSED",
          },
        });

        // Revoke sessions
        await tx.portalSession.updateMany({
          where: { grantId: grant.id, revokedAt: null },
          data: { revokedAt: now },
        });

        // Audit
        await tx.portalAuditEvent.create({
          data: {
            companyId: grant.companyId,
            jobId: grant.jobId,
            customerId: grant.customerId,
            grantId: grant.id,
            action: "PORTAL_DEACTIVATED",
            metadata: { reason: "AUTO_LINK_UNUSED" },
          },
        });
      });

      neverOpenedLinksClosed += 1;
    }

    if (page.length < PAGE_SIZE) break;
  }

  // Reset cursor for pass 3
  cursor = undefined;

  // Pass 3: Re-evaluate closePortalIfDone for COMPLETED jobs with ACTIVE grants
  // This is a safety net for edge cases where the immediate hook might have failed
  for (;;) {
    const page = await prisma.portalAccessGrant.findMany({
      where: {
        status: "ACTIVE",
        job: {
          status: "COMPLETED",
        },
      },
      select: {
        id: true,
        jobId: true,
      },
      orderBy: { id: "asc" },
      take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }) as Array<{
      id: string;
      jobId: string;
    }>;
    if (page.length === 0) break;
    cursor = page[page.length - 1].id;

    for (const grant of page) {
      try {
        await closePortalIfDone(grant.jobId);
        reevaluatedJobs += 1;
      } catch (error) {
        // Log but continue - this is a safety net, not critical
        logger.warn(
          { grantId: grant.id, jobId: grant.jobId, error },
          "Failed to re-evaluate portal close for job",
        );
      }
    }

    if (page.length < PAGE_SIZE) break;
  }

  return { completedJobsClosed, neverOpenedLinksClosed, reevaluatedJobs };
}

/**
 * In-process scheduler (no cron dependency). Timers are unref'd so they
 * never keep the process alive. Runs are serialized — a slow sweep can't
 * overlap the next tick. With more than one API instance each would sweep;
 * dedupe narrows but does not eliminate the double-close race, so move this
 * behind a single worker / BullMQ repeatable job when scaling out.
 */
export function startPortalSweepScheduler(): () => void {
  let running = false;

  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const result = await runPortalSweep();
      logger.info(result, "Portal sweep completed");
    } catch (error) {
      logger.error({ err: error }, "Portal sweep failed");
      captureBackgroundError(error, "portal-sweep");
    } finally {
      running = false;
    }
  };

  const first = setTimeout(() => void tick(), INITIAL_DELAY_MS);
  const timer = setInterval(
    () => void tick(),
    env.PORTAL_SWEEP_MINUTES * 60_000,
  );
  first.unref();
  timer.unref();

  logger.info(
    { everyMinutes: env.PORTAL_SWEEP_MINUTES },
    "Portal sweep scheduler started",
  );

  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
