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
import {
  confirmCustomerHold,
  createCustomerHold,
  getAvailability,
  listCustomerProposals,
  pickProposalForCustomer,
  requestCustomerReschedule,
} from "../scheduling/booking.service.js";
import {
  getWorkspaceInvoice,
  getWorkspaceJob,
  getWorkspaceMe,
  getWorkspacePaymentReceipt,
  getWorkspaceQuote,
  getWorkspaceRequest,
  listWorkspaceInvoices,
  listWorkspaceJobs,
  listWorkspacePayments,
  listWorkspaceQuotes,
  listWorkspaceRequests,
  payWorkspaceInvoice,
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
import { askQuoteQuestion } from "../quotes/quote.service.js";
import {
  createPortalDispute,
  listInvoiceDisputes,
} from "../invoices/invoice-dispute.service.js";
import { assertCanReadInvoice } from "./portal.access.js";
import { randomUUID as cryptoRandomUUID } from "node:crypto";
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

function bookingEnabled(
  _request: Request,
  response: Response,
  next: (error?: unknown) => void,
) {
  if (!env.BOOKING_ENABLED) {
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

// --- Phase 5: customer booking (availability, proposals, holds) ----------

const portalAvailabilitySchema = z.object({
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  durationMinutes: z.coerce.number().int().positive().max(1440),
  serviceId: z.string().uuid().optional(),
});

router.get(
  "/booking/availability",
  bookingEnabled,
  portalReadRateLimiter,
  requirePortalSession,
  portalCsrfGuard,
  async (request: PortalRequest, response: Response) => {
    const parsed = portalAvailabilitySchema.safeParse(request.query);
    if (!parsed.success) {
      response.status(422).json({
        error: {
          code: "VALIDATION_FAILED",
          message: "Invalid availability query",
        },
      });
      return;
    }
    const context = workspaceContext(request);
    response.status(200).json({
      data: await getAvailability(
        { companyId: context.companyId },
        parsed.data.startsAt,
        parsed.data.endsAt,
        parsed.data.durationMinutes,
        parsed.data.serviceId,
      ),
    });
  },
);

router.get(
  "/booking/proposals",
  bookingEnabled,
  portalReadRateLimiter,
  requirePortalSession,
  portalCsrfGuard,
  async (request: PortalRequest, response: Response) => {
    const context = workspaceContext(request);
    response.status(200).json({
      data: await listCustomerProposals({
        companyId: context.companyId,
        customerId: context.customerId,
      }),
    });
  },
);

const portalHoldSchema = z
  .object({
    requestId: z.string().uuid().optional(),
    jobId: z.string().uuid().optional(),
    quoteId: z.string().uuid().optional(),
    windowStart: z.coerce.date(),
    windowEnd: z.coerce.date(),
  })
  .refine(
    (value) =>
      [value.requestId, value.jobId, value.quoteId].filter(Boolean).length ===
      1,
    { message: "Reference exactly one of request, job or quote" },
  );

router.post(
  "/booking/holds",
  bookingEnabled,
  portalWriteRateLimiter,
  requirePortalSession,
  portalCsrfGuard,
  async (request: PortalRequest, response: Response) => {
    const parsed = portalHoldSchema.safeParse(request.body);
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
    response.status(201).json({
      data: await createCustomerHold(
        {
          companyId: context.companyId,
          customerId: context.customerId,
        },
        parsed.data,
      ),
    });
  },
);

const portalRescheduleSchema = z.object({
  windows: z
    .array(z.object({ startsAt: z.coerce.date(), endsAt: z.coerce.date() }))
    .min(1)
    .max(3),
  expiresAt: z.coerce.date().optional(),
});

router.post(
  "/jobs/:jobId/reschedule-request",
  bookingEnabled,
  portalWriteRateLimiter,
  requirePortalSession,
  portalCsrfGuard,
  async (request: PortalRequest, response: Response) => {
    const parsed = portalRescheduleSchema.safeParse(request.body);
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
    response.status(201).json({
      data: await requestCustomerReschedule(
        {
          companyId: context.companyId,
          customerId: context.customerId,
        },
        request.params.jobId as string,
        parsed.data.windows,
        parsed.data.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ),
    });
  },
);

router.post(
  "/booking/holds/:holdId/confirm",
  bookingEnabled,
  portalWriteRateLimiter,
  requirePortalSession,
  portalCsrfGuard,
  async (request: PortalRequest, response: Response) => {
    const context = workspaceContext(request);
    response.status(200).json({
      data: await confirmCustomerHold(
        {
          companyId: context.companyId,
          customerId: context.customerId,
        },
        request.params.holdId as string,
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
  caption: z.string().trim().max(500).optional(),
});
const requestMessageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});
const portalAddressSchema = z.object({
  label: z.string().trim().max(80).optional(),
  line1: z.string().trim().min(1).max(160),
  line2: z.string().trim().max(160).optional(),
  city: z.string().trim().min(1).max(80),
  region: z.string().trim().max(80).optional(),
  postalCode: z.string().trim().max(20).optional(),
  countryCode: z.string().trim().length(2),
});

const createPortalRequestSchema = z
  .object({
    // Idempotency-Key header takes precedence; the body field remains
    // accepted for older clients. Exactly one must be present (checked
    // in the route since headers are not part of the body schema).
    submissionKey: z.string().trim().min(16).max(128).optional(),
    serviceAddressId: z.string().uuid().optional(),
    newAddress: portalAddressSchema.optional(),
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(4000),
    serviceCategory: z.string().trim().min(1).max(120),
    equipmentInfo: z.string().trim().max(2000).optional(),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
    requiresInspection: z.boolean().optional(),
    preferredWindows: z.custom<Prisma.InputJsonValue>().optional(),
    budgetMinMinor: z.number().int().nonnegative().optional(),
    budgetMaxMinor: z.number().int().nonnegative().optional(),
    budgetCurrency: z
      .string()
      .regex(/^[A-Za-z]{3}$/)
      .optional(),
  })
  .refine(
    (value) => value.serviceAddressId != null || value.newAddress != null,
    "A service address or a new address is required",
  );

router.post(
  "/requests",
  portalWriteRateLimiter,
  portalRequestsEnabled,
  requirePortalSession,
  portalCsrfGuard,
  async (request: PortalRequest, response: Response) => {
    const parsed = createPortalRequestSchema.safeParse(request.body);
    const headerKey = request.get("Idempotency-Key")?.trim();
    const submissionKey =
      headerKey || (parsed.success ? parsed.data.submissionKey : undefined);
    if (
      !parsed.success ||
      !submissionKey ||
      submissionKey.length < 16 ||
      submissionKey.length > 128
    ) {
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
        submissionKey,
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
        parsed.data.caption,
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
      data: await getJobTracking(
        context.companyId,
        context.customerId,
        request.params.jobId as string,
      ),
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

// Phase 7.3 — online checkout. Idempotent via Idempotency-Key header or
// body.idempotencyKey so a double-tap never creates two sessions.
const portalPaySchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
});

router.post(
  "/invoices/:invoiceId/pay",
  portalWriteRateLimiter,
  requirePortalSession,
  portalCsrfGuard,
  async (request: PortalRequest, response: Response) => {
    const parsed = portalPaySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      response.status(422).json({
        error: { code: "VALIDATION_FAILED", message: "Invalid request body" },
      });
      return;
    }
    const key =
      request.header("idempotency-key") ??
      parsed.data.idempotencyKey ??
      cryptoRandomUUID();
    response.status(201).json({
      data: await payWorkspaceInvoice(
        workspaceContext(request),
        request.params.invoiceId as string,
        key,
      ),
    });
  },
);

router.get(
  "/payments",
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
      data: await listWorkspacePayments(
        workspaceContext(request),
        parsed.data.page,
        parsed.data.pageSize,
      ),
    });
  },
);

router.get(
  "/payments/:paymentId/receipt",
  portalReadRateLimiter,
  requirePortalSession,
  async (request: PortalRequest, response: Response) => {
    response.status(200).json({
      data: await getWorkspacePaymentReceipt(
        workspaceContext(request),
        request.params.paymentId as string,
      ),
    });
  },
);

// Phase 7.6 — customer disputes. A dispute never changes invoice state;
// it opens an auditable review and suppresses reminders while open.
const disputeSchema = z.object({
  reason: z.enum([
    "INCORRECT_AMOUNT",
    "DUPLICATE_CHARGE",
    "SERVICE_NOT_RENDERED",
    "GOODS_NOT_RECEIVED",
    "OTHER",
  ]),
  message: z.string().trim().min(1).max(2000),
});

router.post(
  "/invoices/:invoiceId/disputes",
  portalWriteRateLimiter,
  requirePortalSession,
  portalCsrfGuard,
  async (request: PortalRequest, response: Response) => {
    const parsed = disputeSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(422).json({
        error: {
          code: "VALIDATION_FAILED",
          message: parsed.error.issues.map((i) => i.message).join(", "),
        },
      });
      return;
    }
    response.status(201).json({
      data: await createPortalDispute(
        workspaceContext(request),
        request.params.invoiceId as string,
        parsed.data,
      ),
    });
  },
);

router.get(
  "/invoices/:invoiceId/disputes",
  portalReadRateLimiter,
  requirePortalSession,
  async (request: PortalRequest, response: Response) => {
    const context = workspaceContext(request);
    await assertCanReadInvoice(context, request.params.invoiceId as string);
    response.status(200).json({
      data: await listInvoiceDisputes(
        context,
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

/**
 * POST /api/v1/portal/quotes/:quoteId/question
 * Ask the business a question about a quote — posts a CUSTOMER message on
 * the linked service request without changing the quote status (4.5).
 */
router.post(
  "/quotes/:quoteId/question",
  portalWriteRateLimiter,
  requirePortalSession,
  portalCsrfGuard,
  async (request: PortalRequest, response: Response) => {
    const parsed = z
      .object({ body: z.string().trim().min(1).max(4000) })
      .safeParse(request.body);
    if (!parsed.success) {
      response.status(422).json({
        error: {
          code: "VALIDATION_FAILED",
          message: "A question body is required",
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
    const data = await askQuoteQuestion(
      { companyId, customerId, sessionId },
      quoteId,
      scope === "JOB" ? jobId! : null,
      parsed.data.body,
    );
    response.status(201).json({ data });
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
