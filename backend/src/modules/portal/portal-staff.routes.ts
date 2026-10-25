import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../common/auth/auth.middleware.js";
import { prisma } from "../../db/prisma.js";
import { issueGrant, reissueGrant, deactivateGrant, getGrantStatus } from "./portal.grants.js";
import { sendPortalLink } from "./portal-delivery.service.js";
import { regenerateHandshake } from "../jobs/handshake.service.js";
import { portalWriteRateLimiter } from "../../common/rateLimit.js";

const router = Router();

// All routes require authentication and OWNER/DISPATCHER role
router.use(requireAuth);
router.use(requireRole("OWNER", "DISPATCHER"));

/**
 * POST /api/v1/jobs/:jobId/portal-access
 * Issue a new portal access grant for a job.
 */
router.post(
  "/portal-access",
  portalWriteRateLimiter,
  async (request, response) => {
    // Extract jobId from original URL since params is stripped by sub-router mounting
    const jobIdMatch = request.originalUrl?.match(/\/jobs\/([^/]+)\/portal-access/);
    const jobId = jobIdMatch ? jobIdMatch[1] : (request.params as { jobId?: string }).jobId;

    if (!jobId) {
      response.status(400).json({
        error: {
          code: "INVALID_REQUEST",
          message: "Job ID is required",
        },
      });
      return;
    }

    const parsed = z
      .object({
        channels: z
          .array(z.enum(["SMS", "EMAIL"]))
          .min(1)
          .default(["SMS", "EMAIL"]),
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

    const { grant, link } = await issueGrant(
      request.auth!,
      jobId,
    );

    // Fetch job to get customerId
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { customerId: true },
    });

    if (!job) {
      response.status(404).json({
        error: {
          code: "RESOURCE_NOT_FOUND",
          message: "Job not found",
        },
      });
      return;
    }

    // Send link via selected channels
    const deliveries = await sendPortalLink(
      request.auth!.companyId,
      job.customerId,
      link,
      parsed.data.channels,
    );

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
  portalWriteRateLimiter,
  async (request, response) => {
    const jobIdMatch = request.originalUrl?.match(/\/jobs\/([^/]+)\/portal-access/);
    const jobId = jobIdMatch ? jobIdMatch[1] : (request.params as { jobId?: string }).jobId;

    if (!jobId) {
      response.status(400).json({
        error: {
          code: "INVALID_REQUEST",
          message: "Job ID is required",
        },
      });
      return;
    }

    const parsed = z
      .object({
        channels: z
          .array(z.enum(["SMS", "EMAIL"]))
          .min(1)
          .default(["SMS", "EMAIL"]),
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

    const { grant, link } = await reissueGrant(
      request.auth!,
      jobId,
    );

    // Fetch job to get customerId
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { customerId: true },
    });

    if (!job) {
      response.status(404).json({
        error: {
          code: "RESOURCE_NOT_FOUND",
          message: "Job not found",
        },
      });
      return;
    }

    // Send link via selected channels
    const deliveries = await sendPortalLink(
      request.auth!.companyId,
      job.customerId,
      link,
      parsed.data.channels,
    );

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
 * Deactivate a portal access grant manually.
 */
router.post(
  "/portal-access/deactivate",
  portalWriteRateLimiter,
  async (request, response) => {
    const jobIdMatch = request.originalUrl?.match(/\/jobs\/([^/]+)\/portal-access/);
    const jobId = jobIdMatch ? jobIdMatch[1] : (request.params as { jobId?: string }).jobId;

    if (!jobId) {
      response.status(400).json({
        error: {
          code: "INVALID_REQUEST",
          message: "Job ID is required",
        },
      });
      return;
    }

    const parsed = z.object({}).safeParse(request.body);

    if (!parsed.success) {
      response.status(422).json({
        error: {
          code: "VALIDATION_FAILED",
          message: parsed.error.issues.map((issue) => issue.message).join(", "),
        },
      });
      return;
    }

    await deactivateGrant(request.auth!, jobId);

    response.status(200).json({
      data: { success: true },
    });
  },
);

/**
 * GET /api/v1/jobs/:jobId/portal-access
 * Get portal access status for a job.
 */
router.get("/portal-access", async (request, response) => {
  const jobIdMatch = request.originalUrl?.match(/\/jobs\/([^/]+)\/portal-access/);
  const jobId = jobIdMatch ? jobIdMatch[1] : (request.params as { jobId?: string }).jobId;

  if (!jobId) {
    response.status(400).json({
      error: {
        code: "INVALID_REQUEST",
        message: "Job ID is required",
      },
    });
    return;
  }

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

/**
 * POST /api/v1/jobs/:jobId/handshake/regenerate
 * Regenerate handshake code (staff-only). Bumps the handshake version,
 * which changes the derived code, and re-delivers it to the customer.
 * The staff start override lives at POST /jobs/:jobId/start/override.
 */
router.post("/handshake/regenerate", portalWriteRateLimiter, async (request, response) => {
  const jobIdMatch = request.originalUrl?.match(/\/jobs\/([^/]+)\/handshake/);
  const jobId = jobIdMatch ? jobIdMatch[1] : (request.params as { jobId?: string }).jobId;

  if (!jobId) {
    response.status(400).json({
      error: {
        code: "INVALID_REQUEST",
        message: "Job ID is required",
      },
    });
    return;
  }

  const data = await regenerateHandshake(request.auth!, jobId);

  response.status(200).json({ data });
});

export { router as portalStaffRouter };
