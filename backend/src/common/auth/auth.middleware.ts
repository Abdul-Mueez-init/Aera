import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors.js";
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

  request.auth = auth;
  next();
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
