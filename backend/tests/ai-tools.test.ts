import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import {
  executeTool,
  getJobsAtRisk,
  getCustomerJobHistory,
} from "../src/modules/ai/tools/index.js";
// getJobsAtRisk / getCustomerJobHistory are re-exported for direct testing
// below via the barrel; see note near the imports if that changes.

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

  it("flags an imminent unassigned job, a long-running job, and a stuck waiting-parts job", async () => {
    const company = await seedCompany("risk-signals");
    const customer = await seedCustomer(company.companyId, "Bilal", "Khan");
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    const unassigned = await seedJob(
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

    expect(byId.get(unassigned.id)?.riskReasons.join(" ")).toMatch(
      /Unassigned with under 2 hours/,
    );
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

  it("rejects a malformed date", async () => {
    const company = await seedCompany("risk-bad-date");
    await expect(
      getJobsAtRisk(context(company), { date: "not-a-date" }),
    ).rejects.toThrow();
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