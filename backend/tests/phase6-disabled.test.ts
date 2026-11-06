/**
 * Phase 6 flag-off contract: with COMPLETION_REVIEW_ENABLED and
 * INVOICE_FROM_SCOPE_ENABLED unset, the review/change-request routes 404,
 * diagnostic completion does not require findings, and invoice generation
 * produces no AUTHORIZATION/credit scope lines.
 */
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

type App = ReturnType<(typeof import("../src/app.js"))["buildApp"]>;
type PrismaClient = (typeof import("../src/db/prisma.js"))["prisma"];

let app: App;
let prisma: PrismaClient;

beforeAll(async () => {
  app = (await import("../src/app.js")).buildApp();
  prisma = (await import("../src/db/prisma.js")).prisma;
}, 60000);

function suffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

let fx: {
  companyId: string;
  auth: { Authorization: string };
  customerId: string;
  addressId: string;
};

beforeEach(async () => {
  await prisma.$transaction([
    prisma.portalDeliveryToken.deleteMany(),
    prisma.portalSession.deleteMany(),
    prisma.portalAccessGrant.deleteMany(),
    prisma.portalAuditEvent.deleteMany(),
    prisma.refund.deleteMany(),
    prisma.invoiceCreditApplication.deleteMany(),
    prisma.invoiceDisputeEvent.deleteMany(),
    prisma.invoiceDispute.deleteMany(),
    prisma.paymentOperation.deleteMany(),
    prisma.paymentSession.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.customerReview.deleteMany(),
    prisma.invoiceItem.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.jobChangeRequest.deleteMany(),
    prisma.jobFinding.deleteMany(),
    prisma.jobTrackingState.deleteMany(),
    prisma.jobStatusHistory.deleteMany(),
    prisma.jobPhoto.deleteMany(),
    prisma.jobNote.deleteMany(),
    prisma.jobPart.deleteMany(),
    prisma.job.deleteMany(),
    prisma.quoteApprovalEvent.deleteMany(),
    prisma.quoteAcceptance.deleteMany(),
    prisma.quoteItem.deleteMany(),
    prisma.quote.deleteMany(),
    prisma.appointmentHold.deleteMany(),
    prisma.appointmentProposal.deleteMany(),
    prisma.serviceRequestMessage.deleteMany(),
    prisma.serviceRequestAttachment.deleteMany(),
    prisma.serviceRequestUpload.deleteMany(),
    prisma.serviceRequestEvent.deleteMany(),
    prisma.serviceRequest.deleteMany(),
    prisma.serviceAddress.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.notificationOutbox.deleteMany(),
    prisma.providerWebhookEvent.deleteMany(),
    prisma.companyMember.deleteMany(),
    prisma.refreshSession.deleteMany(),
    prisma.user.deleteMany(),
    prisma.company.deleteMany(),
  ]);
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({
      email: `p6off-${suffix()}@example.com`,
      password: "correct-horse-battery-staple",
      firstName: "Owner",
      lastName: "Off",
      companyName: `P6Off ${suffix()}`,
    });
  expect(res.status).toBe(201);
  fx = {
    companyId: res.body.data.company.id as string,
    auth: { Authorization: `Bearer ${res.body.data.accessToken}` },
    customerId: "",
    addressId: "",
  };
  const customer = await prisma.customer.create({
    data: {
      companyId: fx.companyId,
      firstName: "Casey",
      lastName: "Customer",
      email: `casey-${suffix()}@example.com`,
    },
  });
  const address = await prisma.serviceAddress.create({
    data: {
      companyId: fx.companyId,
      customerId: customer.id,
      label: "Home",
      line1: "1 Main St",
      city: "Austin",
      region: "TX",
      postalCode: "78701",
      countryCode: "US",
    },
  });
  fx.customerId = customer.id;
  fx.addressId = address.id;
});

describe("Phase 6 disabled", () => {
  it("review and change-request routes 404", async () => {
    const job = await prisma.job.create({
      data: {
        companyId: fx.companyId,
        customerId: fx.customerId,
        serviceAddressId: fx.addressId,
        jobNumber: Math.floor(Math.random() * 900_000) + 1000,
        serviceType: "HVAC Repair",
        problemDescription: "Needs repair",
        status: "COMPLETED",
      },
    });
    for (const [method, path, body] of [
      ["post", `/api/v1/jobs/${job.id}/review`, { decision: "APPROVED" }],
      ["get", `/api/v1/jobs/${job.id}/change-requests`, undefined],
      [
        "post",
        `/api/v1/jobs/${job.id}/change-requests`,
        {
          reason: "Extra",
          description: "More work",
          estimatedPriceMinor: 100,
          currency: "USD",
        },
      ],
      [
        "post",
        `/api/v1/jobs/${job.id}/change-requests/00000000-0000-0000-0000-000000000000/quote`,
        {},
      ],
    ] as const) {
      const req = request(app);
      const res =
        method === "get"
          ? await req.get(path).set(fx.auth)
          : await req.post(path).set(fx.auth).send(body);
      expect(res.status).toBe(404);
    }
  });

  it("diagnostic job completes without a finding when flag is off", async () => {
    const job = await prisma.job.create({
      data: {
        companyId: fx.companyId,
        customerId: fx.customerId,
        serviceAddressId: fx.addressId,
        jobNumber: Math.floor(Math.random() * 900_000) + 1000,
        serviceType: "Diagnostic",
        problemDescription: "No cooling",
        type: "DIAGNOSTIC",
        status: "IN_PROGRESS",
        startedAt: new Date(),
      },
    });
    const res = await request(app)
      .post(`/api/v1/jobs/${job.id}/complete`)
      .set(fx.auth)
      .send({ summary: "Checked unit" });
    expect(res.status).toBe(200);
    expect(res.body.data.reviewState).toBe("NOT_REQUIRED");
  });
});
