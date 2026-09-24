import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";

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

async function createCustomerWithAddress(auth: { Authorization: string }) {
  const customer = await request(app)
    .post("/api/v1/customers")
    .set(auth)
    .send({ firstName: "John", lastName: "Connor" });
  expect(customer.status).toBe(201);

  const address = await request(app)
    .post(`/api/v1/customers/${customer.body.data.id}/addresses`)
    .set(auth)
    .send({
      label: "HQ",
      line1: "100 Skyline Blvd",
      city: "San Francisco",
      countryCode: "US",
    });
  expect(address.status).toBe(201);

  return {
    customerId: customer.body.data.id as string,
    serviceAddressId: address.body.data.id as string,
  };
}

async function createJob(
  auth: { Authorization: string },
  customerId: string,
  serviceAddressId: string,
) {
  const job = await request(app)
    .post("/api/v1/jobs")
    .set(auth)
    .send({
      customerId,
      serviceAddressId,
      serviceType: "Heat Pump Diagnostics",
      problemDescription: "Unit freezing over in heating mode",
    });
  expect(job.status).toBe(201);
  return job.body.data.id as string;
}

async function createTechnician(
  auth: { Authorization: string },
  companyId: string,
) {
  // Create a technician user by registering a new company, then reassign the user to the test company
  const suffix = `tech-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const techUser = await request(app)
    .post("/api/v1/auth/register")
    .send({
      email: `tech-${suffix}@example.com`,
      password: "correct-horse-battery-staple",
      firstName: "Tech",
      lastName: suffix,
      companyName: `Temp Company ${suffix}`,
    });
  
  const tempCompanyId = techUser.body.data.company.id;
  const techUserId = techUser.body.data.user.id;
  
  // Reassign the user to the test company as a technician
  await prisma.companyMember.updateMany({
    where: { userId: techUserId },
    data: { companyId: companyId, role: "TECHNICIAN", status: "ACTIVE" },
  });
  
  // Delete the temporary company
  await prisma.company.delete({
    where: { id: tempCompanyId },
  });
  
  return {
    userId: techUserId,
  };
}

describe("Phase C5 — Scheduling Conflict Detection Concurrency", () => {
  it("detects conflicts when scheduling overlapping jobs for same technician", async () => {
    const owner = await registerOwner("c5-conflict");
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const { customerId, serviceAddressId } = await createCustomerWithAddress(auth);
    const technician = await createTechnician(auth, owner.companyId);

    // Create first job and schedule it
    const job1 = await createJob(auth, customerId, serviceAddressId);
    await request(app)
      .post(`/api/v1/jobs/${job1}/assign`)
      .set(auth)
      .send({ technicianId: technician.userId });
    
    const schedule1 = await request(app)
      .post(`/api/v1/schedule/jobs/${job1}/schedule`)
      .set(auth)
      .send({
        scheduledStart: new Date("2026-09-25T10:00:00.000Z"),
        scheduledEnd: new Date("2026-09-25T12:00:00.000Z"),
      });
    expect(schedule1.status).toBe(200);
    expect(schedule1.body.data.warnings).toHaveLength(0);

    // Create second job and try to schedule overlapping time
    const job2 = await createJob(auth, customerId, serviceAddressId);
    await request(app)
      .post(`/api/v1/jobs/${job2}/assign`)
      .set(auth)
      .send({ technicianId: technician.userId });
    
    const schedule2 = await request(app)
      .post(`/api/v1/schedule/jobs/${job2}/schedule`)
      .set(auth)
      .send({
        scheduledStart: new Date("2026-09-25T11:00:00.000Z"),
        scheduledEnd: new Date("2026-09-25T13:00:00.000Z"),
      });
    expect(schedule2.status).toBe(200);
    expect(schedule2.body.data.warnings).toHaveLength(1);
    expect(schedule2.body.data.warnings[0].code).toBe("TECHNICIAN_SCHEDULE_CONFLICT");
    expect(schedule2.body.data.warnings[0].jobId).toBe(job1);
  });

  it("allows non-overlapping schedules for same technician", async () => {
    const owner = await registerOwner("c5-no-conflict");
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const { customerId, serviceAddressId } = await createCustomerWithAddress(auth);
    const technician = await createTechnician(auth, owner.companyId);

    // Create first job and schedule it
    const job1 = await createJob(auth, customerId, serviceAddressId);
    await request(app)
      .post(`/api/v1/jobs/${job1}/assign`)
      .set(auth)
      .send({ technicianId: technician.userId });
    
    const schedule1 = await request(app)
      .post(`/api/v1/schedule/jobs/${job1}/schedule`)
      .set(auth)
      .send({
        scheduledStart: new Date("2026-09-25T10:00:00.000Z"),
        scheduledEnd: new Date("2026-09-25T12:00:00.000Z"),
      });
    expect(schedule1.status).toBe(200);
    expect(schedule1.body.data.warnings).toHaveLength(0);

    // Create second job with non-overlapping time
    const job2 = await createJob(auth, customerId, serviceAddressId);
    await request(app)
      .post(`/api/v1/jobs/${job2}/assign`)
      .set(auth)
      .send({ technicianId: technician.userId });
    
    const schedule2 = await request(app)
      .post(`/api/v1/schedule/jobs/${job2}/schedule`)
      .set(auth)
      .send({
        scheduledStart: new Date("2026-09-25T14:00:00.000Z"),
        scheduledEnd: new Date("2026-09-25T16:00:00.000Z"),
      });
    expect(schedule2.status).toBe(200);
    expect(schedule2.body.data.warnings).toHaveLength(0);
  });

  it("detects conflicts when assigning technician to scheduled jobs", async () => {
    const owner = await registerOwner("c5-assign-conflict");
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const { customerId, serviceAddressId } = await createCustomerWithAddress(auth);
    const technician = await createTechnician(auth, owner.companyId);

    // Create and schedule first job
    const job1 = await createJob(auth, customerId, serviceAddressId);
    await request(app)
      .post(`/api/v1/jobs/${job1}/assign`)
      .set(auth)
      .send({ technicianId: technician.userId });
    
    await request(app)
      .post(`/api/v1/schedule/jobs/${job1}/schedule`)
      .set(auth)
      .send({
        scheduledStart: new Date("2026-09-25T10:00:00.000Z"),
        scheduledEnd: new Date("2026-09-25T12:00:00.000Z"),
      });

    // Create second job with overlapping time and assign same technician
    const job2 = await createJob(auth, customerId, serviceAddressId);
    await request(app)
      .post(`/api/v1/jobs/${job2}/schedule`)
      .set(auth)
      .send({
        scheduledStart: new Date("2026-09-25T11:00:00.000Z"),
        scheduledEnd: new Date("2026-09-25T13:00:00.000Z"),
      });
    
    const assign = await request(app)
      .post(`/api/v1/jobs/${job2}/assign`)
      .set(auth)
      .send({ technicianId: technician.userId });
    expect(assign.status).toBe(200);
    expect(assign.body.data.warnings).toHaveLength(1);
    expect(assign.body.data.warnings[0].code).toBe("TECHNICIAN_SCHEDULE_CONFLICT");
  });

  it("handles concurrent scheduling requests atomically", async () => {
    const owner = await registerOwner("c5-concurrent");
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const { customerId, serviceAddressId } = await createCustomerWithAddress(auth);
    const technician = await createTechnician(auth, owner.companyId);

    // Create two jobs
    const job1 = await createJob(auth, customerId, serviceAddressId);
    const job2 = await createJob(auth, customerId, serviceAddressId);
    
    // Assign both to same technician
    await request(app)
      .post(`/api/v1/jobs/${job1}/assign`)
      .set(auth)
      .send({ technicianId: technician.userId });
    await request(app)
      .post(`/api/v1/jobs/${job2}/assign`)
      .set(auth)
      .send({ technicianId: technician.userId });

    // Try to schedule both jobs for overlapping times concurrently
    const overlappingTime = {
      scheduledStart: new Date("2026-09-25T10:00:00.000Z"),
      scheduledEnd: new Date("2026-09-25T12:00:00.000Z"),
    };

    const [schedule1, schedule2] = await Promise.all([
      request(app)
        .post(`/api/v1/schedule/jobs/${job1}/schedule`)
        .set(auth)
        .send(overlappingTime),
      request(app)
        .post(`/api/v1/schedule/jobs/${job2}/schedule`)
        .set(auth)
        .send(overlappingTime),
    ]);

    // Both should succeed (transactional safety)
    expect(schedule1.status).toBe(200);
    expect(schedule2.status).toBe(200);
    
    // At least one should detect a conflict
    const hasConflict1 = schedule1.body.data.warnings.length > 0;
    const hasConflict2 = schedule2.body.data.warnings.length > 0;
    expect(hasConflict1 || hasConflict2).toBe(true);
  });

  it("does not create hard conflicts when transactional detection is used", async () => {
    const owner = await registerOwner("c5-transactional");
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const { customerId, serviceAddressId } = await createCustomerWithAddress(auth);
    const technician = await createTechnician(auth, owner.companyId);

    // Create first job and schedule it
    const job1 = await createJob(auth, customerId, serviceAddressId);
    await request(app)
      .post(`/api/v1/jobs/${job1}/assign`)
      .set(auth)
      .send({ technicianId: technician.userId });
    
    await request(app)
      .post(`/api/v1/schedule/jobs/${job1}/schedule`)
      .set(auth)
      .send({
        scheduledStart: new Date("2026-09-25T10:00:00.000Z"),
        scheduledEnd: new Date("2026-09-25T12:00:00.000Z"),
      });

    // Verify job1 is scheduled
    const getJob1 = await request(app).get(`/api/v1/jobs/${job1}`).set(auth);
    expect(getJob1.body.data.status).toBe("SCHEDULED");
    expect(getJob1.body.data.scheduledStart).toBeTruthy();
    expect(getJob1.body.data.scheduledEnd).toBeTruthy();

    // Create second job and try overlapping schedule
    const job2 = await createJob(auth, customerId, serviceAddressId);
    await request(app)
      .post(`/api/v1/jobs/${job2}/assign`)
      .set(auth)
      .send({ technicianId: technician.userId });
    
    const schedule2 = await request(app)
      .post(`/api/v1/schedule/jobs/${job2}/schedule`)
      .set(auth)
      .send({
        scheduledStart: new Date("2026-09-25T11:00:00.000Z"),
        scheduledEnd: new Date("2026-09-25T13:00:00.000Z"),
      });

    // Schedule should succeed with conflict warning (not hard error)
    expect(schedule2.status).toBe(200);
    expect(schedule2.body.data.warnings).toHaveLength(1);
    
    // Verify job2 is also scheduled (soft conflict allowed)
    const getJob2 = await request(app).get(`/api/v1/jobs/${job2}`).set(auth);
    expect(getJob2.body.data.status).toBe("SCHEDULED");
  });

  it("maintains data consistency during concurrent rescheduling", async () => {
    const owner = await registerOwner("c5-reschedule");
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const { customerId, serviceAddressId } = await createCustomerWithAddress(auth);
    const technician = await createTechnician(auth, owner.companyId);

    // Create and schedule job
    const job = await createJob(auth, customerId, serviceAddressId);
    await request(app)
      .post(`/api/v1/jobs/${job}/assign`)
      .set(auth)
      .send({ technicianId: technician.userId });
    
    await request(app)
      .post(`/api/v1/schedule/jobs/${job}/schedule`)
      .set(auth)
      .send({
        scheduledStart: new Date("2026-09-25T10:00:00.000Z"),
        scheduledEnd: new Date("2026-09-25T12:00:00.000Z"),
      });

    // Try to reschedule multiple times concurrently
    const newTimes = [
      { scheduledStart: new Date("2026-09-25T14:00:00.000Z"), scheduledEnd: new Date("2026-09-25T16:00:00.000Z") },
      { scheduledStart: new Date("2026-09-25T16:00:00.000Z"), scheduledEnd: new Date("2026-09-25T18:00:00.000Z") },
      { scheduledStart: new Date("2026-09-25T18:00:00.000Z"), scheduledEnd: new Date("2026-09-25T20:00:00.000Z") },
    ];

    const reschedules = await Promise.all(
      newTimes.map((time) =>
        request(app)
          .post(`/api/v1/schedule/jobs/${job}/reschedule`)
          .set(auth)
          .send(time),
      ),
    );

    // All should succeed (transactional safety)
    reschedules.forEach((res) => {
      expect(res.status).toBe(200);
    });

    // Verify final state is consistent
    const finalJob = await request(app).get(`/api/v1/jobs/${job}`).set(auth);
    expect(finalJob.status).toBe(200);
    expect(finalJob.body.data.status).toBe("SCHEDULED");
    expect(finalJob.body.data.scheduledStart).toBeTruthy();
    expect(finalJob.body.data.scheduledEnd).toBeTruthy();
  });
});
