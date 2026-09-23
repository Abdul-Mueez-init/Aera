import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../../common/auth/auth.middleware.js";
import {
  listNotifications,
  markNotificationRead,
} from "./notification.service.js";
import {
  registerDeviceToken,
  removeDeviceToken,
} from "./device-token.service.js";

const router = Router();

const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  unreadOnly: z.coerce.boolean().default(false),
});

const registerDeviceTokenSchema = z.object({
  token: z.string().trim().min(1),
  platform: z.enum(["ANDROID", "IOS", "WEB"]),
});

const removeDeviceTokenSchema = z.object({
  token: z.string().trim().min(1),
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

// Push device-token registration. Kept in this router (rather than a
// separate route file/app.ts mount) since it is already
// notification-scoped and mounted at /api/v1/notifications.
router.post("/device-tokens", requireAuth, async (request, response) => {
  const parsed = registerDeviceTokenSchema.safeParse(request.body);
  if (!parsed.success) {
    sendValidationError(response, parsed.error);
    return;
  }

  const deviceToken = await registerDeviceToken({
    companyId: request.auth!.companyId,
    userId: request.auth!.userId,
    token: parsed.data.token,
    platform: parsed.data.platform,
  });
  response.status(201).json({ data: deviceToken });
});

router.delete("/device-tokens", requireAuth, async (request, response) => {
  const parsed = removeDeviceTokenSchema.safeParse(request.body);
  if (!parsed.success) {
    sendValidationError(response, parsed.error);
    return;
  }

  await removeDeviceToken(request.auth!.userId, parsed.data.token);
  response.status(204).send();
});

export { router as notificationRouter };
