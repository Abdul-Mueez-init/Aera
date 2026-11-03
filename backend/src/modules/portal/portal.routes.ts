import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/index.js";
import { env } from "../../config/env.js";
import { AppError } from "../../common/errors.js";
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
import { workspaceContext } from "./portal.access.js";
import { pickProposalForCustomer } from "../scheduling/booking.service.js";
import {
  getWorkspaceInvoice,
  getWorkspaceJob,
  getWorkspaceMe,
  getWorkspaceQuote,
  getWorkspaceRequest,
  listWorkspaceInvoices,
  listWorkspaceJobs,
  listWorkspaceQuotes,
  listWorkspaceRequests,
} from "./workspace.service.js";
import {
  confirmPortalRequestMedia,
  listPortalRequestMedia,
  presignPortalRequestMedia,
} from "../requests/request.media.js";
import {
  listRequestMessages,
  postPortalMessage,
} from "../requests/request.conversation.js";
import { createPortalRequest } from "../requests/request.service.js";
import { getJobTracking } from "../tracking/tracking.service.js";

const router = Router();
const pageSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
});

function portalRequestsEnabled(
  _request: Request,
  response: Response,
  next: (error?: unknown) => void,
) {
  if (!env.PORTAL_REQUESTS_ENABLED) {
    response
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Route not found" } });
    return;
  }
  next();
}

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

router.get(
  "/me",
  portalReadRateLimiter,
  requirePortalSession,
  async (request: PortalRequest, response: Response) => {
    response
      .status(200)
      .json({ data: await getWorkspaceMe(workspaceContext(request)) });
  },
);

router.get(
  "/requests",
  portalReadRateLimiter,
  requirePortalSession,
  async (request: PortalRequest, response: Response) => {
    const parsed = pageSchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(422).json({
        error: { code: "VALIDATION_FAILED", message: "Invalid pagination" },
      });
      return;
    }
    response.status(200).json({
      data: await listWorkspaceRequests(
        workspaceContext(request),
        parsed.data.page,
        parsed.data.pageSize,
      ),
    });
  },
);

router.get(
  "/requests/:requestId",
  portalReadRateLimiter,
  requirePortalSession,
  async (request: PortalRequest, response: Response) => {
    response.status(200).json({
      data: await getWorkspaceRequest(
        workspaceContext(request),
        request.params.requestId as string,
      ),
    });
  },
);

const appointmentWindowSchema = z.object({
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
});

router.post(
  "/appointment-proposals/:proposalId/pick",
  portalReadRateLimiter,
  requirePortalSession,
  portalCsrfGuard,
  async (request: PortalRequest, response: Response) => {
    const parsed = appointmentWindowSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(422).json({
        error: {
          code: "VALIDATION_FAILED",
          message: "Invalid appointment window",
        },
      });
      return;
    }
    const context = workspaceContext(request);
    response.status(200).json({
      data: await pickProposalForCustomer(
        {
          companyId: context.companyId,
          customerId: context.customerId,
          sessionId: context.sessionId,
        },
        request.params.proposalId as string,
        parsed.data,
      ),
    });
  },
);

const requestMediaSchema = z.object({
  mimeType: z.string().trim().min(1).max(100),
});
const requestMediaConfirmSchema = z.object({
  objectKey: z.string().trim().min(1).max(500),
  mimeType: z.string().trim().min(1).max(100),
});
const requestMessageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});
const createPortalRequestSchema = z.object({
  submissionKey: z.string().trim().min(16).max(128),
  serviceAddressId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(4000),
  serviceCategory: z.string().trim().min(1).max(120),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  requiresInspection: z.boolean().optional(),
  preferredWindows: z.custom<Prisma.InputJsonValue>().optional(),
  budgetMinMinor: z.number().int().nonnegative().optional(),
  budgetMaxMinor: z.number().int().nonnegative().optional(),
  budgetCurrency: z
    .string()
    .regex(/^[A-Za-z]{3}$/)
    .optional(),
});

router.post(
  "/requests",
  portalWriteRateLimiter,
  portalRequestsEnabled,
  requirePortalSession,
  portalCsrfGuard,
  async (request: PortalRequest, response: Response) => {
    const parsed = createPortalRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(422).json({
        error: { code: "VALIDATION_FAILED", message: "Invalid request" },
      });
      return;
    }
    const context = workspaceContext(request);
    response.status(201).json({
      data: await createPortalRequest(context, {
        ...parsed.data,
        preferredWindows: parsed.data.preferredWindows,
        submissionKey: parsed.data.submissionKey,
      }),
    });
  },
);

router.get(
  "/requests/:requestId/media",
  portalReadRateLimiter,
  portalRequestsEnabled,
  requirePortalSession,
  async (request: PortalRequest, response: Response) => {
    response.status(200).json({
      data: await listPortalRequestMedia(
        request,
        request.params.requestId as string,
      ),
    });
  },
);

router.post(
  "/requests/:requestId/media/presign",
  portalWriteRateLimiter,
  portalRequestsEnabled,
  requirePortalSession,
  portalCsrfGuard,
  async (request: PortalRequest, response: Response) => {
    const parsed = requestMediaSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(422).json({
        error: { code: "VALIDATION_FAILED", message: "Invalid media type" },
      });
      return;
    }
    response.status(201).json({
      data: await presignPortalRequestMedia(
        request,
        request.params.requestId as string,
        parsed.data.mimeType,
      ),
    });
  },
);

router.post(
  "/requests/:requestId/media",
  portalWriteRateLimiter,
  portalRequestsEnabled,
  requirePortalSession,
  portalCsrfGuard,
  async (request: PortalRequest, response: Response) => {
    const parsed = requestMediaConfirmSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(422).json({
        error: {
          code: "VALIDATION_FAILED",
          message: "Invalid media confirmation",
        },
      });
      return;
    }
    response.status(201).json({
      data: await confirmPortalRequestMedia(
        request,
        request.params.requestId as string,
        parsed.data.objectKey,
        parsed.data.mimeType,
      ),
    });
  },
);

router.get(
  "/requests/:requestId/messages",
  portalReadRateLimiter,
  portalRequestsEnabled,
  requirePortalSession,
  async (request: PortalRequest, response: Response) => {
    const context = workspaceContext(request);
    response.status(200).json({
      data: await listRequestMessages(
        context.companyId,
        context.customerId,
        request.params.requestId as string,
      ),
    });
  },
);

router.post(
  "/requests/:requestId/messages",
  portalWriteRateLimiter,
  portalRequestsEnabled,
  requirePortalSession,
  portalCsrfGuard,
  async (request: PortalRequest, response: Response) => {
    const parsed = requestMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(422).json({
        error: { code: "VALIDATION_FAILED", message: "Invalid message" },
      });
      return;
    }
    response.status(201).json({
      data: await postPortalMessage(
        request,
        request.params.requestId as string,
        parsed.data.body,
      ),
    });
  },
);

router.get(
  "/quotes",
  portalReadRateLimiter,
  requirePortalSession,
  async (request: PortalRequest, response: Response) => {
    const parsed = pageSchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(422).json({
        error: { code: "VALIDATION_FAILED", message: "Invalid pagination" },
      });
      return;
    }
    response.status(200).json({
      data: await listWorkspaceQuotes(
        workspaceContext(request),
        parsed.data.page,
        parsed.data.pageSize,
      ),
    });
  },
);

router.get(
  "/quotes/:quoteId",
  portalReadRateLimiter,
  requirePortalSession,
  async (request: PortalRequest, response: Response) => {
    response.status(200).json({
      data: await getWorkspaceQuote(
        workspaceContext(request),
        request.params.quoteId as string,
      ),
    });
  },
);

router.get(
  "/jobs",
  portalReadRateLimiter,
  requirePortalSession,
  async (request: PortalRequest, response: Response) => {
    const parsed = pageSchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(422).json({
        error: { code: "VALIDATION_FAILED", message: "Invalid pagination" },
      });
      return;
    }
    response.status(200).json({
      data: await listWorkspaceJobs(
        workspaceContext(request),
        parsed.data.page,
        parsed.data.pageSize,
      ),
    });
  },
);

router.get(
  "/jobs/:jobId",
  portalReadRateLimiter,
  requirePortalSession,
  async (request: PortalRequest, response: Response) => {
    response.status(200).json({
      data: await getWorkspaceJob(
        workspaceContext(request),
        request.params.jobId as string,
      ),
    });
  },
);

router.get(
  "/jobs/:jobId/tracking",
  portalReadRateLimiter,
  requirePortalSession,
  async (request: PortalRequest, response: Response) => {
    const context = workspaceContext(request);
    response.status(200).json({
      data: await getJobTracking(context.companyId, context.customerId, request.params.jobId as string),
    });
  },
);

router.get(
  "/invoices",
  portalReadRateLimiter,
  requirePortalSession,
  async (request: PortalRequest, response: Response) => {
    const parsed = pageSchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(422).json({
        error: { code: "VALIDATION_FAILED", message: "Invalid pagination" },
      });
      return;
    }
    response.status(200).json({
      data: await listWorkspaceInvoices(
        workspaceContext(request),
        parsed.data.page,
        parsed.data.pageSize,
      ),
    });
  },
);

router.get(
  "/invoices/:invoiceId",
  portalReadRateLimiter,
  requirePortalSession,
  async (request: PortalRequest, response: Response) => {
    response.status(200).json({
      data: await getWorkspaceInvoice(
        workspaceContext(request),
        request.params.invoiceId as string,
      ),
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
    const { companyId, customerId, jobId, scope } = request.portal!;
    if (scope !== "JOB" || !jobId) {
      throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
    }
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

    const { companyId, customerId, jobId, scope, sessionId } = request.portal!;
    if (scope === "JOB" && !jobId) {
      throw new AppError("RESOURCE_NOT_FOUND", "Quote not found", 404);
    }
    if (scope !== "JOB") {
      await getWorkspaceQuote(workspaceContext(request), quoteId);
    }
    const data = await respondToQuote(
      companyId,
      customerId,
      scope === "JOB" ? jobId! : null,
      quoteId,
      parsed.data.action,
      sessionId,
    );

    response.status(200).json({ data });
  },
);

router.post(
  "/jobs/:jobId/review",
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
    const context = workspaceContext(request);
    const jobId = request.params.jobId as string;
    await getWorkspaceJob(context, jobId);
    const data = await submitReview(
      context.companyId,
      context.customerId,
      jobId,
      parsed.data.rating,
      parsed.data.comment,
    );
    response.status(201).json({ data });
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

    const { companyId, customerId, jobId, scope } = request.portal!;
    if (scope !== "JOB" || !jobId) {
      throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
    }
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
