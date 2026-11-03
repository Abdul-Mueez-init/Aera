import { AppError } from "../../common/errors.js";
import type { AuthContext } from "../../common/auth/auth.types.js";
import { prisma } from "../../db/prisma.js";
import { computeWindows } from "./availability.engine.js";
import { logger } from "../../common/logger.js";

const HOLD_MINUTES = 10;

function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, nested: unknown) =>
      nested instanceof Date ? nested.toISOString() : nested,
    ),
  ) as T;
}

function assertWindow(start: Date, end: Date) {
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end <= start
  ) {
    throw new AppError(
      "SCHEDULE_INVALID_RANGE",
      "Invalid appointment window",
      422,
    );
  }
}

export async function getAvailability(
  context: AuthContext,
  startsAt: Date,
  endsAt: Date,
  durationMinutes: number,
  serviceId?: string,
) {
  assertWindow(startsAt, endsAt);
  const [
    company,
    technicians,
    businessHours,
    workingHours,
    timeOff,
    skills,
    jobs,
    holds,
  ] = await Promise.all([
    prisma.company.findUniqueOrThrow({
      where: { id: context.companyId },
      select: { travelBufferMinutes: true },
    }),
    prisma.companyMember.findMany({
      where: {
        companyId: context.companyId,
        role: "TECHNICIAN",
        status: "ACTIVE",
      },
      select: { userId: true },
    }),
    prisma.companyBusinessHours.findMany({
      where: { companyId: context.companyId },
    }),
    prisma.technicianWorkingHours.findMany({
      where: { companyId: context.companyId },
    }),
    prisma.technicianTimeOff.findMany({
      where: {
        companyId: context.companyId,
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
    }),
    prisma.technicianSkill.findMany({
      where: { companyId: context.companyId },
      select: { technicianId: true, serviceId: true },
    }),
    prisma.job.findMany({
      where: {
        companyId: context.companyId,
        scheduledStart: { lt: endsAt },
        scheduledEnd: { gt: startsAt },
        status: { notIn: ["CANCELLED", "COMPLETED"] },
      },
      select: {
        assignedTechnicianId: true,
        scheduledStart: true,
        scheduledEnd: true,
      },
    }),
    prisma.appointmentHold.findMany({
      where: {
        companyId: context.companyId,
        status: "HELD",
        expiresAt: { gt: new Date() },
        windowStart: { lt: endsAt },
        windowEnd: { gt: startsAt },
      },
      select: { technicianId: true, windowStart: true, windowEnd: true },
    }),
  ]);
  const ids = technicians.map(({ userId }) => userId);
  const toMinutes = (value: string) => {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
  };
  const intervalsFor = (technicianId: string) => {
    const configured = workingHours.filter(
      (hours) => hours.technicianId === technicianId,
    );
    const source = configured.length > 0 ? configured : businessHours;
    const intervals: Array<{ startsAt: Date; endsAt: Date }> = [];
    for (
      let day = new Date(
        Date.UTC(
          startsAt.getUTCFullYear(),
          startsAt.getUTCMonth(),
          startsAt.getUTCDate(),
        ),
      );
      day < endsAt;
      day = new Date(day.getTime() + 86_400_000)
    ) {
      const weekday = day.getUTCDay();
      for (const hours of source.filter((entry) => entry.weekday === weekday)) {
        const start = new Date(day.getTime() + toMinutes(hours.open) * 60_000);
        const end = new Date(day.getTime() + toMinutes(hours.close) * 60_000);
        if (end > startsAt && start < endsAt) {
          intervals.push({
            startsAt: start < startsAt ? startsAt : start,
            endsAt: end > endsAt ? endsAt : end,
          });
        }
      }
    }
    if (source.length === 0) {
      return [{ startsAt, endsAt }];
    }
    return intervals.filter(
      (interval) =>
        !timeOff.some(
          (blocked) =>
            blocked.technicianId === technicianId &&
            blocked.startsAt < interval.endsAt &&
            blocked.endsAt > interval.startsAt,
        ),
    );
  };
  const windows = computeWindows({
    range: { startsAt, endsAt },
    durationMinutes,
    serviceId,
    bufferMinutes: company.travelBufferMinutes,
    technicians: ids.map((id) => ({
      id,
      intervals: intervalsFor(id),
      serviceIds:
        skills.length > 0
          ? skills
              .filter((skill) => skill.technicianId === id)
              .map((skill) => skill.serviceId)
          : undefined,
    })),
    existingJobs: jobs.flatMap((job) =>
      job.scheduledStart && job.scheduledEnd
        ? [
            {
              technicianId: job.assignedTechnicianId ?? undefined,
              startsAt: job.scheduledStart,
              endsAt: job.scheduledEnd,
            },
          ]
        : [],
    ),
    holds: holds.map((hold) => ({
      technicianId: hold.technicianId ?? undefined,
      startsAt: hold.windowStart,
      endsAt: hold.windowEnd,
    })),
  });
  return {
    range: { startsAt, endsAt },
    durationMinutes,
    windows: jsonSafe(windows),
  };
}

export async function createProposal(
  context: AuthContext,
  input: {
    requestId?: string;
    jobId?: string;
    quoteId?: string;
    windows: Array<{ startsAt: Date; endsAt: Date; capacity?: number }>;
    expiresAt: Date;
  },
) {
  if (input.windows.length < 1 || input.windows.length > 3) {
    throw new AppError(
      "VALIDATION_FAILED",
      "Provide between one and three windows",
      422,
    );
  }
  if (input.expiresAt <= new Date()) {
    throw new AppError(
      "VALIDATION_FAILED",
      "Proposal expiry must be in the future",
      422,
    );
  }
  input.windows.forEach((window) =>
    assertWindow(window.startsAt, window.endsAt),
  );
  const created = await prisma.appointmentProposal.create({
    data: {
      companyId: context.companyId,
      requestId: input.requestId,
      jobId: input.jobId,
      quoteId: input.quoteId,
      windows: jsonSafe(input.windows),
      expiresAt: input.expiresAt,
    },
  });
  return jsonSafe(created);
}

export async function pickProposal(
  context: AuthContext,
  proposalId: string,
  pickedWindow: { startsAt: Date; endsAt: Date },
) {
  assertWindow(pickedWindow.startsAt, pickedWindow.endsAt);
  const updated = await prisma.appointmentProposal.updateMany({
    where: {
      id: proposalId,
      companyId: context.companyId,
      status: "OPEN",
      expiresAt: { gt: new Date() },
    },
    data: {
      status: "PICKED",
      pickedWindow: jsonSafe(pickedWindow),
      pickedAt: new Date(),
      pickedByUserId: context.userId,
    },
  });
  if (updated.count !== 1) {
    throw new AppError(
      "APPOINTMENT_PROPOSAL_UNAVAILABLE",
      "Proposal is no longer open",
      409,
    );
  }

  return prisma.appointmentProposal.findFirstOrThrow({
    where: { id: proposalId, companyId: context.companyId },
  });
}

export async function pickProposalForCustomer(
  context: { companyId: string; customerId: string; sessionId: string },
  proposalId: string,
  pickedWindow: { startsAt: Date; endsAt: Date },
) {
  assertWindow(pickedWindow.startsAt, pickedWindow.endsAt);
  const updated = await prisma.appointmentProposal.updateMany({
    where: {
      id: proposalId,
      companyId: context.companyId,
      status: "OPEN",
      expiresAt: { gt: new Date() },
      request: { customerId: context.customerId },
    },
    data: {
      status: "PICKED",
      pickedWindow: jsonSafe(pickedWindow),
      pickedAt: new Date(),
    },
  });
  if (updated.count !== 1) {
    throw new AppError(
      "APPOINTMENT_PROPOSAL_UNAVAILABLE",
      "Proposal is no longer available",
      409,
    );
  }
  return prisma.appointmentProposal.findFirstOrThrow({
    where: { id: proposalId, companyId: context.companyId },
    select: { id: true, status: true, pickedWindow: true, pickedAt: true },
  });
}

export async function createHold(
  context: AuthContext,
  input: {
    jobId: string;
    technicianId: string;
    windowStart: Date;
    windowEnd: Date;
  },
) {
  assertWindow(input.windowStart, input.windowEnd);
  const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60_000);
  return prisma.appointmentHold.create({
    data: {
      ...input,
      companyId: context.companyId,
      createdByUserId: context.userId,
      expiresAt,
    },
  });
}

export async function confirmHold(context: AuthContext, holdId: string) {
  return prisma.$transaction(async (transaction) => {
    const hold = await transaction.appointmentHold.findFirst({
      where: {
        id: holdId,
        companyId: context.companyId,
        status: "HELD",
        expiresAt: { gt: new Date() },
      },
    });
    if (!hold)
      throw new AppError(
        "APPOINTMENT_HOLD_UNAVAILABLE",
        "Appointment hold is no longer available",
        409,
      );

    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${context.companyId}:${hold.windowStart.toISOString().slice(0, 10)}`}))`;
    const conflict = await transaction.job.findFirst({
      where: {
        companyId: context.companyId,
        id: { not: hold.jobId ?? undefined },
        assignedTechnicianId: hold.technicianId,
        scheduledStart: { lt: hold.windowEnd },
        scheduledEnd: { gt: hold.windowStart },
        status: { notIn: ["CANCELLED", "COMPLETED"] },
      },
      select: { id: true },
    });
    if (conflict)
      throw new AppError(
        "SLOT_UNAVAILABLE",
        "The appointment window is no longer available",
        409,
      );

    const job = hold.jobId
      ? await transaction.job.findFirst({
          where: { id: hold.jobId, companyId: context.companyId },
          select: { status: true },
        })
      : null;
    if (!job)
      throw new AppError("RESOURCE_NOT_FOUND", "Booking job not found", 404);
    const nextStatus =
      job.status === "NEW" || job.status === "QUOTING"
        ? "SCHEDULED"
        : job.status;
    const updatedJob = await transaction.job.updateMany({
      where: {
        id: hold.jobId!,
        companyId: context.companyId,
        status: job.status,
      },
      data: {
        assignedTechnicianId: hold.technicianId,
        scheduledStart: hold.windowStart,
        scheduledEnd: hold.windowEnd,
        status: nextStatus,
      },
    });
    if (updatedJob.count !== 1)
      throw new AppError(
        "JOB_STATE_CHANGED",
        "Job changed while booking; please retry",
        409,
      );
    await transaction.appointmentHold.update({
      where: { id: hold.id },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });
    return transaction.job.findFirstOrThrow({
      where: { id: hold.jobId!, companyId: context.companyId },
      select: {
        id: true,
        status: true,
        scheduledStart: true,
        scheduledEnd: true,
      },
    });
  });
}

export async function expireBookingRecords() {
  const now = new Date();
  await prisma.appointmentHold.updateMany({
    where: { status: "HELD", expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });
  await prisma.appointmentProposal.updateMany({
    where: { status: "OPEN", expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });
}

export function startBookingSweepScheduler() {
  const sweep = () => {
    void expireBookingRecords().catch((error: unknown) => {
      logger.error({ error }, "Booking expiry sweep failed");
    });
  };
  sweep();
  const timer = setInterval(sweep, 60_000);
  timer.unref();
  return () => clearInterval(timer);
}

export async function getBookingConfig(context: AuthContext) {
  const [company, businessHours, workingHours, timeOff] = await Promise.all([
    prisma.company.findUniqueOrThrow({
      where: { id: context.companyId },
      select: { timezone: true, travelBufferMinutes: true, bookingMode: true },
    }),
    prisma.companyBusinessHours.findMany({
      where: { companyId: context.companyId },
      orderBy: { weekday: "asc" },
    }),
    prisma.technicianWorkingHours.findMany({
      where: { companyId: context.companyId },
      orderBy: [{ technicianId: "asc" }, { weekday: "asc" }],
    }),
    prisma.technicianTimeOff.findMany({
      where: { companyId: context.companyId, endsAt: { gt: new Date() } },
      orderBy: { startsAt: "asc" },
    }),
  ]);
  return jsonSafe({ company, businessHours, workingHours, timeOff });
}

export async function updateBookingConfig(
  context: AuthContext,
  input: {
    travelBufferMinutes: number;
    bookingMode: "DISPATCHER_CONFIRMS" | "SELF_SERVE_WINDOWS";
    businessHours: Array<{ weekday: number; open: string; close: string }>;
  },
) {
  await prisma.$transaction(async (transaction) => {
    await transaction.company.update({
      where: { id: context.companyId },
      data: {
        travelBufferMinutes: input.travelBufferMinutes,
        bookingMode: input.bookingMode,
      },
    });
    await transaction.companyBusinessHours.deleteMany({
      where: { companyId: context.companyId },
    });
    if (input.businessHours.length > 0) {
      await transaction.companyBusinessHours.createMany({
        data: input.businessHours.map((hours) => ({
          ...hours,
          companyId: context.companyId,
        })),
      });
    }
  });
  return getBookingConfig(context);
}

export async function listUnscheduledJobs(context: AuthContext) {
  const jobs = await prisma.job.findMany({
    where: {
      companyId: context.companyId,
      scheduledStart: null,
      status: { in: ["NEW", "QUOTING"] },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: 100,
    select: {
      id: true,
      jobNumber: true,
      serviceType: true,
      priority: true,
      status: true,
      createdAt: true,
      customer: { select: { firstName: true, lastName: true } },
      assignedTechnician: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
  });
  return jsonSafe(jobs);
}
