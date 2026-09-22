import { z } from "zod";
import { AppError } from "../../../common/errors.js";
import { prisma } from "../../../db/prisma.js";
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
 * "Today" uses the same UTC-day convention as `listTechnicianToday` in
 * job.service.ts, for consistency with the rest of the codebase rather
 * than introducing new per-company-timezone logic here.
 */

const UNASSIGNED_IMMINENT_MS = 2 * 60 * 60 * 1000; // 2h before a scheduled start
const LONG_RUNNING_MS = 3 * 60 * 60 * 1000; // 3h continuously IN_PROGRESS
const STUCK_WAITING_PARTS_MS = 24 * 60 * 60 * 1000; // 24h in WAITING_PARTS

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
        "Optional ISO date (YYYY-MM-DD) to check. Defaults to today (UTC).",
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
  generatedAt: string;
  atRiskCount: number;
  jobs: AtRiskJob[];
}

function hoursSince(from: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / 3_600_000));
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getJobsAtRisk(
  context: ToolContext,
  input: JobsAtRiskInput,
): Promise<JobsAtRiskResult> {
  const dateStr = input.date ?? todayIso();
  const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(dayStart.getTime())) {
    throw new AppError("VALIDATION_FAILED", "Invalid date", 422);
  }
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
  const now = new Date();

  // Candidate set: anything scheduled for the target day, plus anything
  // currently active regardless of date (so an overrun from yesterday, or
  // an urgent job nobody has scheduled yet, still surfaces).
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

  const atRisk: AtRiskJob[] = [];

  for (const job of jobs) {
    const reasons: string[] = [];

    if (job.scheduledEnd && job.scheduledEnd.getTime() < now.getTime()) {
      reasons.push(
        `Scheduled window ended ${hoursSince(job.scheduledEnd, now)}h ago and the job is still ${job.status}`,
      );
    }

    if (
      !job.assignedTechnicianId &&
      job.scheduledStart &&
      job.scheduledStart.getTime() - now.getTime() <= UNASSIGNED_IMMINENT_MS
    ) {
      reasons.push(
        job.scheduledStart.getTime() <= now.getTime()
          ? "Unassigned and already past its scheduled start"
          : "Unassigned with under 2 hours until its scheduled start",
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
    generatedAt: now.toISOString(),
    atRiskCount: atRisk.length,
    jobs: atRisk,
  };
}

export const jobsAtRiskTool: ToolDefinition<JobsAtRiskInput, JobsAtRiskResult> =
  {
    name: "get_jobs_at_risk",
    description:
      "Lists today's jobs (plus any job still active from an earlier day) that show a concrete risk signal: an overrun schedule window, no technician assigned close to the start time, a long-running in-progress job, a parts-wait stall, or an unscheduled urgent job. Each job includes the specific reason(s) it was flagged.",
    inputSchema: jobsAtRiskInputSchema,
    parameters: jobsAtRiskParameters,
    execute: getJobsAtRisk,
  };