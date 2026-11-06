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

// --- Company-timezone wall-clock helpers ---------------------------------
// Business/working hours are stored as local "HH:mm" wall-clock strings plus
// the company timezone (never fixed UTC offsets). Conversion uses the
// platform tz database via Intl — no hand-rolled offset math.

const tzFormatterCache = new Map<string, Intl.DateTimeFormat>();

function tzFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = tzFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    tzFormatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/** Offset of `timeZone` at `instant`, in milliseconds (local − UTC). */
function tzOffsetMs(timeZone: string, instant: Date): number {
  const parts = tzFormatter(timeZone).formatToParts(instant);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return asUtc - instant.getTime();
}

/** Convert a wall-clock time in `timeZone` to a UTC instant. */
export function zonedTimeToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const wallUtc = Date.UTC(year, month - 1, day, hour, minute);
  // Two passes converge except inside a DST transition gap, where the
  // result lands on the post-transition side — acceptable for scheduling.
  let instant = wallUtc - tzOffsetMs(timeZone, new Date(wallUtc));
  instant = wallUtc - tzOffsetMs(timeZone, new Date(instant));
  return new Date(instant);
}

interface LocalDate {
  year: number;
  month: number;
  day: number;
}

function localDateOf(timeZone: string, instant: Date): LocalDate {
  const parts = tzFormatter(timeZone).formatToParts(instant);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function nextLocalDate(date: LocalDate): LocalDate {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + 1));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

function localWeekday(date: LocalDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
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
  context: { companyId: string },
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
      select: { travelBufferMinutes: true, timezone: true },
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
  const timeZone = company.timezone || "UTC";
  const toMinutes = (value: string) => {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
  };
  // Expand the requested instant range into company-local calendar dates,
  // then convert each "HH:mm" wall-clock window back to instants. This is
  // DST- and midnight-crossing-safe (close <= open rolls to next day).
  const firstLocal = localDateOf(timeZone, startsAt);
  const lastLocal = localDateOf(timeZone, endsAt);
  const localDates: LocalDate[] = [];
  for (
    let cursor = firstLocal;
    ;
    cursor = nextLocalDate(cursor)
  ) {
    localDates.push(cursor);
    const same =
      cursor.year === lastLocal.year &&
      cursor.month === lastLocal.month &&
      cursor.day === lastLocal.day;
    if (same) break;
    if (localDates.length > 400) break; // safety bound
  }
  const intervalsFor = (technicianId: string) => {
    const configured = workingHours.filter(
      (hours) => hours.technicianId === technicianId,
    );
    const source = configured.length > 0 ? configured : businessHours;
    const intervals: Array<{ startsAt: Date; endsAt: Date }> = [];
    for (const date of localDates) {
      const weekday = localWeekday(date);
      for (const hours of source.filter((entry) => entry.weekday === weekday)) {
        const openMin = toMinutes(hours.open);
        const closeMin = toMinutes(hours.close);
        const overnight = closeMin <= openMin;
        const start = zonedTimeToUtc(
          timeZone,
          date.year,
          date.month,
          date.day,
          Math.floor(openMin / 60),
          openMin % 60,
        );
        const endDate = overnight ? nextLocalDate(date) : date;
        const end = zonedTimeToUtc(
          timeZone,
          endDate.year,
          endDate.month,
          endDate.day,
          Math.floor(closeMin / 60),
          closeMin % 60,
        );
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
  context: { companyId: string },
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
  context: { companyId: string; userId?: string },
  input: {
    jobId?: string;
    requestId?: string;
    quoteId?: string;
    technicianId?: string;
    windowStart: Date;
    windowEnd: Date;
  },
) {
  assertWindow(input.windowStart, input.windowEnd);
  const references = [input.jobId, input.requestId, input.quoteId].filter(
    Boolean,
  );
  if (references.length !== 1) {
    throw new AppError(
      "VALIDATION_FAILED",
      "A hold must reference exactly one of job, request or quote",
      422,
    );
  }
  const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60_000);
  return prisma.appointmentHold.create({
    data: {
      companyId: context.companyId,
      jobId: input.jobId,
      requestId: input.requestId,
      quoteId: input.quoteId,
      technicianId: input.technicianId,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      createdByUserId: context.userId,
      expiresAt,
    },
  });
}

export async function confirmHold(
  context: { companyId: string; userId?: string },
  holdId: string,
) {
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

    // Serialize confirmations per company+day so parallel confirms cannot
    // double-book the same capacity.
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${context.companyId}:${hold.windowStart.toISOString().slice(0, 10)}`}))`;

    const company = await transaction.company.findUniqueOrThrow({
      where: { id: context.companyId },
      select: { travelBufferMinutes: true },
    });
    const bufferMs = company.travelBufferMinutes * 60_000;
    const bufferStart = new Date(hold.windowStart.getTime() - bufferMs);
    const bufferEnd = new Date(hold.windowEnd.getTime() + bufferMs);

    const overlappingJobs = await transaction.job.findMany({
      where: {
        companyId: context.companyId,
        id: { not: hold.jobId ?? undefined },
        scheduledStart: { lt: bufferEnd },
        scheduledEnd: { gt: bufferStart },
        status: { notIn: ["CANCELLED", "COMPLETED"] },
        ...(hold.technicianId
          ? { assignedTechnicianId: hold.technicianId }
          : {}),
      },
      select: { id: true, assignedTechnicianId: true },
    });
    // Only CONFIRMED holds consume capacity — HELD holds are tentative and
    // expire on their own. The advisory lock serializes confirms, so a
    // concurrent winner's CONFIRMED hold is visible to the loser.
    const overlappingHolds = await transaction.appointmentHold.findMany({
      where: {
        companyId: context.companyId,
        id: { not: hold.id },
        status: "CONFIRMED",
        windowStart: { lt: bufferEnd },
        windowEnd: { gt: bufferStart },
      },
      select: { id: true, technicianId: true },
    });

    const slotTaken = (() => {
      if (hold.technicianId) {
        // Per-technician capacity: this tech's jobs plus holds pinned to
        // them or unpinned (conservatively consume shared capacity).
        const techJob = overlappingJobs.some(
          (job) => job.assignedTechnicianId === hold.technicianId,
        );
        const techHold = overlappingHolds.some(
          (other) =>
            other.technicianId === hold.technicianId ||
            other.technicianId === null,
        );
        return techJob || techHold;
      }
      // Unassigned hold: capacity = active technicians. Count every
      // overlapping booking against it.
      return false; // handled by capacity check below
    })();

    if (slotTaken) {
      throw new AppError(
        "SLOT_UNAVAILABLE",
        "The appointment window is no longer available",
        409,
      );
    }

    if (!hold.technicianId) {
      const [activeTechs, booked] = await Promise.all([
        transaction.companyMember.count({
          where: {
            companyId: context.companyId,
            role: "TECHNICIAN",
            status: "ACTIVE",
          },
        }),
        Promise.resolve(overlappingJobs.length + overlappingHolds.length),
      ]);
      if (booked >= activeTechs) {
        throw new AppError(
          "SLOT_UNAVAILABLE",
          "The appointment window is no longer available",
          409,
        );
      }
    }

    // Job-linked hold: schedule the existing job (requires a technician).
    if (hold.jobId) {
      const job = await transaction.job.findFirst({
        where: { id: hold.jobId, companyId: context.companyId },
        select: { status: true, assignedTechnicianId: true },
      });
      if (!job)
        throw new AppError("RESOURCE_NOT_FOUND", "Booking job not found", 404);
      const technicianId = hold.technicianId ?? job.assignedTechnicianId;
      if (!technicianId) {
        throw new AppError(
          "JOB_REQUIRES_TECHNICIAN",
          "A technician must be assigned before confirming the booking",
          422,
        );
      }
      const nextStatus =
        job.status === "NEW" || job.status === "QUOTING"
          ? "SCHEDULED"
          : job.status;
      const updatedJob = await transaction.job.updateMany({
        where: {
          id: hold.jobId,
          companyId: context.companyId,
          status: job.status,
        },
        data: {
          assignedTechnicianId: technicianId,
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
    }

    // Quote-linked hold (SELF_SERVE_WINDOWS): confirming resumes the
    // accepted-quote flow — creates the job exactly once via the
    // sourceQuoteId unique constraint.
    if (hold.quoteId) {
      const { resumeAcceptedQuoteBooking } = await import(
        "../quotes/quote.service.js"
      );
      await resumeAcceptedQuoteBooking(transaction, {
        companyId: context.companyId,
        quoteId: hold.quoteId,
        actorUserId: context.userId,
        schedule: hold.technicianId
          ? {
              technicianId: hold.technicianId,
              windowStart: hold.windowStart,
              windowEnd: hold.windowEnd,
            }
          : undefined,
      });
    }

    await transaction.appointmentHold.update({
      where: { id: hold.id },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });

    return transaction.appointmentHold.findFirstOrThrow({
      where: { id: hold.id, companyId: context.companyId },
      select: {
        id: true,
        status: true,
        jobId: true,
        quoteId: true,
        windowStart: true,
        windowEnd: true,
      },
    });
  });
}

/**
 * Phase 5.5 — customer-initiated reschedule request. The customer's
 * preferred windows become an OPEN proposal the dispatcher can pick and
 * confirm through the normal hold flow; staff are notified.
 */
export async function requestCustomerReschedule(
  context: CustomerBookingContext,
  jobId: string,
  windows: Array<{ startsAt: Date; endsAt: Date }>,
  expiresAt: Date,
) {
  const job = await prisma.job.findFirst({
    where: {
      id: jobId,
      companyId: context.companyId,
      customerId: context.customerId,
    },
    select: { id: true, status: true },
  });
  if (!job) throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  if (job.status !== "SCHEDULED") {
    throw new AppError(
      "JOB_NOT_RESCHEDULABLE",
      "Only scheduled jobs can be rescheduled",
      409,
    );
  }
  const proposal = await createProposal(context, {
    jobId,
    windows,
    expiresAt,
  });
  const { notificationPublisher } = await import(
    "../notifications/notification.port.js"
  );
  void notificationPublisher.publish({
    type: "JOB_RESCHEDULED",
    companyId: context.companyId,
    jobId,
  });
  return jsonSafe(proposal);
}

export async function listProposals(
  context: AuthContext,
  filters: { status?: string; requestId?: string; jobId?: string; quoteId?: string },
) {
  const proposals = await prisma.appointmentProposal.findMany({
    where: {
      companyId: context.companyId,
      ...(filters.status ? { status: filters.status as never } : {}),
      ...(filters.requestId ? { requestId: filters.requestId } : {}),
      ...(filters.jobId ? { jobId: filters.jobId } : {}),
      ...(filters.quoteId ? { quoteId: filters.quoteId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      request: { select: { id: true, status: true } },
      job: { select: { id: true, jobNumber: true, status: true } },
      quote: { select: { id: true, status: true } },
    },
  });
  return jsonSafe(proposals);
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

// --- Customer (portal workspace) booking ---------------------------------

export interface CustomerBookingContext {
  companyId: string;
  customerId: string;
  userId?: string;
}

/** Verify a hold/proposal reference belongs to this customer. */
async function assertCustomerBookingReference(
  context: CustomerBookingContext,
  input: { requestId?: string; jobId?: string; quoteId?: string },
) {
  const references = [input.requestId, input.jobId, input.quoteId].filter(
    Boolean,
  );
  if (references.length !== 1) {
    throw new AppError(
      "VALIDATION_FAILED",
      "Reference exactly one of request, job or quote",
      422,
    );
  }
  if (input.requestId) {
    const found = await prisma.serviceRequest.findFirst({
      where: {
        id: input.requestId,
        companyId: context.companyId,
        customerId: context.customerId,
      },
      select: { id: true },
    });
    if (!found)
      throw new AppError("RESOURCE_NOT_FOUND", "Request not found", 404);
  } else if (input.jobId) {
    const found = await prisma.job.findFirst({
      where: {
        id: input.jobId,
        companyId: context.companyId,
        customerId: context.customerId,
      },
      select: { id: true },
    });
    if (!found)
      throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  } else if (input.quoteId) {
    const found = await prisma.quote.findFirst({
      where: {
        id: input.quoteId!,
        companyId: context.companyId,
        customerId: context.customerId,
      },
      select: { id: true },
    });
    if (!found)
      throw new AppError("RESOURCE_NOT_FOUND", "Quote not found", 404);
  }
}

/** Open/picked proposals visible to the workspace customer. */
export async function listCustomerProposals(context: CustomerBookingContext) {
  const proposals = await prisma.appointmentProposal.findMany({
    where: {
      companyId: context.companyId,
      status: { in: ["OPEN", "PICKED"] },
      OR: [
        { request: { customerId: context.customerId } },
        { job: { customerId: context.customerId } },
        { quote: { customerId: context.customerId } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      requestId: true,
      jobId: true,
      quoteId: true,
      windows: true,
      pickedWindow: true,
      status: true,
      expiresAt: true,
      pickedAt: true,
      createdAt: true,
    },
  });
  return jsonSafe(proposals);
}

export async function createCustomerHold(
  context: CustomerBookingContext,
  input: {
    requestId?: string;
    jobId?: string;
    quoteId?: string;
    windowStart: Date;
    windowEnd: Date;
  },
) {
  await assertCustomerBookingReference(context, input);
  return jsonSafe(
    await createHold(context, {
      requestId: input.requestId,
      jobId: input.jobId,
      quoteId: input.quoteId,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
    }),
  );
}

export async function confirmCustomerHold(
  context: CustomerBookingContext,
  holdId: string,
) {
  const hold = await prisma.appointmentHold.findFirst({
    where: { id: holdId, companyId: context.companyId },
    select: {
      id: true,
      requestId: true,
      jobId: true,
      quoteId: true,
      request: { select: { customerId: true } },
      job: { select: { customerId: true } },
      quote: { select: { customerId: true } },
    },
  });
  const ownerId =
    hold?.request?.customerId ?? hold?.job?.customerId ?? hold?.quote?.customerId;
  if (!hold || ownerId !== context.customerId) {
    throw new AppError("RESOURCE_NOT_FOUND", "Hold not found", 404);
  }
  return jsonSafe(await confirmHold(context, holdId));
}

// --- Technician working hours & time off ---------------------------------

async function assertCompanyTechnician(companyId: string, userId: string) {
  const member = await prisma.companyMember.findFirst({
    where: { companyId, userId, role: "TECHNICIAN", status: "ACTIVE" },
    select: { userId: true },
  });
  if (!member) {
    throw new AppError(
      "RESOURCE_NOT_FOUND",
      "Technician not found in this company",
      404,
    );
  }
}

export async function getTeamAvailability(context: AuthContext) {
  const [members, workingHours, timeOff] = await Promise.all([
    prisma.companyMember.findMany({
      where: {
        companyId: context.companyId,
        role: "TECHNICIAN",
        status: "ACTIVE",
      },
      select: {
        userId: true,
        user: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { user: { lastName: "asc" } },
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
  return jsonSafe({
    technicians: members.map((member) => ({
      userId: member.userId,
      name: `${member.user.firstName} ${member.user.lastName}`.trim(),
      email: member.user.email,
      workingHours: workingHours.filter(
        (hours) => hours.technicianId === member.userId,
      ),
    })),
    timeOff,
  });
}

export async function setTechnicianWorkingHours(
  context: AuthContext,
  technicianId: string,
  hours: Array<{ weekday: number; open: string; close: string }>,
) {
  await assertCompanyTechnician(context.companyId, technicianId);
  await prisma.$transaction(async (transaction) => {
    await transaction.technicianWorkingHours.deleteMany({
      where: { companyId: context.companyId, technicianId },
    });
    if (hours.length > 0) {
      await transaction.technicianWorkingHours.createMany({
        data: hours.map((entry) => ({
          companyId: context.companyId,
          technicianId,
          ...entry,
        })),
      });
    }
  });
  return getTeamAvailability(context);
}

export async function createTimeOff(
  context: AuthContext,
  input: {
    technicianId: string;
    startsAt: Date;
    endsAt: Date;
    reason?: string;
  },
) {
  assertWindow(input.startsAt, input.endsAt);
  await assertCompanyTechnician(context.companyId, input.technicianId);
  return jsonSafe(
    await prisma.technicianTimeOff.create({
      data: { companyId: context.companyId, ...input },
    }),
  );
}

export async function deleteTimeOff(context: AuthContext, timeOffId: string) {
  const deleted = await prisma.technicianTimeOff.deleteMany({
    where: { id: timeOffId, companyId: context.companyId },
  });
  if (deleted.count !== 1) {
    throw new AppError("RESOURCE_NOT_FOUND", "Time off not found", 404);
  }
  return { deleted: true };
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
