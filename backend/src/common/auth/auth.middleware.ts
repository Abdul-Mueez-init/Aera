import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors.js";
import { prisma } from "../../db/prisma.js";
import { verifyAccessToken } from "./tokens.js";

export async function requireAuth(
  request: Request,
  _response: Response,
  next: NextFunction,
): Promise<void> {
  const authorization = request.header("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : undefined;
  const auth = token ? await verifyAccessToken(token) : null;

  if (!auth) {
    next(new AppError("AUTH_SESSION_EXPIRED", "Authentication required", 401));
    return;
  }

  try {
    const session = await prisma.refreshSession.findUnique({
      where: { id: auth.sessionId },
      select: {
        id: true,
        userId: true,
        companyId: true,
        revokedAt: true,
        expiresAt: true,
        user: {
          select: {
            id: true,
            isActive: true,
            memberships: {
              where: { companyId: auth.companyId },
              select: {
                role: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!session || session.expiresAt <= new Date()) {
      next(
        new AppError(
          "AUTH_SESSION_EXPIRED",
          "Authentication session has expired",
          401,
        ),
      );
      return;
    }

    if (
      session.userId !== auth.userId ||
      session.companyId !== auth.companyId
    ) {
      next(
        new AppError(
          "AUTH_UNAUTHORIZED",
          "Session does not match caller identity",
          401,
        ),
      );
      return;
    }

    if (!session.user || !session.user.isActive) {
      next(
        new AppError("AUTH_USER_INACTIVE", "User account is deactivated", 403),
      );
      return;
    }

    const membership = session.user.memberships[0];
    if (!membership) {
      next(
        new AppError(
          "AUTH_NO_ACTIVE_MEMBERSHIP",
          "No membership found for this company",
          403,
        ),
      );
      return;
    }

    if (membership.status === "SUSPENDED") {
      next(
        new AppError(
          "AUTH_MEMBERSHIP_SUSPENDED",
          "Company membership is suspended",
          403,
        ),
      );
      return;
    }

    if (membership.status !== "ACTIVE") {
      next(
        new AppError("AUTH_FORBIDDEN", "Company membership is not active", 403),
      );
      return;
    }

    if (session.revokedAt !== null) {
      next(
        new AppError(
          "AUTH_SESSION_EXPIRED",
          "Authentication session has been revoked",
          401,
        ),
      );
      return;
    }

    request.auth = {
      userId: session.userId,
      sessionId: session.id,
      companyId: session.companyId,
      role: membership.role,
    };

    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(
  ...allowedRoles: Array<"OWNER" | "DISPATCHER" | "TECHNICIAN">
) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    if (!request.auth || !allowedRoles.includes(request.auth.role)) {
      next(new AppError("AUTH_FORBIDDEN", "Insufficient permissions", 403));
      return;
    }

    next();
  };
}
