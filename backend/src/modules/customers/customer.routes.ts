import { Router, type RequestHandler, type Response } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../common/auth/auth.middleware.js";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import {
  archiveCustomer,
  createCustomer,
  createServiceAddress,
  getCustomer,
  listCustomerJobs,
  listCustomers,
  updateCustomer,
} from "./customer.service.js";
import {
  issueWorkspaceGrant,
  reissueWorkspaceGrant,
  revokeWorkspaceGrant,
  getWorkspaceGrantStatus,
} from "../portal/portal.grants.js";
import { sendPortalLink } from "../portal/portal-delivery.service.js";
import { portalWriteRateLimiter } from "../../common/rateLimit.js";

const router = Router();
const manageCustomers = ["OWNER", "DISPATCHER"] as const;

const customerSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().email().optional(),
  phone: z.string().trim().min(3).max(40).optional(),
  notes: z.string().trim().max(2000).optional(),
});

const updateCustomerSchema = customerSchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one customer field is required",
  );

const addressSchema = z.object({
  label: z.string().trim().min(1).max(80),
  line1: z.string().trim().min(1).max(160),
  line2: z.string().trim().max(160).optional(),
  city: z.string().trim().min(1).max(80),
  region: z.string().trim().max(80).optional(),
  postalCode: z.string().trim().max(20).optional(),
  countryCode: z.string().trim().length(2).toUpperCase(),
  lat: z.number().finite().min(-90).max(90).optional(),
  lng: z.number().finite().min(-180).max(180).optional(),
});

const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
  includeArchived: z.coerce.boolean().default(false),
});

const customerJobsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const portalAccessSchema = z.object({
  // Empty array = copy-link only (staff pastes the returned link manually);
  // SMS/EMAIL queue delivery through the notification outbox.
  channels: z
    .array(z.enum(["SMS", "EMAIL"]))
    .default(["SMS", "EMAIL"]),
});

function sendValidationError(response: Response, error: z.ZodError) {
  response.status(422).json({
    error: {
      code: "VALIDATION_FAILED",
      message: error.issues.map((issue) => issue.message).join(", "),
    },
  });
}

// Phase 2 ships dark behind WORKSPACE_PORTAL_ENABLED: with the flag off the
// customer workspace grant endpoints are indistinguishable from unknown
// routes (same 404 contract as the portal workspace read APIs).
const requireWorkspacePortal: RequestHandler = (_request, response, next) => {
  if (!env.WORKSPACE_PORTAL_ENABLED) {
    response.status(404).json({
      error: {
        code: "RESOURCE_NOT_FOUND",
        message: "Portal resource not found",
      },
    });
    return;
  }
  next();
};

router.get(
  "/",
  requireAuth,
  requireRole(...manageCustomers),
  async (request, response) => {
    const parsed = listSchema.safeParse(request.query);
    if (!parsed.success) {
      sendValidationError(response, parsed.error);
      return;
    }

    response.status(200).json({
      data: await listCustomers({
        companyId: request.auth!.companyId,
        ...parsed.data,
      }),
    });
  },
);

router.post(
  "/:customerId/portal-access",
  requireAuth,
  requireRole(...manageCustomers),
  requireWorkspacePortal,
  portalWriteRateLimiter,
  async (request, response) => {
    const parsed = portalAccessSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      sendValidationError(response, parsed.error);
      return;
    }
    const customerId = request.params.customerId as string;
    const { grant, link } = await issueWorkspaceGrant(
      request.auth!,
      customerId,
    );
    const deliveries = await sendPortalLink({
      companyId: request.auth!.companyId,
      customerId,
      grantId: grant.id,
      link,
      channels: parsed.data.channels,
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

router.post(
  "/:customerId/portal-access/reissue",
  requireAuth,
  requireRole(...manageCustomers),
  portalWriteRateLimiter,
  requireWorkspacePortal,
  async (request, response) => {
    const parsed = portalAccessSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      sendValidationError(response, parsed.error);
      return;
    }
    const customerId = request.params.customerId as string;
    const { grant, link } = await reissueWorkspaceGrant(
      request.auth!,
      customerId,
    );
    const deliveries = await sendPortalLink({
      companyId: request.auth!.companyId,
      customerId,
      grantId: grant.id,
      link,
      channels: parsed.data.channels,
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

router.post(
  "/:customerId/portal-access/revoke",
  requireAuth,
  requireRole(...manageCustomers),
  portalWriteRateLimiter,
  requireWorkspacePortal,
  async (request, response) => {
    await revokeWorkspaceGrant(
      request.auth!,
      request.params.customerId as string,
    );
    response.status(200).json({ data: { success: true } });
  },
);

router.get(
  "/:customerId/portal-access",
  requireAuth,
  requireRole(...manageCustomers),
  requireWorkspacePortal,
  async (request, response) => {
    response.status(200).json({
      data: await getWorkspaceGrantStatus(
        request.auth!,
        request.params.customerId as string,
      ),
    });
  },
);

router.post(
  "/",
  requireAuth,
  requireRole(...manageCustomers),
  async (request, response) => {
    const parsed = customerSchema.safeParse(request.body);
    if (!parsed.success) {
      sendValidationError(response, parsed.error);
      return;
    }

    response.status(201).json({
      data: await createCustomer(request.auth!.companyId, parsed.data),
    });
  },
);

router.get(
  "/:customerId",
  requireAuth,
  requireRole(...manageCustomers),
  async (request, response) => {
    const customerId = Array.isArray(request.params.customerId)
      ? request.params.customerId[0]
      : request.params.customerId;
    response.status(200).json({
      data: await getCustomer(request.auth!.companyId, customerId),
    });
  },
);

router.get(
  "/:customerId/jobs",
  requireAuth,
  requireRole(...manageCustomers),
  async (request, response) => {
    const parsed = customerJobsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      sendValidationError(response, parsed.error);
      return;
    }

    const customerId = Array.isArray(request.params.customerId)
      ? request.params.customerId[0]
      : request.params.customerId;
    response.status(200).json({
      data: await listCustomerJobs(
        request.auth!.companyId,
        customerId,
        parsed.data,
      ),
    });
  },
);

router.patch(
  "/:customerId",
  requireAuth,
  requireRole(...manageCustomers),
  async (request, response) => {
    const parsed = updateCustomerSchema.safeParse(request.body);
    if (!parsed.success) {
      sendValidationError(response, parsed.error);
      return;
    }

    const customerId = Array.isArray(request.params.customerId)
      ? request.params.customerId[0]
      : request.params.customerId;
    response.status(200).json({
      data: await updateCustomer(
        request.auth!.companyId,
        customerId,
        parsed.data,
      ),
    });
  },
);

router.delete(
  "/:customerId",
  requireAuth,
  requireRole(...manageCustomers),
  async (request, response) => {
    const customerId = Array.isArray(request.params.customerId)
      ? request.params.customerId[0]
      : request.params.customerId;
    await archiveCustomer(
      request.auth!.companyId,
      customerId,
      request.auth!.userId,
    );
    response.status(204).send();
  },
);

router.post(
  "/:customerId/addresses",
  requireAuth,
  requireRole(...manageCustomers),
  async (request, response) => {
    const parsed = addressSchema.safeParse(request.body);
    if (!parsed.success) {
      sendValidationError(response, parsed.error);
      return;
    }

    const customerId = Array.isArray(request.params.customerId)
      ? request.params.customerId[0]
      : request.params.customerId;
    response.status(201).json({
      data: await createServiceAddress(
        request.auth!.companyId,
        customerId,
        parsed.data,
      ),
    });
  },
);

/**
 * GET /api/v1/customers/:customerId/portal-activity
 * Get recent portal audit events for a customer.
 */
router.get(
  "/:customerId/portal-activity",
  requireAuth,
  requireRole(...manageCustomers),
  async (request, response) => {
    const customerId = Array.isArray(request.params.customerId)
      ? request.params.customerId[0]
      : request.params.customerId;

    const parsed = z
      .object({
        limit: z.coerce.number().int().min(1).max(50).default(20),
      })
      .safeParse(request.query);

    if (!parsed.success) {
      sendValidationError(response, parsed.error);
      return;
    }

    const events = await prisma.portalAuditEvent.findMany({
      where: {
        companyId: request.auth!.companyId,
        customerId,
      },
      orderBy: { createdAt: "desc" },
      take: parsed.data.limit,
      select: {
        id: true,
        jobId: true,
        action: true,
        metadata: true,
        createdAt: true,
      },
    });

    response.status(200).json({
      data: events,
    });
  },
);

export { router as customerRouter };
