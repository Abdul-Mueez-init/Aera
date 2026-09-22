import { z } from "zod";
import { prisma } from "../../../db/prisma.js";
import {
  dayBoundsInTimezone,
  getCompanyTimezone,
  monthStartDateStr,
  todayInTimezone,
} from "./timezone.util.js";
import type {
  ToolContext,
  ToolDefinition,
  ToolParameterSchema,
} from "./types.js";

/**
 * "What's our revenue this month? How many jobs are unassigned?" — Phase 11
 * Slice C2, the analytics half of PRD.md §H ("answer metrics questions
 * using server-authorized data") and the MVP dashboard metrics in
 * PRD.md §4 (today's jobs, jobs by status, unassigned jobs, outstanding
 * invoices, revenue collected this month).
 *
 * No `/dashboard/*` module exists yet (architecture.md §9's routes are
 * unbuilt per the Phase 9-11 handoff), so this tool computes the same
 * numbers directly against Prisma rather than depending on unbuilt code.
 * If/when a dashboard service is built, this should call into it instead
 * of duplicating the queries.
 *
 * "Today" and "this month" are both computed in the company's own
 * timezone, not UTC — the same decided convention as get_jobs_at_risk and
 * get_schedule_workload.
 *
 * "Jobs by status" and "unassigned jobs" intentionally exclude COMPLETED
 * and CANCELLED: an owner asking for a status breakdown wants the live
 * pipeline, not all-time history.
 */

const LIVE_STATUSES = [
  "NEW",
  "QUOTING",
  "SCHEDULED",
  "EN_ROUTE",
  "IN_PROGRESS",
  "WAITING_PARTS",
];
const OUTSTANDING_INVOICE_STATUSES = ["ISSUED", "PARTIALLY_PAID", "OVERDUE"];

export const businessMetricsInputSchema = z.object({});
export type BusinessMetricsInput = z.infer<typeof businessMetricsInputSchema>;

export const businessMetricsParameters: ToolParameterSchema = {
  type: "object",
  properties: {},
};

interface CurrencyAmount {
  currency: string;
  totalMinor: string;
}

export interface BusinessMetricsResult {
  date: string;
  timezone: string;
  generatedAt: string;
  jobsToday: number;
  jobsByStatus: Array<{ status: string; count: number }>;
  unassignedJobs: number;
  outstandingInvoices: {
    count: number;
    balanceDueByCurrency: CurrencyAmount[];
  };
  revenueThisMonth: {
    periodStart: string;
    periodEnd: string;
    collectedByCurrency: CurrencyAmount[];
  };
}

export async function getBusinessMetrics(
  context: ToolContext,
): Promise<BusinessMetricsResult> {
  const timezone = await getCompanyTimezone(context.companyId);
  const dateStr = todayInTimezone(timezone);
  const now = new Date();

  const todayBounds = dayBoundsInTimezone(dateStr, timezone);
  const monthBounds = dayBoundsInTimezone(monthStartDateStr(dateStr), timezone);

  const [jobsToday, statusGroups, unassignedJobs, outstandingGroups, revenueGroups] =
    await Promise.all([
      prisma.job.count({
        where: {
          companyId: context.companyId,
          scheduledStart: { gte: todayBounds.start, lt: todayBounds.end },
          status: { not: "CANCELLED" },
        },
      }),
      prisma.job.groupBy({
        by: ["status"],
        where: { companyId: context.companyId, status: { in: LIVE_STATUSES } },
        _count: { _all: true },
      }),
      prisma.job.count({
        where: {
          companyId: context.companyId,
          status: { in: LIVE_STATUSES },
          assignedTechnicianId: null,
        },
      }),
      prisma.invoice.groupBy({
        by: ["currency"],
        where: {
          companyId: context.companyId,
          status: { in: OUTSTANDING_INVOICE_STATUSES },
        },
        _count: { _all: true },
        _sum: { balanceDueMinor: true },
      }),
      prisma.payment.groupBy({
        by: ["currency"],
        where: {
          companyId: context.companyId,
          receivedAt: { gte: monthBounds.start, lt: now },
        },
        _sum: { amountMinor: true },
      }),
    ]);

  return {
    date: dateStr,
    timezone,
    generatedAt: now.toISOString(),
    jobsToday,
    jobsByStatus: statusGroups.map((row) => ({
      status: row.status,
      count: row._count._all,
    })),
    unassignedJobs,
    outstandingInvoices: {
      count: outstandingGroups.reduce((sum, row) => sum + row._count._all, 0),
      balanceDueByCurrency: outstandingGroups.map((row) => ({
        currency: row.currency,
        totalMinor: (row._sum.balanceDueMinor ?? 0n).toString(),
      })),
    },
    revenueThisMonth: {
      periodStart: monthBounds.start.toISOString(),
      periodEnd: now.toISOString(),
      collectedByCurrency: revenueGroups.map((row) => ({
        currency: row.currency,
        totalMinor: (row._sum.amountMinor ?? 0n).toString(),
      })),
    },
  };
}

export const businessMetricsTool: ToolDefinition<
  BusinessMetricsInput,
  BusinessMetricsResult
> = {
  name: "get_business_metrics",
  description:
    "Returns current operational and financial metrics for the company: today's scheduled job count, a live-pipeline breakdown of jobs by status, how many live jobs are unassigned, outstanding invoice balances by currency, and revenue collected so far this month by currency. Figures are computed live from the database, scoped to the company, and use the company's own timezone for 'today'/'this month'. Takes no arguments.",
  inputSchema: businessMetricsInputSchema,
  parameters: businessMetricsParameters,
  execute: (context) => getBusinessMetrics(context),
};