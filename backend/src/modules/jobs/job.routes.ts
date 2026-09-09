import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../common/auth/auth.middleware.js";
import {
  addJobNote,
  addJobPart,
  addJobPhoto,
  assignJob,
  completeJob,
  createJob,
  getJob,
  getJobHistory,
  listTechnicianToday,
  listJobs,
  presignJobPhoto,
  transitionJob,
  updateJob,
  type JobStatusValue,
  type NoteVisibilityValue,
} from "./job.service.js";
 
const router = Router();
const managerRoles = ["OWNER", "DISPATCHER"] as const;
const statuses = [
  "NEW",
  "QUOTING",
  "SCHEDULED",
  "EN_ROUTE",
  "IN_PROGRESS",
  "WAITING_PARTS",
  "COMPLETED",
  "CANCELLED",
] as const;
const priorities = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
const visibilities = ["INTERNAL", "CUSTOMER"] as const;
const photoKinds = ["BEFORE", "AFTER", "OTHER"] as const;
 
const jobSchema = z.object({
  customerId: z.string().uuid(),
  serviceAddressId: z.string().uuid(),
  serviceType: z.string().trim().min(1).max(120),
  problemDescription: z.string().trim().min(1).max(4000),
  priority: z.enum(priorities).optional(),
});
const updateJobSchema = jobSchema
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one job field is required",
  );
const listSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(statuses).optional(),
  priority: z.enum(priorities).optional(),
});
const assignSchema = z.object({ technicianId: z.string().uuid().nullable() });
const statusSchema = z.object({
  status: z.enum(statuses),
  reason: z.string().trim().max(1000).optional(),
});
const noteSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  visibility: z.enum(visibilities).default("INTERNAL"),
});
const todaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const photoSchema = z.object({
  objectKey: z.string().trim().min(1).max(500),
  mimeType: z.string().regex(/^image\/(jpeg|png|webp)$/),
  sizeBytes: z.number().int().positive().max(10_000_000),
  kind: z.enum(photoKinds).default("OTHER"),
  caption: z.string().trim().max(500).optional(),
});
const presignPhotoSchema = z.object({
  mimeType: z.string().regex(/^image\/(jpeg|png|webp)$/),
});
const partSchema = z.object({
  name: z.string().trim().min(1).max(160),
  quantity: z.number().positive().max(10_000),
  unitPriceMinor: z.number().int().nonnegative().max(100_000_000),
  currency: z.string().regex(/^[A-Za-z]{3}$/),
});
const completionSchema = z.object({
  summary: z.string().trim().min(1).max(4000),
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
  response
    .status(200)
    .json({ data: await listJobs(request.auth!, parsed.data) });
});
 
router.get("/today", requireAuth, async (request, response) => {
  const parsed = todaySchema.safeParse(request.query);
  if (!parsed.success) {
    sendValidationError(response, parsed.error);
    return;
  }
  response.status(200).json({
    data: await listTechnicianToday(request.auth!, parsed.data.date),
  });
});
 
router.post(
  "/",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    const parsed = jobSchema.safeParse(request.body);
    if (!parsed.success) {
      sendValidationError(response, parsed.error);
      return;
    }
    response.status(201).json({
      data: await createJob(request.auth!, parsed.data),
    });
  },
);
 
router.get("/:jobId", requireAuth, async (request, response) => {
  response.status(200).json({
    data: await getJob(request.auth!, routeId(request.params.jobId)),
  });
});
 
router.patch(
  "/:jobId",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    const parsed = updateJobSchema.safeParse(request.body);
    if (!parsed.success) {
      sendValidationError(response, parsed.error);
      return;
    }
    response.status(200).json({
      data: await updateJob(
        request.auth!,
        routeId(request.params.jobId),
        parsed.data,
      ),
    });
  },
);
 
router.post(
  "/:jobId/assign",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    const parsed = assignSchema.safeParse(request.body);
    if (!parsed.success) {
      sendValidationError(response, parsed.error);
      return;
    }
    response.status(200).json({
      data: await assignJob(
        request.auth!,
        routeId(request.params.jobId),
        parsed.data.technicianId,
      ),
    });
  },
);
 
router.post("/:jobId/status", requireAuth, async (request, response) => {
  const parsed = statusSchema.safeParse(request.body);
  if (!parsed.success) {
    sendValidationError(response, parsed.error);
    return;
  }
  response.status(200).json({
    data: await transitionJob(
      request.auth!,
      routeId(request.params.jobId),
      parsed.data.status as JobStatusValue,
      parsed.data.reason,
    ),
  });
});
 
router.post(
  "/:jobId/photos/presign",
  requireAuth,
  async (request, response) => {
    const parsed = presignPhotoSchema.safeParse(request.body);
    if (!parsed.success) {
      sendValidationError(response, parsed.error);
      return;
    }
    response.status(201).json({
      data: await presignJobPhoto(
        request.auth!,
        routeId(request.params.jobId),
        parsed.data.mimeType,
      ),
    });
  },
);
 
router.post("/:jobId/photos", requireAuth, async (request, response) => {
  const parsed = photoSchema.safeParse(request.body);
  if (!parsed.success) {
    sendValidationError(response, parsed.error);
    return;
  }
  response.status(201).json({
    data: await addJobPhoto(
      request.auth!,
      routeId(request.params.jobId),
      parsed.data,
    ),
  });
});
 
router.post("/:jobId/parts", requireAuth, async (request, response) => {
  const parsed = partSchema.safeParse(request.body);
  if (!parsed.success) {
    sendValidationError(response, parsed.error);
    return;
  }
  response.status(201).json({
    data: await addJobPart(
      request.auth!,
      routeId(request.params.jobId),
      parsed.data,
    ),
  });
});
 
router.post("/:jobId/complete", requireAuth, async (request, response) => {
  const parsed = completionSchema.safeParse(request.body);
  if (!parsed.success) {
    sendValidationError(response, parsed.error);
    return;
  }
  response.status(200).json({
    data: await completeJob(
      request.auth!,
      routeId(request.params.jobId),
      parsed.data.summary,
    ),
  });
});
 
router.post("/:jobId/notes", requireAuth, async (request, response) => {
  const parsed = noteSchema.safeParse(request.body);
  if (!parsed.success) {
    sendValidationError(response, parsed.error);
    return;
  }
  response.status(201).json({
    data: await addJobNote(
      request.auth!,
      routeId(request.params.jobId),
      parsed.data.body,
      parsed.data.visibility as NoteVisibilityValue,
    ),
  });
});
 
router.get("/:jobId/history", requireAuth, async (request, response) => {
  response.status(200).json({
    data: await getJobHistory(request.auth!, routeId(request.params.jobId)),
  });
});
 
export { router as jobRouter };