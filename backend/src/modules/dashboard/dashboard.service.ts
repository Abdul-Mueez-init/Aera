import { prisma } from "../../db/prisma.js";
import type { InvoiceStatus, JobStatus } from "../../generated/prisma/index.js";
import {
  dayBoundsInTimezone,
  getCompanyTimezone,
  monthStartDateStr,
  todayInTimezone,
} from "../ai/tools/timezone.util.js";

const LIVE_STATUSES: JobStatus[] = [
  "NEW",
  "QUOTING",
  "SCHEDULED",
  "EN_ROUTE",
  "IN_PROGRESS",
  "WAITING_PARTS",
];

const OUTSTANDING_INVOICE_STATUSES: InvoiceStatus[] = [
  "ISSUED",
  "PARTIALLY_PAID",
  "OVERDUE",
];

export interface DashboardSummary {
  date: string;
  timezone: string;
  jobsToday: number;
  jobsByStatus: Array<{ status: string; count: number }>;
  unassignedJobs: number;
  outstandingInvoices: {
    count: number;
    balanceDueByCurrency: Array<{ currency: string; totalMinor: string }>;
  };
  revenueThisMonth: {
    periodStart: string;
    periodEnd: string;
    collectedByCurrency: Array<{ currency: string; totalMinor: string }>;
  };
}

export interface TodayJob {
  id: string;
  jobNumber: string;
  customerName: string;
  serviceType: string;
  addressLine: string;
  technicianName: string | null;
  status: JobStatus;
  windowStart: string;
  windowEnd: string;
}

export interface DashboardToday {
  date: string;
  jobs: TodayJob[];
}

export interface Alert {
  type:
    "UNASSIGNED_JOB" | "PAST_START_TIME" | "LONG_RUNNING" | "OVERDUE_INVOICE";
  jobId?: string;
  jobNumber?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  customerName?: string;
  technicianName?: string;
  message: string;
  severity: "warning" | "error";
}

export interface DashboardAlerts {
  date: string;
  timezone: string;
  alerts: Alert[];
}

export async function getDashboardSummary(
  companyId: string,
): Promise<DashboardSummary> {
  const timezone = await getCompanyTimezone(companyId);
  const dateStr = todayInTimezone(timezone);
  const now = new Date();

  const todayBounds = dayBoundsInTimezone(dateStr, timezone);
  const monthBounds = dayBoundsInTimezone(monthStartDateStr(dateStr), timezone);

  const [
    jobsToday,
    statusGroups,
    unassignedJobs,
    outstandingGroups,
    revenueGroups,
  ] = await Promise.all([
    prisma.job.count({
      where: {
        companyId,
        scheduledStart: { gte: todayBounds.start, lt: todayBounds.end },
        status: { not: "CANCELLED" },
      },
    }),
    prisma.job.groupBy({
      by: ["status"],
      where: { companyId, status: { in: LIVE_STATUSES } },
      _count: { _all: true },
    }),
    prisma.job.count({
      where: {
        companyId,
        status: { in: LIVE_STATUSES },
        assignedTechnicianId: null,
      },
    }),
    prisma.invoice.groupBy({
      by: ["currency"],
      where: {
        companyId,
        status: { in: OUTSTANDING_INVOICE_STATUSES },
      },
      _count: { _all: true },
      _sum: { balanceDueMinor: true },
    }),
    prisma.payment.groupBy({
      by: ["currency"],
      where: {
        companyId,
        receivedAt: { gte: monthBounds.start, lt: now },
      },
      _sum: { amountMinor: true },
    }),
  ]);

  return {
    date: dateStr,
    timezone,
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

export async function getDashboardToday(
  companyId: string,
  limit: number = 50,
): Promise<DashboardToday> {
  const timezone = await getCompanyTimezone(companyId);
  const dateStr = todayInTimezone(timezone);
  const todayBounds = dayBoundsInTimezone(dateStr, timezone);

  const jobs = await prisma.job.findMany({
    where: {
      companyId,
      scheduledStart: { gte: todayBounds.start, lt: todayBounds.end },
      status: { not: "CANCELLED" },
    },
    orderBy: { scheduledStart: "asc" },
    take: limit,
    select: {
      id: true,
      jobNumber: true,
      serviceType: true,
      status: true,
      scheduledStart: true,
      scheduledEnd: true,
      customer: {
        select: { firstName: true, lastName: true },
      },
      serviceAddress: {
        select: { line1: true, city: true },
      },
      assignedTechnician: {
        select: { firstName: true, lastName: true },
      },
    },
  });

  return {
    date: dateStr,
    jobs: jobs
      .filter((job): job is typeof job & { scheduledStart: Date; scheduledEnd: Date } => job.scheduledStart !== null && job.scheduledEnd !== null)
      .map((job) => ({
        id: job.id,
        jobNumber: `JOB-${job.jobNumber}`,
        customerName: `${job.customer.firstName} ${job.customer.lastName}`,
        serviceType: job.serviceType,
        addressLine: `${job.serviceAddress.line1}, ${job.serviceAddress.city}`,
        technicianName: job.assignedTechnician
          ? `${job.assignedTechnician.firstName} ${job.assignedTechnician.lastName}`
          : null,
        status: job.status,
        windowStart: job.scheduledStart.toISOString(),
        windowEnd: job.scheduledEnd.toISOString(),
      })),
  };
}

export async function getDashboardAlerts(
  companyId: string,
): Promise<DashboardAlerts> {
  const timezone = await getCompanyTimezone(companyId);
  const dateStr = todayInTimezone(timezone);
  const now = new Date();

  const alerts: Alert[] = [];

  // Unassigned jobs (live pipeline only)
  const unassignedJobs = await prisma.job.findMany({
    where: {
      companyId,
      status: { in: LIVE_STATUSES },
      assignedTechnicianId: null,
    },
    select: {
      id: true,
      jobNumber: true,
      customer: { select: { firstName: true, lastName: true } },
      scheduledStart: true,
    },
    take: 10,
  });

  for (const job of unassignedJobs) {
    alerts.push({
      type: "UNASSIGNED_JOB",
      jobId: job.id,
      jobNumber: `JOB-${job.jobNumber}`,
      customerName: `${job.customer.firstName} ${job.customer.lastName}`,
      message: `Job JOB-${job.jobNumber} for ${job.customer.firstName} ${job.customer.lastName} has no technician assigned`,
      severity: "warning",
    });
  }

  // SCHEDULED jobs past their start time
  const pastStartJobs = await prisma.job.findMany({
    where: {
      companyId,
      status: "SCHEDULED",
      scheduledStart: { lt: now },
    },
    select: {
      id: true,
      jobNumber: true,
      customer: { select: { firstName: true, lastName: true } },
      assignedTechnician: { select: { firstName: true, lastName: true } },
      scheduledStart: true,
    },
    take: 10,
  });

  for (const job of pastStartJobs) {
    alerts.push({
      type: "PAST_START_TIME",
      jobId: job.id,
      jobNumber: `JOB-${job.jobNumber}`,
      customerName: `${job.customer.firstName} ${job.customer.lastName}`,
      technicianName: job.assignedTechnician
        ? `${job.assignedTechnician.firstName} ${job.assignedTechnician.lastName}`
        : undefined,
      message: `Job JOB-${job.jobNumber} was scheduled to start at ${job.scheduledStart?.toISOString()} but is still SCHEDULED`,
      severity: "warning",
    });
  }

  // Long-running IN_PROGRESS jobs (more than 8 hours)
  const longRunningThreshold = new Date(now.getTime() - 8 * 60 * 60 * 1000);
  const longRunningJobs = await prisma.job.findMany({
    where: {
      companyId,
      status: "IN_PROGRESS",
      scheduledStart: { lt: longRunningThreshold },
    },
    select: {
      id: true,
      jobNumber: true,
      customer: { select: { firstName: true, lastName: true } },
      assignedTechnician: { select: { firstName: true, lastName: true } },
      scheduledStart: true,
    },
    take: 10,
  });

  for (const job of longRunningJobs) {
    const hoursElapsed = job.scheduledStart
      ? Math.floor(
          (now.getTime() - job.scheduledStart.getTime()) / (60 * 60 * 1000),
        )
      : 0;
    alerts.push({
      type: "LONG_RUNNING",
      jobId: job.id,
      jobNumber: `JOB-${job.jobNumber}`,
      customerName: `${job.customer.firstName} ${job.customer.lastName}`,
      technicianName: job.assignedTechnician
        ? `${job.assignedTechnician.firstName} ${job.assignedTechnician.lastName}`
        : undefined,
      message: `Job JOB-${job.jobNumber} has been in progress for ${hoursElapsed} hours`,
      severity: "warning",
    });
  }

  // Overdue invoices
  const overdueInvoices = await prisma.invoice.findMany({
    where: {
      companyId,
      status: "OVERDUE",
    },
    select: {
      id: true,
      invoiceNumber: true,
      customer: { select: { firstName: true, lastName: true } },
      dueAt: true,
    },
    take: 10,
  });

  for (const invoice of overdueInvoices) {
    alerts.push({
      type: "OVERDUE_INVOICE",
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerName: `${invoice.customer.firstName} ${invoice.customer.lastName}`,
      message: `Invoice ${invoice.invoiceNumber} for ${invoice.customer.firstName} ${invoice.customer.lastName} is overdue (due: ${invoice.dueAt?.toISOString()})`,
      severity: "error",
    });
  }

  return {
    date: dateStr,
    timezone,
    alerts,
  };
}
