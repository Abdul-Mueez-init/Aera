import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../common/auth/auth.middleware.js";
import {
  archiveCustomer,
  createCustomer,
  createServiceAddress,
  getCustomer,
  listCustomerJobs,
  listCustomers,
  updateCustomer,
} from "./customer.service.js";
import { createPortalToken } from "../portal/portal.service.js";

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

function sendValidationError(response: Response, error: z.ZodError) {
  response.status(422).json({
    error: {
      code: "VALIDATION_FAILED",
      message: error.issues.map((issue) => issue.message).join(", "),
    },
  });
}

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
    await archiveCustomer(request.auth!.companyId, customerId);
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

router.post(
  "/:customerId/portal-access",
  requireAuth,
  requireRole(...manageCustomers),
  async (request, response) => {
    const customerId = Array.isArray(request.params.customerId)
      ? request.params.customerId[0]
      : request.params.customerId;
    response.status(201).json({
      data: await createPortalToken(request.auth!, customerId),
    });
  },
);

export { router as customerRouter };
