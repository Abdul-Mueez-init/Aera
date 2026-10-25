import { AppError } from "../../common/errors.js";
import type { AuthContext } from "../../common/auth/auth.types.js";
import { prisma } from "../../db/prisma.js";
import { notificationPublisher } from "../notifications/notification.port.js";
import { getJob } from "../jobs/job.service.js";
import {
  dayBoundsInTimezone,
  getCompanyTimezone,
} from "../ai/tools/timezone.util.js";

export interface ScheduleInput {
  scheduledStart: Date;
  scheduledEnd: Date;
}

/**
 * Day bounds in the COMPANY's timezone — the same convention the
 * dashboard and AI tools already use. The old UTC-midnight bounds put
 * jobs scheduled in the first hours of the local day (e.g. 00:00–05:00
 * in UTC+5) on the wrong day's board.
 */
async function dayBounds(
  companyId: string,
  date: string,
): Promise<{ start: Date; end: Date }> {
  try {
    return dayBoundsInTimezone(date, await getCompanyTimezone(companyId));
  } catch {
    throw new AppError("VALIDATION_FAILED", "Invalid schedule date", 422);
  }
}

function assertScheduleRange(input: ScheduleInput) {
  if (
    Number.isNaN(input.scheduledStart.getTime()) ||
    Number.isNaN(input.scheduledEnd.getTime()) ||
    input.scheduledEnd <= input.scheduledStart
  ) {
    throw new AppError(
      "SCHEDULE_INVALID_RANGE",
      "Schedule end must be after schedule start",
      422,
    );
  }
}

async function findConflicts(
  companyId: string,
  jobId: string,
  technicianId: string | null,
  input: ScheduleInput,
  db:
    | typeof prisma
    | Parameters<Parameters<typeof prisma.$transaction>[0]>[0] = prisma,
) {
  if (!technicianId) {
    return [];
  }

  return db.job.findMany({
    where: {
      companyId,
      id: { not: jobId },
      assignedTechnicianId: technicianId,
      scheduledStart: { lt: input.scheduledEnd },
      scheduledEnd: { gt: input.scheduledStart },
      status: { notIn: ["CANCELLED", "COMPLETED"] },
    },
    select: {
      id: true,
      jobNumber: true,
      scheduledStart: true,
      scheduledEnd: true,
      customer: { select: { firstName: true, lastName: true } },
    },
    orderBy: { scheduledStart: "asc" },
  });
}

export async function scheduleJob(
  context: AuthContext,
  jobId: string,
  input: ScheduleInput,
  reschedule: boolean,
) {
  assertScheduleRange(input);

  return prisma
    .$transaction(async (transaction) => {
      const job = await transaction.job.findFirst({
        where: { id: jobId, companyId: context.companyId },
        select: { id: true, status: true, assignedTechnicianId: true },
      });
      if (!job) {
        throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
      }
      if (["COMPLETED", "CANCELLED"].includes(job.status)) {
        throw new AppError(
          "JOB_IMMUTABLE",
          "Final jobs cannot be scheduled",
          409,
        );
      }
      if (reschedule && job.status !== "SCHEDULED") {
        throw new AppError(
          "SCHEDULE_INVALID_RESCHEDULE",
          "Only scheduled jobs can be rescheduled",
          422,
        );
      }

      // Require technician assignment for scheduling
      if (!job.assignedTechnicianId) {
        throw new AppError(
          "JOB_REQUIRES_TECHNICIAN",
          "A technician must be assigned before scheduling the job",
          422,
        );
      }

      // Lock the technician row to serialize concurrent scheduling for the same technician
      // We update a dummy field to force a row-level lock
      if (job.assignedTechnicianId) {
        await transaction.user.update({
          where: { id: job.assignedTechnicianId },
          data: { updatedAt: new Date() },
        });
      }

      const conflicts = await findConflicts(
        context.companyId,
        jobId,
        job.assignedTechnicianId,
        input,
        transaction,
      );
      const nextStatus =
        job.status === "NEW" || job.status === "QUOTING"
          ? "SCHEDULED"
          : job.status;

      // Guard the write with the status we validated: if the job was
      // cancelled/completed between the read and this update, the write
      // must not resurrect it.
      const updated = await transaction.job.updateMany({
        where: { id: jobId, companyId: context.companyId, status: job.status },
        data: {
          scheduledStart: input.scheduledStart,
          scheduledEnd: input.scheduledEnd,
          status: nextStatus,
        },
      });
      if (updated.count !== 1) {
        throw new AppError(
          "JOB_STATE_CHANGED",
          "Job changed while it was being scheduled; please retry",
          409,
        );
      }
      if (nextStatus !== job.status) {
        await transaction.jobStatusHistory.create({
          data: {
            companyId: context.companyId,
            jobId,
            actorUserId: context.userId,
            fromStatus: job.status,
            toStatus: "SCHEDULED",
            reason: "Scheduled for dispatch",
          },
        });
      }

      return {
        job,
        conflicts,
        reschedule,
      };
    })
    .then(async ({ job, conflicts, reschedule }) => {
      void notificationPublisher.publish({
        type: reschedule ? "JOB_RESCHEDULED" : "JOB_SCHEDULED",
        companyId: context.companyId,
        jobId,
        recipientUserId: job.assignedTechnicianId ?? undefined,
      });

      return {
        job: await getJob(context, jobId),
        warnings: conflicts.map((conflict) => ({
          code: "TECHNICIAN_SCHEDULE_CONFLICT",
          jobId: conflict.id,
          jobNumber: conflict.jobNumber,
          scheduledStart: conflict.scheduledStart,
          scheduledEnd: conflict.scheduledEnd,
          customer: conflict.customer,
        })),
      };
    });
}

export async function getDaySchedule(context: AuthContext, date: string) {
  const { start, end } = await dayBounds(context.companyId, date);
  const jobs = await prisma.job.findMany({
    where: {
      companyId: context.companyId,
      ...(context.role === "TECHNICIAN"
        ? { assignedTechnicianId: context.userId }
        : {}),
      scheduledStart: { gte: start, lt: end },
      status: { not: "CANCELLED" },
    },
    orderBy: { scheduledStart: "asc" },
    // No take cap: the dispatch board must show EVERY job that day.
    // A silent cap drops real jobs from the board with no signal.
    select: {
      id: true,
      jobNumber: true,
      serviceType: true,
      problemDescription: true,
      priority: true,
      status: true,
      scheduledStart: true,
      scheduledEnd: true,
      customer: { select: { id: true, firstName: true, lastName: true } },
      serviceAddress: { select: { line1: true, city: true, region: true } },
      assignedTechnician: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
  });
  return { date, jobs };
}

export async function getTechnicianWorkload(
  context: AuthContext,
  date: string,
) {
  const { start, end } = await dayBounds(context.companyId, date);
  const technicians = await prisma.companyMember.findMany({
    where: {
      companyId: context.companyId,
      role: "TECHNICIAN",
      status: "ACTIVE",
      ...(context.role === "TECHNICIAN" ? { userId: context.userId } : {}),
    },
    select: {
      user: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Batch query: get all job counts in a single query using grouping
  const jobCounts = await prisma.job.groupBy({
    by: ["assignedTechnicianId"],
    where: {
      companyId: context.companyId,
      assignedTechnicianId: { in: technicians.map((t) => t.user.id) },
      scheduledStart: { gte: start, lt: end },
      status: { notIn: ["CANCELLED", "COMPLETED"] },
    },
    _count: true,
  });

  // Create a map for O(1) lookup
  const countMap = new Map(
    jobCounts.map((item) => [item.assignedTechnicianId, item._count]),
  );

  const workload = technicians.map(({ user }) => ({
    technician: user,
    jobCount: countMap.get(user.id) || 0,
  }));

  return { date, technicians: workload };
}
