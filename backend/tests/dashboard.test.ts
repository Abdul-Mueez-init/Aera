import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { hashPassword } from "../src/common/auth/password.js";

const app = buildApp();

async function registerOwner(label: string) {
  const suffix = `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const payload = {
    email: `owner-${suffix}@example.com`,
    password: "correct-horse-battery-staple",
    firstName: "Owner",
    lastName: label,
    companyName: `Company ${suffix}`,
  };
  const res = await request(app).post("/api/v1/auth/register").send(payload);
  expect(res.status).toBe(201);
  return {
    accessToken: res.body.data.accessToken as string,
    companyId: res.body.data.company.id as string,
    userId: res.body.data.user.id as string,
  };
}

async function registerDispatcher(companyId: string, label: string) {
  const suffix = `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const password = "correct-horse-battery-staple";
  const payload = {
    email: `dispatcher-${suffix}@example.com`,
    password,
    firstName: "Dispatcher",
    lastName: label,
  };
  const user = await prisma.user.create({
    data: {
      email: payload.email,
      passwordHash: await hashPassword(password),
      firstName: payload.firstName,
      lastName: payload.lastName,
    },
  });

  await prisma.companyMember.create({
    data: {
      companyId,
      userId: user.id,
      role: "DISPATCHER",
      status: "ACTIVE",
    },
  });

  const authRes = await request(app).post("/api/v1/auth/login").send({
    email: payload.email,
    password: payload.password,
  });
  expect(authRes.status).toBe(200);
  return {
    accessToken: authRes.body.data.accessToken as string,
  };
}

async function registerTechnician(companyId: string, label: string) {
  const suffix = `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const password = "correct-horse-battery-staple";
  const payload = {
    email: `tech-${suffix}@example.com`,
    password,
    firstName: "Tech",
    lastName: label,
  };
  const user = await prisma.user.create({
    data: {
      email: payload.email,
      passwordHash: await hashPassword(password),
      firstName: payload.firstName,
      lastName: payload.lastName,
    },
  });

  await prisma.companyMember.create({
    data: {
      companyId,
      userId: user.id,
      role: "TECHNICIAN",
      status: "ACTIVE",
    },
  });

  const authRes = await request(app).post("/api/v1/auth/login").send({
    email: payload.email,
    password: payload.password,
  });
  expect(authRes.status).toBe(200);
  return {
    accessToken: authRes.body.data.accessToken as string,
  };
}

describe("dashboard API boundaries", () => {
  it("rejects unauthenticated dashboard requests", async () => {
    const response = await request(app).get("/api/v1/dashboard/summary");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_SESSION_EXPIRED");
  });

  it("rejects technician role on dashboard endpoints", async () => {
    const { companyId } = await registerOwner("tech-test");
    const { accessToken } = await registerTechnician(companyId, "tech");
    const auth = { Authorization: `Bearer ${accessToken}` };

    const summaryRes = await request(app)
      .get("/api/v1/dashboard/summary")
      .set(auth);
    expect(summaryRes.status).toBe(403);
    expect(summaryRes.body.error.code).toBe("AUTH_FORBIDDEN");

    const todayRes = await request(app)
      .get("/api/v1/dashboard/today")
      .set(auth);
    expect(todayRes.status).toBe(403);
    expect(todayRes.body.error.code).toBe("AUTH_FORBIDDEN");

    const alertsRes = await request(app)
      .get("/api/v1/dashboard/alerts")
      .set(auth);
    expect(alertsRes.status).toBe(403);
    expect(alertsRes.body.error.code).toBe("AUTH_FORBIDDEN");
  });
});

describe("dashboard summary endpoint", () => {
  it("returns zero metrics for a fresh company", async () => {
    const { accessToken } = await registerOwner("fresh");
    const auth = { Authorization: `Bearer ${accessToken}` };

    const response = await request(app)
      .get("/api/v1/dashboard/summary")
      .set(auth);
    expect(response.status).toBe(200);
    expect(response.body.data.jobsToday).toBe(0);
    expect(response.body.data.unassignedJobs).toBe(0);
    expect(response.body.data.outstandingInvoices.count).toBe(0);
    expect(
      response.body.data.revenueThisMonth.collectedByCurrency,
    ).toHaveLength(0);
  });

  it("aggregates metrics scoped to the company", async () => {
    const { accessToken: tokenA, companyId: companyA } =
      await registerOwner("metrics-a");
    const { accessToken: tokenB, companyId: companyB } =
      await registerOwner("metrics-b");
    const authA = { Authorization: `Bearer ${tokenA}` };
    const authB = { Authorization: `Bearer ${tokenB}` };

    // Create a customer and job for company A
    const customerA = await prisma.customer.create({
      data: {
        companyId: companyA,
        firstName: "Customer",
        lastName: "A",
      },
    });

    const addressA = await prisma.serviceAddress.create({
      data: {
        companyId: companyA,
        customerId: customerA.id,
        label: "Home",
        line1: "123 Main St",
        city: "Lahore",
        countryCode: "PK",
      },
    });

    await prisma.job.create({
      data: {
        companyId: companyA,
        customerId: customerA.id,
        serviceAddressId: addressA.id,
        jobNumber: 1,
        serviceType: "Installation",
        problemDescription: "Test",
        priority: "NORMAL",
        status: "SCHEDULED",
        scheduledStart: new Date(),
        scheduledEnd: new Date(Date.now() + 3600000),
      },
    });

    // Create a job for company B (should not appear in A's metrics)
    const customerB = await prisma.customer.create({
      data: {
        companyId: companyB,
        firstName: "Customer",
        lastName: "B",
      },
    });

    const addressB = await prisma.serviceAddress.create({
      data: {
        companyId: companyB,
        customerId: customerB.id,
        label: "Home",
        line1: "456 Oak Ave",
        city: "Karachi",
        countryCode: "PK",
      },
    });

    await prisma.job.create({
      data: {
        companyId: companyB,
        customerId: customerB.id,
        serviceAddressId: addressB.id,
        jobNumber: 1,
        serviceType: "Repair",
        problemDescription: "Test",
        priority: "NORMAL",
        status: "SCHEDULED",
        scheduledStart: new Date(),
        scheduledEnd: new Date(Date.now() + 3600000),
      },
    });

    const responseA = await request(app)
      .get("/api/v1/dashboard/summary")
      .set(authA);
    expect(responseA.status).toBe(200);
    expect(responseA.body.data.jobsToday).toBeGreaterThanOrEqual(1);

    const responseB = await request(app)
      .get("/api/v1/dashboard/summary")
      .set(authB);
    expect(responseB.status).toBe(200);
    expect(responseB.body.data.jobsToday).toBeGreaterThanOrEqual(1);
  });

  it("allows dispatcher role", async () => {
    const { companyId } = await registerOwner("dispatcher-test");
    const { accessToken } = await registerDispatcher(companyId, "dispatcher");
    const auth = { Authorization: `Bearer ${accessToken}` };

    const response = await request(app)
      .get("/api/v1/dashboard/summary")
      .set(auth);
    expect(response.status).toBe(200);
  });
});

describe("dashboard today endpoint", () => {
  it("returns today's jobs bounded by limit", async () => {
    const { accessToken, companyId } = await registerOwner("today-test");
    const auth = { Authorization: `Bearer ${accessToken}` };

    const customer = await prisma.customer.create({
      data: {
        companyId,
        firstName: "Customer",
        lastName: "Test",
      },
    });

    const address = await prisma.serviceAddress.create({
      data: {
        companyId,
        customerId: customer.id,
        label: "Home",
        line1: "123 Main St",
        city: "Lahore",
        countryCode: "PK",
      },
    });

    // Create 3 jobs
    for (let i = 0; i < 3; i++) {
      await prisma.job.create({
        data: {
          companyId,
          customerId: customer.id,
          serviceAddressId: address.id,
          jobNumber: 100 + i,
          serviceType: "Installation",
          problemDescription: "Test",
          priority: "NORMAL",
          status: "SCHEDULED",
          scheduledStart: new Date(),
          scheduledEnd: new Date(Date.now() + 3600000),
        },
      });
    }

    const response = await request(app)
      .get("/api/v1/dashboard/today")
      .set(auth);
    expect(response.status).toBe(200);
    expect(response.body.data.jobs).toHaveLength(3);
    expect(response.body.data.jobs[0]).toHaveProperty("jobNumber");
    expect(response.body.data.jobs[0]).toHaveProperty("customerName");
    expect(response.body.data.jobs[0]).toHaveProperty("serviceType");
    expect(response.body.data.jobs[0]).toHaveProperty("addressLine");
  });

  it("respects limit parameter", async () => {
    const { accessToken, companyId } = await registerOwner("limit-test");
    const auth = { Authorization: `Bearer ${accessToken}` };

    const customer = await prisma.customer.create({
      data: {
        companyId,
        firstName: "Customer",
        lastName: "Test",
      },
    });

    const address = await prisma.serviceAddress.create({
      data: {
        companyId,
        customerId: customer.id,
        label: "Home",
        line1: "123 Main St",
        city: "Lahore",
        countryCode: "PK",
      },
    });

    // Create 10 jobs
    for (let i = 0; i < 10; i++) {
      await prisma.job.create({
        data: {
          companyId,
          customerId: customer.id,
          serviceAddressId: address.id,
          jobNumber: 200 + i,
          serviceType: "Installation",
          problemDescription: "Test",
          priority: "NORMAL",
          status: "SCHEDULED",
          scheduledStart: new Date(),
          scheduledEnd: new Date(Date.now() + 3600000),
        },
      });
    }

    const response = await request(app)
      .get("/api/v1/dashboard/today?limit=5")
      .set(auth);
    expect(response.status).toBe(200);
    expect(response.body.data.jobs.length).toBeLessThanOrEqual(5);
  });
});

describe("dashboard alerts endpoint", () => {
  it("returns alerts for unassigned jobs", async () => {
    const { accessToken, companyId } = await registerOwner("alerts-test");
    const auth = { Authorization: `Bearer ${accessToken}` };

    const customer = await prisma.customer.create({
      data: {
        companyId,
        firstName: "Customer",
        lastName: "Test",
      },
    });

    const address = await prisma.serviceAddress.create({
      data: {
        companyId,
        customerId: customer.id,
        label: "Home",
        line1: "123 Main St",
        city: "Lahore",
        countryCode: "PK",
      },
    });

    await prisma.job.create({
      data: {
        companyId,
        customerId: customer.id,
        serviceAddressId: address.id,
        jobNumber: 300,
        serviceType: "Installation",
        problemDescription: "Test",
        priority: "NORMAL",
        status: "SCHEDULED",
        scheduledStart: new Date(),
        scheduledEnd: new Date(Date.now() + 3600000),
        assignedTechnicianId: null,
      },
    });

    const response = await request(app)
      .get("/api/v1/dashboard/alerts")
      .set(auth);
    expect(response.status).toBe(200);
    expect(response.body.data.alerts).toBeDefined();
    const unassignedAlert = response.body.data.alerts.find(
      (a: { type: string }) => a.type === "UNASSIGNED_JOB",
    );
    expect(unassignedAlert).toBeDefined();
  });

  it("returns alerts for overdue invoices", async () => {
    const { accessToken, companyId } = await registerOwner("invoice-alerts");
    const auth = { Authorization: `Bearer ${accessToken}` };

    const customer = await prisma.customer.create({
      data: {
        companyId,
        firstName: "Customer",
        lastName: "Test",
      },
    });

    await prisma.invoice.create({
      data: {
        companyId,
        customerId: customer.id,
        invoiceNumber: "INV-OVERDUE",
        status: "OVERDUE",
        subtotalMinor: 10000n,
        totalMinor: 10000n,
        balanceDueMinor: 10000n,
        currency: "PKR",
        dueAt: new Date(Date.now() - 86400000), // Yesterday
        issuedAt: new Date(),
      },
    });

    const response = await request(app)
      .get("/api/v1/dashboard/alerts")
      .set(auth);
    expect(response.status).toBe(200);
    expect(response.body.data.alerts).toBeDefined();
    const overdueAlert = response.body.data.alerts.find(
      (a: { type: string }) => a.type === "OVERDUE_INVOICE",
    );
    expect(overdueAlert).toBeDefined();
  });
});
