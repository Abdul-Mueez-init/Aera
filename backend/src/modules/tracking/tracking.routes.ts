import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../../common/auth/auth.middleware.js";
import { env } from "../../config/env.js";
import { trackingRateLimiter } from "../../common/rateLimit.js";
import { updateJobLocation } from "./tracking.service.js";

const router = Router();
const locationSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  accuracy: z.number().nonnegative().optional(),
  // Explicit consent to share location — required on the first update
  // for a job; the recorded consentAt is reused by later updates.
  consent: z.boolean().optional(),
});

router.post(
  "/:jobId/location",
  requireAuth,
  trackingRateLimiter,
  async (request, response: Response) => {
    if (!env.LIVE_TRACKING_ENABLED) {
      response
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Route not found" } });
      return;
    }
    const parsed = locationSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(422).json({
        error: { code: "VALIDATION_FAILED", message: "Invalid location" },
      });
      return;
    }
    const jobId = Array.isArray(request.params.jobId)
      ? request.params.jobId[0]
      : request.params.jobId;
    response.status(200).json({
      data: await updateJobLocation(request.auth!, jobId, parsed.data),
    });
  },
);

export { router as trackingRouter };
