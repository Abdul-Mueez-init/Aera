import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { processQuoteResponse } from "../src/modules/quotes/quote.service.js";

const app = buildApp();

async function seedQuote(kind: "GENERAL" | "INSPECTION") {
  const suffix = `${kind.toLowerCase()}-${Date.now()}-${Math.random()}`;
  const response = await request(app).post("/api/v1/auth/register").send({
    email: `owner-${suffix}@example.com`,
    password: "correct-horse-battery-staple",
    firstName: "Owner",
    lastName: "Acceptance",
    companyName: `Company ${suffix}`,
  });
  expect(response.status).toBe(201);
  const companyId = response.body.data.company.id as string;
  const userId = response.body.data.user.id as string;
  const customer = await prisma.customer.create({
    data: { companyId, firstName: "Customer", lastName: "Acceptance" },
  });
  const address = await prisma.serviceAddress.create({
    data: {
      companyId,
      customerId: customer.id,
      label: "Home",
      line1: "1 Test Street",
      city: "Test City",
      countryCode: "US",
    },
  });
  const serviceRequest = await prisma.serviceRequest.create({
    data: {
      companyId,
      customerId: customer.id,
      serviceAddressId: address.id,
      requestNumber: Math.floor(Math.random() * 1_000_000),
      title: "Repair request",
      description: "The unit needs service",
      serviceCategory: "HVAC",
      source: "WEB_PORTAL",
      status: "QUOTED",
    },
  });
  const quote = await prisma.quote.create({
    data: {
      companyId,
      customerId: customer.id,
      serviceRequestId: serviceRequest.id,
      kind,
      status: "SENT",
      subtotalMinor: 1000n,
      totalMinor: 1000n,
      currency: "USD",
      items: {
        create: {
          companyId,
          description: "Service",
          quantity: 1,
          unitPriceMinor: 1000n,
          totalMinor: 1000n,
          sortOrder: 0,
        },
      },
    },
  });
  return { companyId, userId, quoteId: quote.id, requestId: serviceRequest.id };
}

describe("quote acceptance orchestration", () => {
  it.each([
    ["remote quote", "GENERAL" as const, "OTHER"],
    ["inspection quote", "INSPECTION" as const, "DIAGNOSTIC"],
  ])(
    "creates exactly one %s job under 20 parallel accepts",
    async (_label, kind, expectedType) => {
      const seed = await seedQuote(kind);
      await Promise.all(
        Array.from({ length: 20 }, () =>
          processQuoteResponse({
            quoteId: seed.quoteId,
            companyId: seed.companyId,
            jobId: null,
            action: "APPROVED",
            source: "STAFF",
            actorUserId: seed.userId,
          }),
        ),
      );

      const jobs = await prisma.job.findMany({
        where: { companyId: seed.companyId, sourceQuoteId: seed.quoteId },
      });
      expect(jobs).toHaveLength(1);
      expect(jobs[0]?.type).toBe(expectedType);
      expect(
        await prisma.quoteAcceptance.count({ where: { quoteId: seed.quoteId } }),
      ).toBe(1);
      expect(
        await prisma.serviceRequest.count({
          where: { id: seed.requestId, status: "ACCEPTED" },
        }),
      ).toBe(1);
    },
  );
});
