import { randomBytes } from "node:crypto";
import { AppError } from "../../common/errors.js";
import type { AuthContext } from "../../common/auth/auth.types.js";
import { prisma } from "../../db/prisma.js";

function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, nestedValue: unknown) =>
      typeof nestedValue === "bigint" ? nestedValue.toString() : nestedValue,
    ),
  ) as T;
}

export async function createPortalToken(
  context: AuthContext,
  customerId: string,
) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, companyId: context.companyId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!customer) {
    throw new AppError("RESOURCE_NOT_FOUND", "Customer not found", 404);
  }

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const token = await prisma.customerPortalToken.create({
    data: {
      companyId: context.companyId,
      customerId,
      createdBy: context.userId,
      token: randomBytes(32).toString("hex"),
      expiresAt,
    },
    select: { token: true, expiresAt: true },
  });
  return token;
}

export async function getPublicPortal(token: string) {
  const portal = await prisma.customerPortalToken.findFirst({
    where: { token, revokedAt: null, expiresAt: { gt: new Date() } },
    select: {
      customer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          serviceAddresses: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              label: true,
              line1: true,
              line2: true,
              city: true,
              region: true,
              postalCode: true,
            },
          },
          jobs: {
            where: { status: { not: "CANCELLED" } },
            orderBy: { scheduledStart: "asc" },
            take: 50,
            select: {
              id: true,
              jobNumber: true,
              serviceType: true,
              problemDescription: true,
              status: true,
              scheduledStart: true,
              scheduledEnd: true,
              completedAt: true,
              serviceAddress: {
                select: { line1: true, city: true, region: true },
              },
              assignedTechnician: {
                select: { firstName: true, lastName: true },
              },
              reviews: {
                select: { id: true, rating: true, comment: true },
                take: 1,
              },
            },
          },
          quotes: {
            where: { status: { in: ["SENT", "APPROVED", "DECLINED"] } },
            orderBy: { createdAt: "desc" },
            take: 20,
            select: {
              id: true,
              status: true,
              subtotalMinor: true,
              discountMinor: true,
              taxMinor: true,
              totalMinor: true,
              currency: true,
              shareToken: true,
              expiresAt: true,
              items: {
                orderBy: { sortOrder: "asc" },
                select: {
                  description: true,
                  quantity: true,
                  totalMinor: true,
                },
              },
            },
          },
          invoices: {
            where: { status: { not: "DRAFT" } },
            orderBy: { createdAt: "desc" },
            take: 20,
            select: {
              id: true,
              invoiceNumber: true,
              status: true,
              totalMinor: true,
              amountPaidMinor: true,
              balanceDueMinor: true,
              currency: true,
              issuedAt: true,
              dueAt: true,
              items: {
                orderBy: { sortOrder: "asc" },
                select: {
                  description: true,
                  quantity: true,
                  totalMinor: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!portal) {
    throw new AppError(
      "PORTAL_ACCESS_EXPIRED",
      "Customer portal access has expired",
      401,
    );
  }
  return jsonSafe(portal.customer);
}

export async function submitPublicReview(
  token: string,
  jobId: string,
  rating: number,
  comment?: string,
) {
  const portal = await prisma.customerPortalToken.findFirst({
    where: { token, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { companyId: true, customerId: true },
  });
  if (!portal) {
    throw new AppError(
      "PORTAL_ACCESS_EXPIRED",
      "Customer portal access has expired",
      401,
    );
  }
  const job = await prisma.job.findFirst({
    where: {
      id: jobId,
      companyId: portal.companyId,
      customerId: portal.customerId,
      status: "COMPLETED",
    },
    select: { id: true },
  });
  if (!job) {
    throw new AppError(
      "REVIEW_JOB_NOT_ELIGIBLE",
      "Completed service job not found",
      422,
    );
  }
  try {
    const review = await prisma.customerReview.create({
      data: {
        companyId: portal.companyId,
        customerId: portal.customerId,
        jobId,
        rating,
        comment: comment?.trim() || undefined,
      },
      select: { id: true, rating: true, comment: true, createdAt: true },
    });
    return review;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      throw new AppError(
        "REVIEW_ALREADY_SUBMITTED",
        "This service job already has a review",
        409,
      );
    }
    throw error;
  }
}
