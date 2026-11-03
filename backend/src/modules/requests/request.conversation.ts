import { AppError } from "../../common/errors.js";
import type { AuthContext } from "../../common/auth/auth.types.js";
import type { PortalRequest } from "../portal/portal.middleware.js";
import { prisma } from "../../db/prisma.js";
import { assertRequestTransition } from "./request.state.js";

type PortalContext = NonNullable<PortalRequest["portal"]>;

function portalContext(request: PortalRequest): PortalContext {
  const context = request.portal;
  if (!context || context.scope !== "WORKSPACE") {
    throw new AppError("RESOURCE_NOT_FOUND", "Portal resource not found", 404);
  }
  return context;
}

async function assertRequest(
  companyId: string,
  customerId: string | undefined,
  requestId: string,
) {
  const request = await prisma.serviceRequest.findFirst({
    where: { id: requestId, companyId, ...(customerId ? { customerId } : {}) },
    select: { id: true, status: true, customerId: true },
  });
  if (!request)
    throw new AppError("RESOURCE_NOT_FOUND", "Request not found", 404);
  return request;
}

export async function listRequestMessages(
  companyId: string,
  customerId: string | undefined,
  requestId: string,
) {
  await assertRequest(companyId, customerId, requestId);
  return prisma.serviceRequestMessage.findMany({
    where: { companyId, requestId },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: {
      id: true,
      authorType: true,
      body: true,
      createdAt: true,
      authorUser: { select: { firstName: true, lastName: true } },
    },
  });
}

export async function postStaffMessage(
  context: AuthContext,
  requestId: string,
  body: string,
) {
  const request = await assertRequest(context.companyId, undefined, requestId);
  const message = await prisma.$transaction(async (transaction) => {
    const created = await transaction.serviceRequestMessage.create({
      data: {
        companyId: context.companyId,
        requestId,
        authorType: "STAFF",
        authorUserId: context.userId,
        body,
      },
    });
    if (request.status === "NEEDS_INFO") {
      const claimed = await transaction.serviceRequest.updateMany({
        where: {
          id: requestId,
          companyId: context.companyId,
          status: "NEEDS_INFO",
        },
        data: { status: "SUBMITTED" },
      });
      if (claimed.count === 1) {
        await transaction.serviceRequestEvent.create({
          data: {
            companyId: context.companyId,
            requestId,
            actorUserId: context.userId,
            type: "STATUS_CHANGED",
            fromStatus: "NEEDS_INFO",
            toStatus: "SUBMITTED",
          },
        });
      }
    }
    return created;
  });
  return message;
}

export async function postPortalMessage(
  request: PortalRequest,
  requestId: string,
  body: string,
) {
  const context = portalContext(request);
  const current = await assertRequest(
    context.companyId,
    context.customerId,
    requestId,
  );
  const message = await prisma.$transaction(async (transaction) => {
    const created = await transaction.serviceRequestMessage.create({
      data: {
        companyId: context.companyId,
        requestId,
        authorType: "CUSTOMER",
        portalSessionId: context.sessionId,
        body,
      },
    });
    if (current.status === "NEEDS_INFO") {
      const claimed = await transaction.serviceRequest.updateMany({
        where: {
          id: requestId,
          companyId: context.companyId,
          status: "NEEDS_INFO",
        },
        data: { status: "SUBMITTED" },
      });
      if (claimed.count === 1) {
        await transaction.serviceRequestEvent.create({
          data: {
            companyId: context.companyId,
            requestId,
            type: "STATUS_CHANGED",
            fromStatus: "NEEDS_INFO",
            toStatus: "SUBMITTED",
            metadata: { portalSessionId: context.sessionId },
          },
        });
      }
    }
    return created;
  });
  return message;
}

export async function requestInformation(
  context: AuthContext,
  requestId: string,
  body: string,
) {
  const current = await assertRequest(context.companyId, undefined, requestId);
  assertRequestTransition(current.status, "NEEDS_INFO");
  return prisma.$transaction(async (transaction) => {
    const claimed = await transaction.serviceRequest.updateMany({
      where: {
        id: requestId,
        companyId: context.companyId,
        status: current.status,
      },
      data: { status: "NEEDS_INFO" },
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
        type: "STATUS_CHANGED",
        fromStatus: current.status,
        toStatus: "NEEDS_INFO",
      },
    });
    return transaction.serviceRequestMessage.create({
      data: {
        companyId: context.companyId,
        requestId,
        authorType: "STAFF",
        authorUserId: context.userId,
        body,
      },
    });
  });
}
