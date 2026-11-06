import { AppError } from "../../common/errors.js";
import type { AuthContext } from "../../common/auth/auth.types.js";
import { prisma } from "../../db/prisma.js";
import { getNextCounter } from "../../common/counters/counter.service.js";
import { notificationPublisher } from "../notifications/notification.port.js";
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
  equipmentInfo: true,
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
    aging?: "24h" | "72h";
    search?: string;
  },
) {
  const agingHours =
    filters.aging === "24h" ? 24 : filters.aging === "72h" ? 72 : undefined;
  const openStatuses: ServiceRequestStatusValue[] = [
    "SUBMITTED",
    "NEEDS_INFO",
    "QUOTING",
    "QUOTED",
    "ACCEPTED",
  ];
  const statusFilter =
    agingHours !== undefined
      ? filters.status
        ? openStatuses.filter((s) => s === filters.status)
        : openStatuses
      : filters.status
        ? [filters.status]
        : undefined;
  const where = {
    companyId: context.companyId,
    ...(statusFilter ? { status: { in: statusFilter } } : {}),
    ...(agingHours !== undefined
      ? {
          createdAt: {
            lt: new Date(Date.now() - agingHours * 60 * 60 * 1000),
          },
        }
      : {}),
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
        equipmentInfo: input.equipmentInfo,
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
  void notificationPublisher.publish({
    type: "REQUEST_SUBMITTED",
    companyId: context.companyId,
    requestId: request.id,
  });
  return jsonSafe(request);
}

const PORTAL_REQUESTS_PER_DAY = 10;

export interface PortalNewAddress {
  label?: string;
  line1: string;
  line2?: string;
  city: string;
  region?: string;
  postalCode?: string;
  countryCode: string;
}

export async function createPortalRequest(
  context: {
    companyId: string;
    customerId: string;
    sessionId: string;
  },
  input: Omit<CreateRequestInput, "customerId" | "source" | "serviceAddressId"> & {
    serviceAddressId?: string;
    newAddress?: PortalNewAddress;
    submissionKey: string;
  },
) {
  if (!input.serviceAddressId && !input.newAddress) {
    throw new AppError(
      "REQUEST_INVALID_REFERENCES",
      "A service address or a new address is required",
      422,
    );
  }
  if (input.serviceAddressId) {
    await assertReferences(
      context.companyId,
      context.customerId,
      input.serviceAddressId,
    );
  } else {
    // New-address path: the customer must still be ACTIVE in this company.
    const customer = await prisma.customer.findFirst({
      where: {
        id: context.customerId,
        companyId: context.companyId,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    if (!customer) {
      throw new AppError("RESOURCE_NOT_FOUND", "Customer not found", 404);
    }
  }
  const existing = await prisma.serviceRequest.findFirst({
    where: {
      companyId: context.companyId,
      customerId: context.customerId,
      submissionKey: input.submissionKey,
    },
    select: requestSelect,
  });
  if (existing) return jsonSafe(existing);
  let request;
  try {
    request = await prisma.$transaction(async (transaction) => {
    // Daily abuse cap per customer: a compromised session cannot flood the
    // staff triage queue. Counted inside the transaction so concurrent
    // submits cannot both slip under the limit.
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const todayCount = await transaction.serviceRequest.count({
      where: {
        companyId: context.companyId,
        customerId: context.customerId,
        createdAt: { gte: dayAgo },
      },
    });
    if (todayCount >= PORTAL_REQUESTS_PER_DAY) {
      throw new AppError(
        "RATE_LIMITED",
        "Daily request limit reached — please contact the office directly",
        429,
      );
    }
    let serviceAddressId = input.serviceAddressId;
    if (!serviceAddressId && input.newAddress) {
      const address = await transaction.serviceAddress.create({
        data: {
          companyId: context.companyId,
          customerId: context.customerId,
          label: input.newAddress.label ?? "Service address",
          line1: input.newAddress.line1,
          line2: input.newAddress.line2,
          city: input.newAddress.city,
          region: input.newAddress.region,
          postalCode: input.newAddress.postalCode,
          countryCode: input.newAddress.countryCode.toUpperCase(),
        },
        select: { id: true },
      });
      serviceAddressId = address.id;
    }
    const requestNumber = await getNextCounter(
      context.companyId,
      "SERVICE_REQUEST",
      transaction,
    );
    const created = await transaction.serviceRequest.create({
      data: {
        companyId: context.companyId,
        customerId: context.customerId,
        serviceAddressId: serviceAddressId!,
        requestNumber,
        title: input.title,
        description: input.description,
        serviceCategory: input.serviceCategory,
        priority: input.priority ?? "NORMAL",
        requiresInspection: input.requiresInspection ?? false,
        source: "WEB_PORTAL",
        submissionKey: input.submissionKey,
        preferredWindows: input.preferredWindows,
        equipmentInfo: input.equipmentInfo,
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
  } catch (error) {
    // Lost a concurrent-submit race on the submissionKey unique index:
    // the other request won, so return it — a double tap must create one
    // request, not a 500.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
    ) {
      const raced = await prisma.serviceRequest.findFirst({
        where: {
          companyId: context.companyId,
          customerId: context.customerId,
          submissionKey: input.submissionKey,
        },
        select: requestSelect,
      });
      if (raced) return jsonSafe(raced);
    }
    throw error;
  }
  void notificationPublisher.publish({
    type: "REQUEST_SUBMITTED",
    companyId: context.companyId,
    requestId: request.id,
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
  await prisma.$transaction(async (transaction) => {
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
  });
  // Publish after commit and read the fresh row outside the transaction:
  // getRequest uses the global client, which cannot see uncommitted writes.
  void notificationPublisher.publish({
    type: "REQUEST_STATUS_CHANGED",
    companyId: context.companyId,
    requestId,
  });
  return getRequest(context, requestId);
}
