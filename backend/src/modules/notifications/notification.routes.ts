import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../../common/auth/auth.middleware.js";
import { listNotifications, markNotificationRead } from "./notification.service.js";

const router = Router();

const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  unreadOnly: z.coerce.boolean().default(false),
});

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

router.get("/", requireAuth, async (request, response) => {
  const parsed = listSchema.safeParse(request.query);
  if (!parsed.success) {
    sendValidationError(response, parsed.error);
    return;
  }

  response.status(200).json({
    data: await listNotifications({
      companyId: request.auth!.companyId,
      recipientUserId: request.auth!.userId,
      ...parsed.data,
    }),
  });
});

router.post("/:notificationId/read", requireAuth, async (request, response) => {
  response.status(200).json({
    data: await markNotificationRead(
      request.auth!.companyId,
      request.auth!.userId,
      routeId(request.params.notificationId),
    ),
  });
});

export { router as notificationRouter };
