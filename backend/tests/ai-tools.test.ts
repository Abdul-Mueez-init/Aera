import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import {
  executeTool,
  getJobsAtRisk,
  getCustomerJobHistory,
  getScheduleWorkload,
  getBusinessMetrics,
} from "../src/modules/ai/tools/index.js";
import {
  dayBoundsInTimezone,
  todayInTimezone,
} from "../src/modules/ai/tools/timezone.util.js";
// getJobsAtRisk / getCustomerJobHistory / getScheduleWorkload /
// getBusinessMetrics are re-exported for direct testing below via the
// barrel; see note near the imports if that changes.

const app = buildApp();
const HOUR_MS = 3_600_000;

async function seedCompany(label: string) {
  const suffix = `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const email = `owner-${suffix}@example.com`;
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({
      email,
      password: "correct-horse-battery-staple",
      firstName: "Owner",
      lastName: label,
      companyName: `Company ${suffix}`,
    });
  expect(res.status).toBe(201);

  const member = await prisma.companyMember.findFirst({
    where: { user: { email } },
    select: { companyId: true, userId: true },
  });
  expect(member).not.toBeNull();

  return { companyId: member!.companyId, ownerUserId: member!.userId };
}

async function seedCustomer(
  companyId: string,
  firstName: string,
  lastName: string,
) {
  const customer = await prisma.customer.create({
    data: { companyId, firstName, lastName },
  });
  const address = await prisma.serviceAddress.create({
    data: {
      companyId,
      customerId: customer.id,
      label: "Home",
      line1: "1 Test St",
      city: "Testville",
      countryCode: "US",
    },
  });
  return { customerId: customer.id, addressId: address.id };
}

let jobNumberCounter = 0;

async function seedJob(
  company: { companyId: string; customerId: string; addressId: string },
  overrides: Partial<{
    status:
      | "NEW"
      | "QUOTING"
      | "SCHEDULED"
      | "EN_ROUTE"
      | "IN_PROGRESS"
      | "WAITING_PARTS"
      | "COMPLETED"
      | "CANCELLED";
    priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
    scheduledStart: Date | null;
    scheduledEnd: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
    completionSummary: string | null;
    assignedTechnicianId: string | null;
    updatedAt: Date;
  }> = {},
) {
  jobNumberCounter += 1;
  return prisma.job.create({
    data: {
      companyId: company.companyId,
      customerId: company.customerId,
      serviceAddressId: company.addressId,
      jobNumber: jobNumberCounter,
      serviceType: "AC Repair",
      problemDescription: "Not cooling",
      priority: overrides.priority ?? "NORMAL",
      status: overrides.status ?? "SCHEDULED",
      scheduledStart: overrides.scheduledStart ?? null,
      scheduledEnd: overrides.scheduledEnd ?? null,
      startedAt: overrides.startedAt ?? null,
      completedAt: overrides.completedAt ?? null,
      completionSummary: overrides.completionSummary ?? null,
      assignedTechnicianId: overrides.assignedTechnicianId ?? null,
      ...(overrides.updatedAt ? { updatedAt: overrides.updatedAt } : {}),
    },
  });
}

async function setCompanyTimezone(companyId: string, timezone: string) {
  await prisma.company.update({ where: { id: companyId }, data: { timezone } });
}

let invoiceNumberCounter = 0;

async function seedInvoice(
  company: { companyId: string; customerId: string },
  overrides: Partial<{
    status: "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "VOID" | "OVERDUE";
    totalMinor: bigint;
    balanceDueMinor: bigint;
    currency: string;
  }> = {},
) {
  invoiceNumberCounter += 1;
  const currency = overrides.currency ?? "USD";
  const totalMinor = overrides.totalMinor ?? 10_000n;
  return prisma.invoice.create({
    data: {
      companyId: company.companyId,
      customerId: company.customerId,
      invoiceNumber: `INV-TEST-${invoiceNumberCounter}-${Date.now()}`,
      status: overrides.status ?? "ISSUED",
      subtotalMinor: totalMinor,
      totalMinor,
      balanceDueMinor: overrides.balanceDueMinor ?? totalMinor,
      currency,
    },
  });
}

async function seedPayment(
  company: { companyId: string },
  invoiceId: string,
  overrides: Partial<{
    amountMinor: bigint;
    currency: string;
    receivedAt: Date;
  }> = {},
) {
  return prisma.payment.create({
    data: {
      companyId: company.companyId,
      invoiceId,
      amountMinor: overrides.amountMinor ?? 5_000n,
      currency: overrides.currency ?? "USD",
      method: "CARD",
      idempotencyKey: `test-${Date.now()}-${Math.random()}`,
      receivedAt: overrides.receivedAt ?? new Date(),
    },
  });
}

function context(company: { companyId: string; ownerUserId: string }) {
  return {
    companyId: company.companyId,
    userId: company.ownerUserId,
    role: "OWNER" as const,
  };
}

describe("get_jobs_at_risk", () => {
  it("flags an overdue job, ignores a healthy one, and stays company-scoped", async () => {
    const companyA = await seedCompany("risk-a");
    const companyB = await seedCompany("risk-b");
    const customerA = await seedCustomer(companyA.companyId, "Amir", "Raza");
    const customerB = await seedCustomer(companyB.companyId, "Zara", "Iqbal");
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    const overdue = await seedJob(
      { ...companyA, ...customerA },
      {
        status: "SCHEDULED",
        scheduledStart: new Date(now.getTime() - 4 * HOUR_MS),
        scheduledEnd: new Date(now.getTime() - 3 * HOUR_MS),
        assignedTechnicianId: companyA.ownerUserId,
      },
    );
    const healthy = await seedJob(
      { ...companyA, ...customerA },
      {
        status: "SCHEDULED",
        scheduledStart: new Date(now.getTime() + 5 * HOUR_MS),
        scheduledEnd: new Date(now.getTime() + 6 * HOUR_MS),
        assignedTechnicianId: companyA.ownerUserId,
      },
    );
    await seedJob(
      { ...companyB, ...customerB },
      {
        status: "SCHEDULED",
        scheduledStart: new Date(now.getTime() - 4 * HOUR_MS),
        scheduledEnd: new Date(now.getTime() - 3 * HOUR_MS),
      },
    );

    const result = await getJobsAtRisk(context(companyA), { date: today });

    const ids = result.jobs.map((job) => job.jobId);
    expect(ids).toContain(overdue.id);
    expect(ids).not.toContain(healthy.id);
    const flagged = result.jobs.find((job) => job.jobId === overdue.id)!;
    expect(flagged.riskReasons.join(" ")).toMatch(/Scheduled window ended/);
  });

  it("does not flag a not-yet-late unassigned job, but flags a long-running job and a stuck waiting-parts job", async () => {
    const company = await seedCompany("risk-signals");
    const customer = await seedCustomer(company.companyId, "Bilal", "Khan");
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    const notYetLate = await seedJob(
      { ...company, ...customer },
      {
        status: "SCHEDULED",
        scheduledStart: new Date(now.getTime() + HOUR_MS),
        scheduledEnd: new Date(now.getTime() + 2 * HOUR_MS),
      },
    );
    const longRunning = await seedJob(
      { ...company, ...customer },
      {
        status: "IN_PROGRESS",
        startedAt: new Date(now.getTime() - 5 * HOUR_MS),
      },
    );
    const stuckWaitingParts = await seedJob(
      { ...company, ...customer },
      {
        status: "WAITING_PARTS",
        updatedAt: new Date(now.getTime() - 30 * HOUR_MS),
      },
    );
    const urgentUnscheduled = await seedJob(
      { ...company, ...customer },
      { status: "NEW", priority: "URGENT" },
    );

    const result = await getJobsAtRisk(context(company), { date: today });
    const byId = new Map(result.jobs.map((job) => [job.jobId, job]));

    expect(byId.has(notYetLate.id)).toBe(false);
    expect(byId.get(longRunning.id)?.riskReasons.join(" ")).toMatch(
      /In progress for over/,
    );
    expect(byId.get(stuckWaitingParts.id)?.riskReasons.join(" ")).toMatch(
      /Waiting on parts for over/,
    );
    expect(byId.get(urgentUnscheduled.id)?.riskReasons.join(" ")).toMatch(
      /still unscheduled/,
    );
  });

  it("flags a job over 15 minutes past its scheduled start that hasn't moved past SCHEDULED", async () => {
    const company = await seedCompany("risk-late-start");
    const customer = await seedCustomer(company.companyId, "Imran", "Sheikh");
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const MINUTE_MS = 60_000;

    const lateUnassigned = await seedJob(
      { ...company, ...customer },
      {
        status: "SCHEDULED",
        scheduledStart: new Date(now.getTime() - 20 * MINUTE_MS),
        scheduledEnd: new Date(now.getTime() + 40 * MINUTE_MS),
      },
    );
    const withinGrace = await seedJob(
      { ...company, ...customer },
      {
        status: "SCHEDULED",
        scheduledStart: new Date(now.getTime() - 5 * MINUTE_MS),
        scheduledEnd: new Date(now.getTime() + 55 * MINUTE_MS),
      },
    );
    const alreadyEnRoute = await seedJob(
      { ...company, ...customer },
      {
        status: "EN_ROUTE",
        scheduledStart: new Date(now.getTime() - 20 * MINUTE_MS),
        scheduledEnd: new Date(now.getTime() + 40 * MINUTE_MS),
      },
    );

    const result = await getJobsAtRisk(context(company), { date: today });
    const byId = new Map(result.jobs.map((job) => [job.jobId, job]));

    expect(byId.get(lateUnassigned.id)?.riskReasons.join(" ")).toMatch(
      /Unassigned and \d+m past its scheduled start/,
    );
    expect(byId.has(withinGrace.id)).toBe(false);
    expect(byId.has(alreadyEnRoute.id)).toBe(false);
  });

  it("flags a job whose assigned technician is at/over the 6-job workload threshold", async () => {
    const company = await seedCompany("risk-overload");
    const customer = await seedCustomer(company.companyId, "Farah", "Malik");
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const technicianId = company.ownerUserId; // any valid user id works for FK purposes

    let flaggedJobId = "";
    for (let index = 0; index < 6; index += 1) {
      const job = await seedJob(
        { ...company, ...customer },
        {
          status: "SCHEDULED",
          scheduledStart: new Date(now.getTime() + (index + 1) * HOUR_MS),
          scheduledEnd: new Date(now.getTime() + (index + 2) * HOUR_MS),
          assignedTechnicianId: technicianId,
        },
      );
      flaggedJobId = job.id;
    }

    const result = await getJobsAtRisk(context(company), { date: today });
    const flagged = result.jobs.find((job) => job.jobId === flaggedJobId);
    expect(flagged?.riskReasons.join(" ")).toMatch(
      /Assigned technician has 6 jobs today/,
    );
  });

  it("computes 'today' using the company's own timezone, not UTC", async () => {
    const company = await seedCompany("risk-timezone");
    await setCompanyTimezone(company.companyId, "Pacific/Kiritimati"); // UTC+14

    const result = await getJobsAtRisk(context(company), {});
    expect(result.timezone).toBe("Pacific/Kiritimati");
    expect(result.date).toBe(todayInTimezone("Pacific/Kiritimati"));
  });

  it("rejects a malformed date", async () => {
    const company = await seedCompany("risk-bad-date");
    await expect(
      getJobsAtRisk(context(company), { date: "not-a-date" }),
    ).rejects.toThrow();
  });
});

describe("get_schedule_workload", () => {
  it("flags an overloaded technician at 6 jobs and leaves one under threshold unflagged", async () => {
    const company = await seedCompany("workload-overload");
    const customer = await seedCustomer(company.companyId, "Nadia", "Rauf");
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const busyTech = company.ownerUserId;

    for (let index = 0; index < 6; index += 1) {
      await seedJob(
        { ...company, ...customer },
        {
          status: "SCHEDULED",
          scheduledStart: new Date(now.getTime() + (index + 1) * HOUR_MS),
          scheduledEnd: new Date(now.getTime() + (index + 2) * HOUR_MS),
          assignedTechnicianId: busyTech,
        },
      );
    }

    const result = await getScheduleWorkload(context(company), { date: today });
    const busy = result.technicians.find(
      (tech) => tech.technicianId === busyTech,
    );
    expect(busy?.jobCount).toBe(6);
    expect(busy?.overloaded).toBe(true);
  });

  it("counts unassigned jobs and flags a job over 15 minutes past its scheduled start", async () => {
    const company = await seedCompany("workload-late");
    const customer = await seedCustomer(company.companyId, "Waqas", "Iqbal");
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const MINUTE_MS = 60_000;

    await seedJob(
      { ...company, ...customer },
      {
        status: "SCHEDULED",
        scheduledStart: new Date(now.getTime() + HOUR_MS),
        scheduledEnd: new Date(now.getTime() + 2 * HOUR_MS),
      },
    );
    const late = await seedJob(
      { ...company, ...customer },
      {
        status: "SCHEDULED",
        scheduledStart: new Date(now.getTime() - 30 * MINUTE_MS),
        scheduledEnd: new Date(now.getTime() + 30 * MINUTE_MS),
      },
    );

    const result = await getScheduleWorkload(context(company), { date: today });
    expect(result.unassignedJobCount).toBe(2);
    expect(result.lateJobs.map((job) => job.jobId)).toContain(late.id);
  });

  it("defaults 'date' to today in the company's own timezone", async () => {
    const company = await seedCompany("workload-timezone");
    await setCompanyTimezone(company.companyId, "Pacific/Kiritimati");

    const result = await getScheduleWorkload(context(company), {});
    expect(result.timezone).toBe("Pacific/Kiritimati");
    expect(result.date).toBe(todayInTimezone("Pacific/Kiritimati"));
  });
});

describe("get_business_metrics", () => {
  it("aggregates jobs-by-status, unassigned jobs, outstanding invoices, and revenue this month, scoped to the company", async () => {
    const companyA = await seedCompany("metrics-a");
    const companyB = await seedCompany("metrics-b");
    const customerA = await seedCustomer(companyA.companyId, "Hina", "Yousaf");
    const customerB = await seedCustomer(
      companyB.companyId,
      "Other",
      "Company",
    );

    await seedJob({ ...companyA, ...customerA }, { status: "SCHEDULED" });
    await seedJob(
      { ...companyA, ...customerA },
      { status: "SCHEDULED", assignedTechnicianId: companyA.ownerUserId },
    );
    await seedJob({ ...companyA, ...customerA }, { status: "COMPLETED" });
    // Noise in another company; must not leak into companyA's metrics.
    await seedJob({ ...companyB, ...customerB }, { status: "SCHEDULED" });

    const invoice = await seedInvoice(
      { companyId: companyA.companyId, customerId: customerA.customerId },
      { status: "ISSUED", totalMinor: 20_000n, balanceDueMinor: 15_000n },
    );
    await seedPayment(companyA, invoice.id, { amountMinor: 5_000n });

    const result = await getBusinessMetrics(context(companyA));

    const scheduledCount = result.jobsByStatus.find(
      (row) => row.status === "SCHEDULED",
    )?.count;
    expect(scheduledCount).toBe(2);
    expect(result.jobsByStatus.some((row) => row.status === "COMPLETED")).toBe(
      false,
    );
    expect(result.unassignedJobs).toBe(1);

    const usdOutstanding = result.outstandingInvoices.balanceDueByCurrency.find(
      (row) => row.currency === "USD",
    );
    expect(usdOutstanding?.totalMinor).toBe("15000");

    const usdRevenue = result.revenueThisMonth.collectedByCurrency.find(
      (row) => row.currency === "USD",
    );
    expect(usdRevenue?.totalMinor).toBe("5000");
  });
});

describe("timezone.util", () => {
  it("computes company-local day boundaries that differ from UTC midnight", () => {
    const { start, end } = dayBoundsInTimezone("2026-06-15", "Asia/Karachi"); // UTC+5
    expect(start.toISOString()).toBe("2026-06-14T19:00:00.000Z");
    expect(end.toISOString()).toBe("2026-06-15T19:00:00.000Z");
  });

  it("returns today's date for a timezone far ahead of UTC even near UTC midnight", () => {
    // Pacific/Kiritimati is UTC+14; at 23:30 UTC it is already the next
    // calendar day there.
    const reference = new Date("2026-06-15T23:30:00.000Z");
    expect(todayInTimezone("Pacific/Kiritimati", reference)).toBe("2026-06-16");
    expect(todayInTimezone("UTC", reference)).toBe("2026-06-15");
  });
});

describe("get_customer_job_history", () => {
  it("returns recent completed visits for an exact customerId, newest first, bounded by limit", async () => {
    const company = await seedCompany("history-id");
    const customer = await seedCustomer(company.companyId, "Sarah", "Khan");
    const now = new Date();

    const oldest = await seedJob(
      { ...company, ...customer },
      {
        status: "COMPLETED",
        completedAt: new Date(now.getTime() - 30 * 24 * HOUR_MS),
        completionSummary: "Replaced capacitor",
      },
    );
    const middle = await seedJob(
      { ...company, ...customer },
      {
        status: "COMPLETED",
        completedAt: new Date(now.getTime() - 15 * 24 * HOUR_MS),
        completionSummary: "Refilled refrigerant",
      },
    );
    const newest = await seedJob(
      { ...company, ...customer },
      {
        status: "COMPLETED",
        completedAt: new Date(now.getTime() - 1 * 24 * HOUR_MS),
        completionSummary: "Cleaned condenser coils",
      },
    );
    // Not completed — must never show up as a "visit".
    await seedJob({ ...company, ...customer }, { status: "SCHEDULED" });

    const result = await getCustomerJobHistory(context(company), {
      customerId: customer.customerId,
    });

    expect(result.found).toBe(true);
    expect(result.visits.map((visit) => visit.jobId)).toEqual([
      newest.id,
      middle.id,
      oldest.id,
    ]);
  });

  it("resolves a unique full-name match and respects a custom limit", async () => {
    const company = await seedCompany("history-name");
    const customer = await seedCustomer(company.companyId, "Sarah", "Khan");
    await seedJob(
      { ...company, ...customer },
      { status: "COMPLETED", completedAt: new Date() },
    );
    await seedJob(
      { ...company, ...customer },
      { status: "COMPLETED", completedAt: new Date(Date.now() - HOUR_MS) },
    );

    const result = await getCustomerJobHistory(context(company), {
      customerName: "Sarah Khan",
      limit: 1,
    });

    expect(result.found).toBe(true);
    expect(result.customer?.name).toBe("Sarah Khan");
    expect(result.visits).toHaveLength(1);
  });

  it("returns candidates without a history for an ambiguous name, and found:false for no match", async () => {
    const company = await seedCompany("history-ambiguous");
    await seedCustomer(company.companyId, "Sarah", "Khan");
    await seedCustomer(company.companyId, "Sarah", "Ahmed");

    const ambiguous = await getCustomerJobHistory(context(company), {
      customerName: "Sarah",
    });
    expect(ambiguous.found).toBe(false);
    expect(ambiguous.ambiguous).toBe(true);
    expect(ambiguous.matches).toHaveLength(2);
    expect(ambiguous.visits).toHaveLength(0);

    const noMatch = await getCustomerJobHistory(context(company), {
      customerName: "Nobody Here",
    });
    expect(noMatch.found).toBe(false);
    expect(noMatch.ambiguous).toBe(false);
    expect(noMatch.matches).toHaveLength(0);
  });

  it("stays company-scoped: another company's customer is not found by name or id", async () => {
    const companyA = await seedCompany("history-scope-a");
    const companyB = await seedCompany("history-scope-b");
    const customerB = await seedCustomer(
      companyB.companyId,
      "Unique",
      "Person",
    );

    const byName = await getCustomerJobHistory(context(companyA), {
      customerName: "Unique Person",
    });
    expect(byName.found).toBe(false);

    const byId = await getCustomerJobHistory(context(companyA), {
      customerId: customerB.customerId,
    });
    expect(byId.found).toBe(false);
  });
});

describe("executeTool registry", () => {
  it("runs a known tool by name with validated input", async () => {
    const company = await seedCompany("registry-run");
    const result = (await executeTool(
      "get_jobs_at_risk",
      { date: new Date().toISOString().slice(0, 10) },
      context(company),
    )) as { atRiskCount: number };
    expect(typeof result.atRiskCount).toBe("number");
  });

  it("rejects an unknown tool name", async () => {
    const company = await seedCompany("registry-unknown");
    await expect(
      executeTool("delete_everything", {}, context(company)),
    ).rejects.toMatchObject({ code: "AI_TOOL_NOT_FOUND" });
  });

  it("rejects input that fails the tool's own schema", async () => {
    const company = await seedCompany("registry-invalid");
    await expect(
      executeTool("get_customer_job_history", {}, context(company)),
    ).rejects.toMatchObject({ code: "AI_TOOL_INVALID_INPUT" });
  });
});
