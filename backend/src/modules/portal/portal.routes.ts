import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  exchangeToken,
  getPortalSession,
  getPortalJob,
  respondToQuote,
  submitReview,
  portalLogout,
} from "./portal.service.js";
import {
  requirePortalSession,
  PortalRequest,
  portalCsrfGuard,
  noStoreHeaders,
} from "./portal.middleware.js";
import {
  setPortalSessionCookie,
  clearPortalSessionCookie,
} from "./portal.session.js";
import {
  portalExchangeRateLimiter,
  portalReadRateLimiter,
  portalWriteRateLimiter,
} from "../../common/rateLimit.js";

const router = Router();

// Apply no-store headers to all portal responses
router.use(noStoreHeaders);

/**
 * POST /api/v1/portal/exchange
 * Exchange a link token for a session.
 */
router.post(
  "/exchange",
  portalExchangeRateLimiter,
  // The exchange sets a session cookie, so it takes the same CSRF guard as
  // every other portal POST (custom header forces a CORS preflight).
  portalCsrfGuard,
  async (request: Request, response: Response) => {
    const parsed = z
      .object({
        token: z.string().length(43),
        deliver: z.enum(["cookie", "bearer"]).optional().default("cookie"),
      })
      .safeParse(request.body);

    if (!parsed.success) {
      response.status(422).json({
        error: {
          code: "VALIDATION_FAILED",
          message: parsed.error.issues.map((issue) => issue.message).join(", "),
        },
      });
      return;
    }

    const { sessionToken } = await exchangeToken(
      parsed.data.token,
      request.headers["user-agent"],
    );

    // deliver:"bearer" is for the mobile app (Android App Link flow): the
    // session token goes in the body and the app stores it in secure storage.
    // Default is the web flow: HttpOnly cookie, token never in the body.
    if (parsed.data.deliver === "bearer") {
      response.status(200).json({
        data: { state: "ACTIVE", sessionToken },
      });
      return;
    }

    setPortalSessionCookie(response, sessionToken);
    response.status(200).json({
      data: { state: "ACTIVE" },
    });
  },
);

/**
 * GET /api/v1/portal/session
 * Lightweight probe to check if session is active.
 */
router.get(
  "/session",
  portalReadRateLimiter,
  requirePortalSession,
  async (_request: PortalRequest, response: Response) => {
    response.status(200).json({
      data: await getPortalSession(),
    });
  },
);

/**
 * GET /api/v1/portal/job
 * Get job-scoped snapshot for the portal.
 */
router.get(
  "/job",
  portalReadRateLimiter,
  requirePortalSession,
  async (request: PortalRequest, response: Response) => {
    const { companyId, customerId, jobId } = request.portal!;
    const data = await getPortalJob(companyId, customerId, jobId);
    response.status(200).json({ data });
  },
);

/**
 * POST /api/v1/portal/quotes/:quoteId/respond
 * Respond to a quote (approve/decline).
 */
router.post(
  "/quotes/:quoteId/respond",
  portalWriteRateLimiter,
  requirePortalSession,
  portalCsrfGuard,
  async (request: PortalRequest, response: Response) => {
    const parsed = z
      .object({
        action: z.enum(["APPROVED", "DECLINED"]),
      })
      .safeParse(request.body);

    if (!parsed.success) {
      response.status(422).json({
        error: {
          code: "VALIDATION_FAILED",
          message: parsed.error.issues.map((issue) => issue.message).join(", "),
        },
      });
      return;
    }

    const quoteId = Array.isArray(request.params.quoteId)
      ? request.params.quoteId[0]
      : request.params.quoteId;

    const { companyId, customerId, jobId } = request.portal!;
    const data = await respondToQuote(
      companyId,
      customerId,
      jobId,
      quoteId,
      parsed.data.action,
    );

    response.status(200).json({ data });
  },
);

/**
 * POST /api/v1/portal/reviews
 * Submit a customer review.
 */
router.post(
  "/reviews",
  portalWriteRateLimiter,
  requirePortalSession,
  portalCsrfGuard,
  async (request: PortalRequest, response: Response) => {
    const parsed = z
      .object({
        rating: z.number().int().min(1).max(5),
        comment: z.string().trim().max(2000).optional(),
      })
      .safeParse(request.body);

    if (!parsed.success) {
      response.status(422).json({
        error: {
          code: "VALIDATION_FAILED",
          message: parsed.error.issues.map((issue) => issue.message).join(", "),
        },
      });
      return;
    }

    const { companyId, customerId, jobId } = request.portal!;
    const data = await submitReview(
      companyId,
      customerId,
      jobId,
      parsed.data.rating,
      parsed.data.comment,
    );

    response.status(201).json({ data });
  },
);

/**
 * POST /api/v1/portal/logout
 * Revoke the current session.
 */
router.post(
  "/logout",
  portalWriteRateLimiter,
  requirePortalSession,
  portalCsrfGuard,
  async (request: PortalRequest, response: Response) => {
    const { sessionId } = request.portal!;
    await portalLogout(sessionId);
    clearPortalSessionCookie(response);
    response.status(200).json({
      data: { success: true },
    });
  },
);

export { router as portalRouter };
