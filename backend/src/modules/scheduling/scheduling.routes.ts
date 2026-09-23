import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../common/auth/auth.middleware.js";
import {
  getDaySchedule,
  getTechnicianWorkload,
  scheduleJob,
} from "./scheduling.service.js";

const router = Router();
const managerRoles = ["OWNER", "DISPATCHER"] as const;
const scheduleSchema = z.object({
  scheduledStart: z.coerce.date(),
  scheduledEnd: z.coerce.date(),
});
const dateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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

router.get(
  "/",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    const parsed = dateSchema.safeParse(request.query);
    if (!parsed.success) {
      sendValidationError(response, parsed.error);
      return;
    }
    response.status(200).json({
      data: await getDaySchedule(request.auth!, parsed.data.date),
    });
  },
);

router.get(
  "/workload",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    const parsed = dateSchema.safeParse(request.query);
    if (!parsed.success) {
      sendValidationError(response, parsed.error);
      return;
    }
    response.status(200).json({
      data: await getTechnicianWorkload(request.auth!, parsed.data.date),
    });
  },
);

router.post(
  "/jobs/:jobId/schedule",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    const parsed = scheduleSchema.safeParse(request.body);
    if (!parsed.success) {
      sendValidationError(response, parsed.error);
      return;
    }
    response.status(200).json({
      data: await scheduleJob(
        request.auth!,
        routeId(request.params.jobId),
        parsed.data,
        false,
      ),
    });
  },
);

router.post(
  "/jobs/:jobId/reschedule",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    const parsed = scheduleSchema.safeParse(request.body);
    if (!parsed.success) {
      sendValidationError(response, parsed.error);
      return;
    }
    response.status(200).json({
      data: await scheduleJob(
        request.auth!,
        routeId(request.params.jobId),
        parsed.data,
        true,
      ),
    });
  },
);

export { router as schedulingRouter };
