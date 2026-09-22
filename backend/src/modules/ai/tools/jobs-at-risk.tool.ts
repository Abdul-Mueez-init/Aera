import { z } from "zod";
import { AppError } from "../../../common/errors.js";
import { prisma } from "../../../db/prisma.js";
import {
  dayBoundsInTimezone,
  getCompanyTimezone,
  todayInTimezone,
} from "./timezone.util.js";
import type {
  ToolContext,
  ToolDefinition,
  ToolParameterSchema,
} from "./types.js";

/**
 * "Which jobs are at risk today, and why?" — the Phase-11 demo moment
 * (plan.md, 2:55). Every risk reason below is derived from fields already
 * on `Job`; nothing is inferred or guessed by a model — that is the whole
 * point of ADR-010 (AI is a tool caller, not an authority).
 *
 * This tool previously used the UTC-day convention shared with
 * `listTechnicianToday`, and ad hoc 2h/3h/24h thresholds, "for consistency
 * with the rest of the codebase" rather than following the actual decided
 * rules. That has been corrected here:
 *  - "today" defaults to the asking company's own `Company.timezone`, not
 *    UTC (see timezone.util.ts);
 *  - a job is flagged "late" once more than 15 minutes have passed its
 *    scheduledStart while it is still sitting in NEW/QUOTING/SCHEDULED —
 *    replacing the old 2h look-ahead "imminent unassigned" heuristic;
 *  - a job's assigned technician being at or over the 6-job/day workload
 *    threshold (the same threshold get_schedule_workload uses to flag
 *    technician overload) is now itself a risk reason.
 *
 * The long-running-in-progress (3h) and stuck-in-waiting-parts (24h)
 * signals are duration-based (elapsed time is the same in any timezone)
 * and are unaffected by the timezone fix; they're kept as-is since they
 * were not part of the timezone/threshold correction.
 */

const LATE_START_MS = 15 * 60 * 1000; // 15 minutes past scheduled start
const LONG_RUNNING_MS = 3 * 60 * 60 * 1000; // 3h continuously IN_PROGRESS
const STUCK_WAITING_PARTS_MS = 24 * 60 * 60 * 1000; // 24h in WAITING_PARTS
const OVERLOAD_JOB_COUNT = 6; // shared technician-workload threshold

export const jobsAtRiskInputSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
    .optional(),
});
export type JobsAtRiskInput = z.infer<typeof jobsAtRiskInputSchema>;

export const jobsAtRiskParameters: ToolParameterSchema = {
  type: "object",
  properties: {
    date: {
      type: "string",
      description:
        "Optional ISO date (YYYY-MM-DD) to check, in the company's own timezone. Defaults to today.",
    },
  },
};

interface AtRiskJob {
  jobId: string;
  jobNumber: number;
  customerName: string;
  serviceType: string;
  priority: string;
  status: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  assignedTechnician: string | null;
  riskReasons: string[];
}

export interface JobsAtRiskResult {
  date: string;
  timezone: string;
  generatedAt: string;
  atRiskCount: number;
  jobs: AtRiskJob[];
}

function hoursSince(from: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / 3_600_000));
}

function minutesSince(from: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / 60_000));
}

export async function getJobsAtRisk(
  context: ToolContext,
  input: JobsAtRiskInput,
): Promise<JobsAtRiskResult> {
  const timezone = await getCompanyTimezone(context.companyId);
  const dateStr = input.date ?? todayInTimezone(timezone);

  let dayBounds;
  try {
    dayBounds = dayBoundsInTimezone(dateStr, timezone);
  } catch {
    throw new AppError("VALIDATION_FAILED", "Invalid date", 422);
  }
  const { start: dayStart, end: dayEnd } = dayBounds;
  const now = new Date();

  // Candidate set: anything scheduled for the target company-local day,
  // plus anything currently active regardless of date (so an overrun from
  // yesterday, or an urgent job nobody has scheduled yet, still surfaces).
  const jobs = await prisma.job.findMany({
    where: {
      companyId: context.companyId,
      status: { notIn: ["COMPLETED", "CANCELLED"] },
      OR: [
        { scheduledStart: { gte: dayStart, lt: dayEnd } },
        { status: { in: ["IN_PROGRESS", "WAITING_PARTS", "EN_ROUTE"] } },
        { priority: "URGENT", status: { in: ["NEW", "QUOTING"] } },
      ],
    },
    select: {
      id: true,
      jobNumber: true,
      serviceType: true,
      priority: true,
      status: true,
      scheduledStart: true,
      scheduledEnd: true,
      startedAt: true,
      updatedAt: true,
      assignedTechnicianId: true,
      customer: { select: { firstName: true, lastName: true } },
      assignedTechnician: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ scheduledStart: "asc" }, { createdAt: "asc" }],
  });

  // Per-technician job counts for the same company-local day, so a job's
  // assigned technician being overloaded (>= 6 jobs today) can be surfaced
  // as one of that job's own risk reasons.
  const workloadGroups = await prisma.job.groupBy({
    by: ["assignedTechnicianId"],
    where: {
      companyId: context.companyId,
      assignedTechnicianId: { not: null },
      scheduledStart: { gte: dayStart, lt: dayEnd },
      status: { notIn: ["CANCELLED", "COMPLETED"] },
    },
    _count: { _all: true },
  });
  const technicianJobCounts = new Map<string, number>();
  for (const group of workloadGroups) {
    if (group.assignedTechnicianId) {
      technicianJobCounts.set(group.assignedTechnicianId, group._count._all);
    }
  }

  const atRisk: AtRiskJob[] = [];

  for (const job of jobs) {
    const reasons: string[] = [];

    if (job.scheduledEnd && job.scheduledEnd.getTime() < now.getTime()) {
      reasons.push(
        `Scheduled window ended ${hoursSince(job.scheduledEnd, now)}h ago and the job is still ${job.status}`,
      );
    }

    if (
      job.scheduledStart &&
      ["NEW", "QUOTING", "SCHEDULED"].includes(job.status) &&
      now.getTime() - job.scheduledStart.getTime() > LATE_START_MS
    ) {
      const minutesLate = minutesSince(job.scheduledStart, now);
      reasons.push(
        job.assignedTechnicianId
          ? `Scheduled to start ${minutesLate}m ago and still ${job.status}`
          : `Unassigned and ${minutesLate}m past its scheduled start`,
      );
    }

    if (
      job.status === "IN_PROGRESS" &&
      job.startedAt &&
      now.getTime() - job.startedAt.getTime() > LONG_RUNNING_MS
    ) {
      reasons.push(`In progress for over ${hoursSince(job.startedAt, now)}h`);
    }

    if (
      job.status === "WAITING_PARTS" &&
      now.getTime() - job.updatedAt.getTime() > STUCK_WAITING_PARTS_MS
    ) {
      reasons.push(
        `Waiting on parts for over ${hoursSince(job.updatedAt, now)}h`,
      );
    }

    if (job.priority === "URGENT" && ["NEW", "QUOTING"].includes(job.status)) {
      reasons.push("Urgent priority job is still unscheduled");
    }

    if (job.assignedTechnicianId) {
      const techJobCount = technicianJobCounts.get(job.assignedTechnicianId);
      if (techJobCount !== undefined && techJobCount >= OVERLOAD_JOB_COUNT) {
        reasons.push(
          `Assigned technician has ${techJobCount} jobs today (at/over the ${OVERLOAD_JOB_COUNT}-job workload threshold)`,
        );
      }
    }

    if (reasons.length === 0) {
      continue;
    }

    atRisk.push({
      jobId: job.id,
      jobNumber: job.jobNumber,
      customerName: `${job.customer.firstName} ${job.customer.lastName}`,
      serviceType: job.serviceType,
      priority: job.priority,
      status: job.status,
      scheduledStart: job.scheduledStart?.toISOString() ?? null,
      scheduledEnd: job.scheduledEnd?.toISOString() ?? null,
      assignedTechnician: job.assignedTechnician
        ? `${job.assignedTechnician.firstName} ${job.assignedTechnician.lastName}`
        : null,
      riskReasons: reasons,
    });
  }

  return {
    date: dateStr,
    timezone,
    generatedAt: now.toISOString(),
    atRiskCount: atRisk.length,
    jobs: atRisk,
  };
}

export const jobsAtRiskTool: ToolDefinition<JobsAtRiskInput, JobsAtRiskResult> =
  {
    name: "get_jobs_at_risk",
    description:
      "Lists today's jobs (plus any job still active from an earlier day) that show a concrete risk signal: an overrun schedule window, a job more than 15 minutes past its scheduled start that hasn't moved past SCHEDULED, a long-running in-progress job, a parts-wait stall, an unscheduled urgent job, or an assigned technician at/over the 6-job daily workload threshold. Each job includes the specific reason(s) it was flagged. 'Today' is the company's own local day.",
    inputSchema: jobsAtRiskInputSchema,
    parameters: jobsAtRiskParameters,
    execute: getJobsAtRisk,
  };