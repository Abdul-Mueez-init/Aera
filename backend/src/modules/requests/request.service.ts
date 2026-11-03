import { AppError } from "../../common/errors.js";
import type { AuthContext } from "../../common/auth/auth.types.js";
import { prisma } from "../../db/prisma.js";
import { getNextCounter } from "../../common/counters/counter.service.js";
import {
  assertRequestTransition,
  type ServiceRequestStatusValue,
} from "./request.state.js";
import type {
  createRequestSchema,
  updateRequestSchema,
} from "./request.schemas.js";
import type { z } from "zod";

type CreateRequestInput = z.infer<typeof createRequestSchema>;
type UpdateRequestInput = z.infer<typeof updateRequestSchema>;

const requestSelect = {
  id: true,
  companyId: true,
  requestNumber: true,
  customerId: true,
  serviceAddressId: true,
  title: true,
  description: true,
  serviceCategory: true,
  priority: true,
  status: true,
  requiresInspection: true,
  source: true,
  preferredWindows: true,
  budgetMinMinor: true,
  budgetMaxMinor: true,
  budgetCurrency: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true,
  customer: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
    },
  },
  serviceAddress: {
    select: {
      id: true,
      label: true,
      line1: true,
      line2: true,
      city: true,
      region: true,
      postalCode: true,
      countryCode: true,
    },
  },
} as const;

function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, nestedValue: unknown) =>
      typeof nestedValue === "bigint" ? nestedValue.toString() : nestedValue,
    ),
  ) as T;
}

async function assertReferences(
  companyId: string,
  customerId: string,
  serviceAddressId: string,
) {
  const address = await prisma.serviceAddress.findFirst({
    where: {
      id: serviceAddressId,
      companyId,
      customerId,
      customer: { status: "ACTIVE" },
    },
    select: { id: true },
  });
  if (!address) {
    throw new AppError(
      "REQUEST_INVALID_REFERENCES",
      "Customer and service address must belong to the company",
      422,
    );
  }
}

export async function listRequests(
  context: AuthContext,
  filters: {
    page: number;
    pageSize: number;
    status?: ServiceRequestStatusValue;
    priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
    requiresInspection?: boolean;
    search?: string;
  },
) {
  const where = {
    companyId: context.companyId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(filters.requiresInspection === undefined
      ? {}
      : { requiresInspection: filters.requiresInspection }),
    ...(filters.search
      ? {
          OR: [
            {
              title: { contains: filters.search, mode: "insensitive" as const },
            },
            {
              description: {
                contains: filters.search,
                mode: "insensitive" as const,
              },
            },
          ],
        }
      : {}),
  };
  const skip = (filters.page - 1) * filters.pageSize;
  const [items, total] = await prisma.$transaction([
    prisma.serviceRequest.findMany({
      where,
      select: requestSelect,
      orderBy: { createdAt: "desc" },
      skip,
      take: filters.pageSize,
    }),
    prisma.serviceRequest.count({ where }),
  ]);
  return jsonSafe({
    items,
    meta: {
      page: filters.page,
      pageSize: filters.pageSize,
      total,
      pageCount: Math.ceil(total / filters.pageSize),
    },
  });
}

export async function getRequest(context: AuthContext, requestId: string) {
  const request = await prisma.serviceRequest.findFirst({
    where: { id: requestId, companyId: context.companyId },
    select: {
      ...requestSelect,
      events: {
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          type: true,
          fromStatus: true,
          toStatus: true,
          metadata: true,
          createdAt: true,
          actor: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      attachments: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          mimeType: true,
          kind: true,
          sizeBytes: true,
          caption: true,
          objectKey: true,
          createdAt: true,
        },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        take: 200,
        select: {
          id: true,
          authorType: true,
          body: true,
          createdAt: true,
          authorUser: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });
  if (!request) {
    throw new AppError("RESOURCE_NOT_FOUND", "Service request not found", 404);
  }
  return jsonSafe(request);
}

export async function createRequest(
  context: AuthContext,
  input: CreateRequestInput,
) {
  await assertReferences(
    context.companyId,
    input.customerId,
    input.serviceAddressId,
  );
  const request = await prisma.$transaction(async (transaction) => {
    const requestNumber = await getNextCounter(
      context.companyId,
      "SERVICE_REQUEST",
      transaction,
    );
    const created = await transaction.serviceRequest.create({
      data: {
        companyId: context.companyId,
        customerId: input.customerId,
        serviceAddressId: input.serviceAddressId,
        requestNumber,
        title: input.title,
        description: input.description,
        serviceCategory: input.serviceCategory,
        priority: input.priority ?? "NORMAL",
        requiresInspection: input.requiresInspection ?? false,
        source: input.source,
        preferredWindows: input.preferredWindows,
        budgetMinMinor:
          input.budgetMinMinor === undefined
            ? undefined
            : BigInt(input.budgetMinMinor),
        budgetMaxMinor:
          input.budgetMaxMinor === undefined
            ? undefined
            : BigInt(input.budgetMaxMinor),
        budgetCurrency: input.budgetCurrency?.toUpperCase(),
      },
      select: requestSelect,
    });
    await transaction.serviceRequestEvent.create({
      data: {
        companyId: context.companyId,
        requestId: created.id,
        actorUserId: context.userId,
        type: "CREATED",
        toStatus: "SUBMITTED",
      },
    });
    return created;
  });
  return jsonSafe(request);
}

export async function createPortalRequest(
  context: {
    companyId: string;
    customerId: string;
    sessionId: string;
  },
  input: Omit<CreateRequestInput, "customerId" | "source"> & {
    submissionKey: string;
  },
) {
  await assertReferences(
    context.companyId,
    context.customerId,
    input.serviceAddressId,
  );
  const existing = await prisma.serviceRequest.findFirst({
    where: {
      companyId: context.companyId,
      customerId: context.customerId,
      submissionKey: input.submissionKey,
    },
    select: requestSelect,
  });
  if (existing) return jsonSafe(existing);
  const request = await prisma.$transaction(async (transaction) => {
    const requestNumber = await getNextCounter(
      context.companyId,
      "SERVICE_REQUEST",
      transaction,
    );
    const created = await transaction.serviceRequest.create({
      data: {
        companyId: context.companyId,
        customerId: context.customerId,
        serviceAddressId: input.serviceAddressId,
        requestNumber,
        title: input.title,
        description: input.description,
        serviceCategory: input.serviceCategory,
        priority: input.priority ?? "NORMAL",
        requiresInspection: input.requiresInspection ?? false,
        source: "WEB_PORTAL",
        submissionKey: input.submissionKey,
        preferredWindows: input.preferredWindows,
        budgetMinMinor:
          input.budgetMinMinor === undefined
            ? undefined
            : BigInt(input.budgetMinMinor),
        budgetMaxMinor:
          input.budgetMaxMinor === undefined
            ? undefined
            : BigInt(input.budgetMaxMinor),
        budgetCurrency: input.budgetCurrency?.toUpperCase(),
      },
      select: requestSelect,
    });
    await transaction.serviceRequestEvent.create({
      data: {
        companyId: context.companyId,
        requestId: created.id,
        type: "CREATED",
        toStatus: "SUBMITTED",
        metadata: { portalSessionId: context.sessionId },
      },
    });
    return created;
  });
  return jsonSafe(request);
}

export async function updateRequest(
  context: AuthContext,
  requestId: string,
  input: UpdateRequestInput,
) {
  const existing = await prisma.serviceRequest.findFirst({
    where: { id: requestId, companyId: context.companyId },
    select: { id: true, status: true },
  });
  if (!existing)
    throw new AppError("RESOURCE_NOT_FOUND", "Service request not found", 404);
  const updated = await prisma.serviceRequest.update({
    where: { id: requestId },
    data: {
      ...input,
      budgetMinMinor:
        input.budgetMinMinor === undefined
          ? undefined
          : BigInt(input.budgetMinMinor),
      budgetMaxMinor:
        input.budgetMaxMinor === undefined
          ? undefined
          : BigInt(input.budgetMaxMinor),
      budgetCurrency: input.budgetCurrency?.toUpperCase(),
    },
    select: requestSelect,
  });
  return jsonSafe(updated);
}

export async function transitionRequest(
  context: AuthContext,
  requestId: string,
  toStatus: ServiceRequestStatusValue,
  eventType:
    | "STATUS_CHANGED"
    | "INSPECTION_MARKED"
    | "CLOSED"
    | "CANCELLED"
    | "REOPENED" = "STATUS_CHANGED",
) {
  const current = await prisma.serviceRequest.findFirst({
    where: { id: requestId, companyId: context.companyId },
    select: { status: true },
  });
  if (!current)
    throw new AppError("RESOURCE_NOT_FOUND", "Service request not found", 404);
  assertRequestTransition(current.status, toStatus);
  return prisma.$transaction(async (transaction) => {
    const claimed = await transaction.serviceRequest.updateMany({
      where: {
        id: requestId,
        companyId: context.companyId,
        status: current.status,
      },
      data: {
        status: toStatus,
        closedAt: toStatus === "CLOSED" ? new Date() : undefined,
      },
    });
    if (claimed.count !== 1) {
      throw new AppError(
        "REQUEST_STATE_CHANGED",
        "Service request changed; retry",
        409,
      );
    }
    await transaction.serviceRequestEvent.create({
      data: {
        companyId: context.companyId,
        requestId,
        actorUserId: context.userId,
        type: eventType,
        fromStatus: current.status,
        toStatus,
      },
    });
    return getRequest(context, requestId);
  });
}
