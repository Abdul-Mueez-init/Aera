import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../common/auth/auth.middleware.js";
import {
  issueGrant,
  reissueGrant,
  deactivateGrant,
  getGrantStatus,
} from "./portal.grants.js";
import { sendPortalLink } from "./portal-delivery.service.js";
import { portalWriteRateLimiter } from "../../common/rateLimit.js";

// mergeParams: this router is mounted at /jobs/:jobId in job.routes.ts, so
// the jobId lives on the parent router's params.
const router = Router({ mergeParams: true });

// Auth + role are applied PER ROUTE, not router-wide: a router-level
// requireRole would also run for unmatched /jobs/:jobId/* paths and answer
// 403 where the correct response is 404.
const staffOnly = [requireAuth, requireRole("OWNER", "DISPATCHER")] as const;

const channelsSchema = z.object({
  channels: z
    .array(z.enum(["SMS", "EMAIL"]))
    .min(1)
    .default(["SMS", "EMAIL"]),
});

const deactivateSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});

const jobIdSchema = z.string().uuid();

function parseJobId(request: Request, response: Response): string | null {
  const parsed = jobIdSchema.safeParse(request.params.jobId);
  if (!parsed.success) {
    response.status(422).json({
      error: {
        code: "VALIDATION_FAILED",
        message: "jobId must be a UUID",
      },
    });
    return null;
  }
  return parsed.data;
}

function parseBody<T>(
  schema: z.ZodType<T>,
  request: Request,
  response: Response,
): T | null {
  const parsed = schema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(422).json({
      error: {
        code: "VALIDATION_FAILED",
        message: parsed.error.issues.map((issue) => issue.message).join(", "),
      },
    });
    return null;
  }
  return parsed.data;
}

/**
 * POST /api/v1/jobs/:jobId/portal-access
 * Issue a new portal access grant for a job.
 */
router.post(
  "/portal-access",
  ...staffOnly,
  portalWriteRateLimiter,
  async (request, response) => {
    const jobId = parseJobId(request, response);
    if (!jobId) return;

    const parsed = parseBody(channelsSchema, request, response);
    if (!parsed) return;

    const { grant, link, customerId, jobNumber } = await issueGrant(
      request.auth!,
      jobId,
    );

    // Queue link delivery via selected channels (never fails issuance)
    const deliveries = await sendPortalLink({
      companyId: request.auth!.companyId,
      customerId,
      jobId,
      grantId: grant.id,
      jobNumber,
      link,
      channels: parsed.channels,
    });

    response.status(201).json({
      data: {
        grantId: grant.id,
        link,
        linkExpiresAt: grant.linkExpiresAt,
        deliveries,
      },
    });
  },
);

/**
 * POST /api/v1/jobs/:jobId/portal-access/reissue
 * Reissue a portal access grant (deactivate old, create new).
 */
router.post(
  "/portal-access/reissue",
  ...staffOnly,
  portalWriteRateLimiter,
  async (request, response) => {
    const jobId = parseJobId(request, response);
    if (!jobId) return;

    const parsed = parseBody(channelsSchema, request, response);
    if (!parsed) return;

    const { grant, link, customerId, jobNumber } = await reissueGrant(
      request.auth!,
      jobId,
    );

    // Queue link delivery via selected channels (never fails reissue)
    const deliveries = await sendPortalLink({
      companyId: request.auth!.companyId,
      customerId,
      jobId,
      grantId: grant.id,
      jobNumber,
      link,
      channels: parsed.channels,
    });

    response.status(201).json({
      data: {
        grantId: grant.id,
        link,
        linkExpiresAt: grant.linkExpiresAt,
        deliveries,
      },
    });
  },
);

/**
 * POST /api/v1/jobs/:jobId/portal-access/deactivate
 * Deactivate a portal access grant manually. An optional free-text reason
 * (≤300 chars) is stored on the audit event.
 */
router.post(
  "/portal-access/deactivate",
  ...staffOnly,
  portalWriteRateLimiter,
  async (request, response) => {
    const jobId = parseJobId(request, response);
    if (!jobId) return;

    const parsed = parseBody(deactivateSchema, request, response);
    if (!parsed) return;

    await deactivateGrant(request.auth!, jobId, parsed.reason);

    response.status(200).json({
      data: { success: true },
    });
  },
);

/**
 * GET /api/v1/jobs/:jobId/portal-access
 * Get portal access status for a job (includes the last 20 audit events).
 */
router.get("/portal-access", ...staffOnly, async (request, response) => {
  const jobId = parseJobId(request, response);
  if (!jobId) return;

  const status = await getGrantStatus(request.auth!, jobId);

  if (!status) {
    response.status(200).json({
      data: null,
    });
    return;
  }

  response.status(200).json({
    data: status,
  });
});

// No handshake/regenerate route: D1 decision (Moiz, 2026-10-26) removed it.
// The staff start override lives at POST /jobs/:jobId/start/override.

export { router as portalStaffRouter };
