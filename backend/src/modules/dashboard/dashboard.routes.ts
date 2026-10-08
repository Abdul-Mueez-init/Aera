import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../common/auth/auth.middleware.js";
import {
  getDashboardAlerts,
  getDashboardSummary,
  getDashboardToday,
} from "./dashboard.service.js";

const router = Router();
const dashboardRoles = ["OWNER", "DISPATCHER"] as const;

const todayQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
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
  "/summary",
  requireAuth,
  requireRole(...dashboardRoles),
  async (request, response) => {
    response.status(200).json({
      data: await getDashboardSummary(request.auth!.companyId),
    });
  },
);

router.get(
  "/today",
  requireAuth,
  requireRole(...dashboardRoles),
  async (request, response) => {
    const parsed = todayQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      sendValidationError(response, parsed.error);
      return;
    }

    response.status(200).json({
      data: await getDashboardToday(request.auth!.companyId, parsed.data.limit),
    });
  },
);

router.get(
  "/alerts",
  requireAuth,
  requireRole(...dashboardRoles),
  async (request, response) => {
    response.status(200).json({
      data: await getDashboardAlerts(request.auth!.companyId),
    });
  },
);

export { router as dashboardRouter };
