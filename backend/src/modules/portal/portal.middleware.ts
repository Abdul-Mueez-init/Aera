import type { Request, Response, NextFunction } from "express";
import { env } from "../../config/env.js";
import { AppError } from "../../common/errors.js";
import { getPortalSessionToken, validatePortalSession } from "./portal.session.js";

/**
 * Extended request type with portal session context.
 */
export interface PortalRequest extends Request {
  portal?: {
    sessionId: string;
    grantId: string;
    companyId: string;
    customerId: string;
    jobId: string;
    expiresAt: Date;
  };
}

/**
 * Middleware to require a valid portal session.
 * Attaches session context to request.portal.
 */
export async function requirePortalSession(
  request: PortalRequest,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const token = getPortalSessionToken(request);
  if (!token) {
    throw new AppError(
      "PORTAL_SESSION_REQUIRED",
      "Portal session required",
      401,
    );
  }

  try {
    const session = await validatePortalSession(token);
    request.portal = session;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * CSRF guard for portal POST requests.
 * Requires X-Aera-Portal header (forces CORS preflight) and validates Origin.
 */
export function portalCsrfGuard(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  // Require the custom header (forces CORS preflight on browsers)
  if (request.headers["x-aera-portal"] !== "1") {
    throw new AppError(
      "CSRF_HEADER_REQUIRED",
      "CSRF header required",
      403,
    );
  }

  // Validate Origin header if present
  const origin = request.headers.origin;
  if (origin && env.CORS_ORIGINS) {
    if (!env.CORS_ORIGINS.includes(origin)) {
      throw new AppError(
        "CSRF_ORIGIN_INVALID",
        "Invalid origin",
        403,
      );
    }
  }

  next();
}

/**
 * Add Cache-Control: no-store headers to prevent caching of portal responses.
 */
export function noStoreHeaders(
  _request: Request,
  response: Response,
  next: NextFunction,
): void {
  response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Expires", "0");
  next();
}
