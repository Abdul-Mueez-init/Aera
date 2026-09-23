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
 * "How does today's schedule look? Who's overloaded?" — Phase 11 Slice C2.
 * This tool was missing from the original Slice C delivery, which shipped
 * only get_jobs_at_risk and get_customer_job_history.
 *
 * Two decided thresholds drive this tool (shared conceptually with the
 * technician-overload risk reason in get_jobs_at_risk):
 *  - a job is "late" once more than 15 minutes have passed its
 *    scheduledStart while it is still sitting in NEW/QUOTING/SCHEDULED
 *    (i.e. nobody has headed out yet);
 *  - a technician is "overloaded" once 6 or more (non-cancelled,
 *    non-completed) jobs are scheduled to start on the target day.
 *
 * "Today" defaults to the asking company's own `Company.timezone`, not
 * UTC — see timezone.util.ts for why.
 */

const LATE_THRESHOLD_MS = 15 * 60 * 1000;
const OVERLOAD_JOB_COUNT = 6;

export const scheduleWorkloadInputSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
    .optional(),
});
export type ScheduleWorkloadInput = z.infer<typeof scheduleWorkloadInputSchema>;

export const scheduleWorkloadParameters: ToolParameterSchema = {
  type: "object",
  properties: {
    date: {
      type: "string",
      description:
        "Optional ISO date (YYYY-MM-DD) to check, in the company's own timezone. Defaults to today.",
    },
  },
};

interface TechnicianWorkload {
  technicianId: string;
  name: string;
  jobCount: number;
  overloaded: boolean;
}

interface LateJob {
  jobId: string;
  jobNumber: number;
  customerName: string;
  scheduledStart: string;
  minutesLate: number;
  assignedTechnician: string | null;
  status: string;
}

export interface ScheduleWorkloadResult {
  date: string;
  timezone: string;
  generatedAt: string;
  totalJobs: number;
  unassignedJobCount: number;
  technicians: TechnicianWorkload[];
  lateJobs: LateJob[];
}

export async function getScheduleWorkload(
  context: ToolContext,
  input: ScheduleWorkloadInput,
): Promise<ScheduleWorkloadResult> {
  const timezone = await getCompanyTimezone(context.companyId);
  const dateStr = input.date ?? todayInTimezone(timezone);

  let bounds;
  try {
    bounds = dayBoundsInTimezone(dateStr, timezone);
  } catch {
    throw new AppError("VALIDATION_FAILED", "Invalid date", 422);
  }
  const now = new Date();

  const jobs = await prisma.job.findMany({
    where: {
      companyId: context.companyId,
      scheduledStart: { gte: bounds.start, lt: bounds.end },
      status: {
        in: [
          "NEW",
          "QUOTING",
          "SCHEDULED",
          "EN_ROUTE",
          "IN_PROGRESS",
          "WAITING_PARTS",
        ],
      },
    },
    select: {
      id: true,
      jobNumber: true,
      status: true,
      scheduledStart: true,
      assignedTechnicianId: true,
      customer: { select: { firstName: true, lastName: true } },
      assignedTechnician: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
    orderBy: { scheduledStart: "asc" },
  });

  const technicianCounts = new Map<string, { name: string; count: number }>();
  let unassignedJobCount = 0;
  const lateJobs: LateJob[] = [];

  for (const job of jobs) {
    if (job.assignedTechnicianId && job.assignedTechnician) {
      const existing = technicianCounts.get(job.assignedTechnicianId);
      const name = `${job.assignedTechnician.firstName} ${job.assignedTechnician.lastName}`;
      technicianCounts.set(job.assignedTechnicianId, {
        name,
        count: (existing?.count ?? 0) + 1,
      });
    } else {
      unassignedJobCount += 1;
    }

    if (
      job.scheduledStart &&
      ["NEW", "QUOTING", "SCHEDULED"].includes(job.status) &&
      now.getTime() - job.scheduledStart.getTime() > LATE_THRESHOLD_MS
    ) {
      lateJobs.push({
        jobId: job.id,
        jobNumber: job.jobNumber,
        customerName: `${job.customer.firstName} ${job.customer.lastName}`,
        scheduledStart: job.scheduledStart.toISOString(),
        minutesLate: Math.floor(
          (now.getTime() - job.scheduledStart.getTime()) / 60_000,
        ),
        assignedTechnician: job.assignedTechnician
          ? `${job.assignedTechnician.firstName} ${job.assignedTechnician.lastName}`
          : null,
        status: job.status,
      });
    }
  }

  const technicians: TechnicianWorkload[] = Array.from(
    technicianCounts.entries(),
  )
    .map(([technicianId, value]) => ({
      technicianId,
      name: value.name,
      jobCount: value.count,
      overloaded: value.count >= OVERLOAD_JOB_COUNT,
    }))
    .sort((a, b) => b.jobCount - a.jobCount);

  return {
    date: dateStr,
    timezone,
    generatedAt: now.toISOString(),
    totalJobs: jobs.length,
    unassignedJobCount,
    technicians,
    lateJobs,
  };
}

export const scheduleWorkloadTool: ToolDefinition<
  ScheduleWorkloadInput,
  ScheduleWorkloadResult
> = {
  name: "get_schedule_workload",
  description:
    "Returns today's (or a given date's) schedule load for the company: per-technician job counts with an overload flag at 6 or more jobs, how many scheduled jobs are still unassigned, and which jobs are more than 15 minutes past their scheduled start without having moved past SCHEDULED. Dates are interpreted in the company's own timezone.",
  inputSchema: scheduleWorkloadInputSchema,
  parameters: scheduleWorkloadParameters,
  execute: getScheduleWorkload,
};
