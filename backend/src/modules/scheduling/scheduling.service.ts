import { AppError } from "../../common/errors.js";
import type { AuthContext } from "../../common/auth/auth.types.js";
import { prisma } from "../../db/prisma.js";
import { notificationPublisher } from "../notifications/notification.port.js";
import { getJob } from "../jobs/job.service.js";

export interface ScheduleInput {
  scheduledStart: Date;
  scheduledEnd: Date;
}

function dayBounds(date: string): { start: Date; end: Date } {
  const start = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) {
    throw new AppError("VALIDATION_FAILED", "Invalid schedule date", 422);
  }
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
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
) {
  if (!technicianId) {
    return [];
  }

  return prisma.job.findMany({
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
  const job = await prisma.job.findFirst({
    where: { id: jobId, companyId: context.companyId },
    select: { id: true, status: true, assignedTechnicianId: true },
  });
  if (!job) {
    throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  }
  if (["COMPLETED", "CANCELLED"].includes(job.status)) {
    throw new AppError("JOB_IMMUTABLE", "Final jobs cannot be scheduled", 409);
  }
  if (reschedule && job.status !== "SCHEDULED") {
    throw new AppError(
      "SCHEDULE_INVALID_RESCHEDULE",
      "Only scheduled jobs can be rescheduled",
      422,
    );
  }

  const conflicts = await findConflicts(
    context.companyId,
    jobId,
    job.assignedTechnicianId,
    input,
  );
  const nextStatus =
    job.status === "NEW" || job.status === "QUOTING" ? "SCHEDULED" : job.status;

  await prisma.$transaction(async (transaction) => {
    await transaction.job.update({
      where: { id: jobId },
      data: {
        scheduledStart: input.scheduledStart,
        scheduledEnd: input.scheduledEnd,
        status: nextStatus,
      },
    });
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
  });

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
}

export async function getDaySchedule(context: AuthContext, date: string) {
  const { start, end } = dayBounds(date);
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
  const { start, end } = dayBounds(date);
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

  const workload = await Promise.all(
    technicians.map(async ({ user }) => ({
      technician: user,
      jobCount: await prisma.job.count({
        where: {
          companyId: context.companyId,
          assignedTechnicianId: user.id,
          scheduledStart: { gte: start, lt: end },
          status: { notIn: ["CANCELLED", "COMPLETED"] },
        },
      }),
    })),
  );

  return { date, technicians: workload };
}
