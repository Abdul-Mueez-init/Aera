import { Router, type Response } from "express";
import { requireAuth, requireRole } from "../../common/auth/auth.middleware.js";
import { z } from "zod";
import {
  createRequestSchema,
  priorities,
  requestStatuses,
  updateRequestSchema,
} from "./request.schemas.js";
import {
  createRequest,
  getRequest,
  listRequests,
  transitionRequest,
  updateRequest,
} from "./request.service.js";
import {
  confirmRequestMedia,
  listRequestMedia,
  presignRequestMedia,
} from "./request.media.js";
import {
  listRequestMessages,
  postStaffMessage,
  requestInformation,
} from "./request.conversation.js";

const router = Router();
const managerRoles = ["OWNER", "DISPATCHER"] as const;

function sendValidationError(response: Response, error: z.ZodError) {
  response.status(422).json({
    error: {
      code: "VALIDATION_FAILED",
      message: error.issues.map((issue) => issue.message).join(", "),
    },
  });
}

function routeId(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(requestStatuses).optional(),
  priority: z.enum(priorities).optional(),
  requiresInspection: z.coerce.boolean().optional(),
  search: z.string().trim().max(100).optional(),
});

const mediaPresignSchema = z.object({
  mimeType: z.string().trim().min(1).max(100),
});
const mediaConfirmSchema = z.object({
  objectKey: z.string().trim().min(1).max(500),
  mimeType: z.string().trim().min(1).max(100),
});
const messageSchema = z.object({ body: z.string().trim().min(1).max(4000) });

router.get(
  "/",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    const parsed = listSchema.safeParse(request.query);
    if (!parsed.success) return sendValidationError(response, parsed.error);
    response
      .status(200)
      .json({ data: await listRequests(request.auth!, parsed.data) });
  },
);

router.post(
  "/",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    const parsed = createRequestSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(response, parsed.error);
    response
      .status(201)
      .json({ data: await createRequest(request.auth!, parsed.data) });
  },
);

router.get(
  "/:requestId",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    response
      .status(200)
      .json({
        data: await getRequest(
          request.auth!,
          routeId(request.params.requestId),
        ),
      });
  },
);

router.get(
  "/:requestId/media",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    response
      .status(200)
      .json({
        data: await listRequestMedia(
          request.auth!,
          routeId(request.params.requestId),
        ),
      });
  },
);

router.post(
  "/:requestId/media/presign",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    const parsed = mediaPresignSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(response, parsed.error);
    response.status(201).json({
      data: await presignRequestMedia(
        request.auth!,
        routeId(request.params.requestId),
        parsed.data.mimeType,
      ),
    });
  },
);

router.post(
  "/:requestId/media",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    const parsed = mediaConfirmSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(response, parsed.error);
    response.status(201).json({
      data: await confirmRequestMedia(
        request.auth!,
        routeId(request.params.requestId),
        parsed.data.objectKey,
        parsed.data.mimeType,
      ),
    });
  },
);

router.get(
  "/:requestId/messages",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    response.status(200).json({
      data: await listRequestMessages(
        request.auth!.companyId,
        undefined,
        routeId(request.params.requestId),
      ),
    });
  },
);

router.post(
  "/:requestId/messages",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    const parsed = messageSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(response, parsed.error);
    response.status(201).json({
      data: await postStaffMessage(
        request.auth!,
        routeId(request.params.requestId),
        parsed.data.body,
      ),
    });
  },
);

router.patch(
  "/:requestId",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    const parsed = updateRequestSchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(response, parsed.error);
    response.status(200).json({
      data: await updateRequest(
        request.auth!,
        routeId(request.params.requestId),
        parsed.data,
      ),
    });
  },
);

async function command(
  request: Parameters<Parameters<typeof router.post>[1]>[0],
  response: Response,
  toStatus: "NEEDS_INFO" | "CANCELLED" | "CLOSED" | "SUBMITTED" | "QUOTING",
  eventType:
    | "STATUS_CHANGED"
    | "INSPECTION_MARKED"
    | "CLOSED"
    | "CANCELLED"
    | "REOPENED" = "STATUS_CHANGED",
) {
  response.status(200).json({
    data: await transitionRequest(
      request.auth!,
      routeId(request.params.requestId),
      toStatus,
      eventType,
    ),
  });
}

router.post(
  "/:requestId/request-information",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) =>
    (async () => {
      const parsed = messageSchema.safeParse(request.body);
      if (!parsed.success) return sendValidationError(response, parsed.error);
      response.status(200).json({
        data: await requestInformation(
          request.auth!,
          routeId(request.params.requestId),
          parsed.data.body,
        ),
      });
    })(),
);
router.post(
  "/:requestId/mark-inspection",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) =>
    command(request, response, "QUOTING", "INSPECTION_MARKED"),
);
router.post(
  "/:requestId/close",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => command(request, response, "CLOSED", "CLOSED"),
);
router.post(
  "/:requestId/cancel",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) =>
    command(request, response, "CANCELLED", "CANCELLED"),
);
router.post(
  "/:requestId/reopen",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) =>
    command(request, response, "SUBMITTED", "REOPENED"),
);

export { router as requestRouter };
