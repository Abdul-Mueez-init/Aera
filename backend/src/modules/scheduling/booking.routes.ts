import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../common/auth/auth.middleware.js";
import {
  confirmHold,
  createHold,
  createProposal,
  createTimeOff,
  deleteTimeOff,
  getAvailability,
  getBookingConfig,
  getTeamAvailability,
  listProposals,
  listUnscheduledJobs,
  pickProposal,
  setTechnicianWorkingHours,
  updateBookingConfig,
} from "./booking.service.js";

const router = Router();
const managerRoles = ["OWNER", "DISPATCHER"] as const;
const date = z.coerce.date();

function validation(response: Response, error: z.ZodError) {
  response.status(422).json({
    error: {
      code: "VALIDATION_FAILED",
      message: error.issues.map((issue) => issue.message).join(", "),
    },
  });
}

function id(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

const availabilitySchema = z.object({
  startsAt: date,
  endsAt: date,
  durationMinutes: z.coerce.number().int().positive().max(1440),
  serviceId: z.string().uuid().optional(),
});

const proposalSchema = z.object({
  requestId: z.string().uuid().optional(),
  jobId: z.string().uuid().optional(),
  quoteId: z.string().uuid().optional(),
  windows: z
    .array(
      z.object({
        startsAt: date,
        endsAt: date,
        capacity: z.number().int().positive().optional(),
      }),
    )
    .min(1)
    .max(3),
  expiresAt: date,
});

const pickSchema = z.object({ startsAt: date, endsAt: date });
const holdSchema = z.object({
  jobId: z.string().uuid().optional(),
  requestId: z.string().uuid().optional(),
  quoteId: z.string().uuid().optional(),
  technicianId: z.string().uuid().optional(),
  windowStart: date,
  windowEnd: date,
});

const proposalListSchema = z.object({
  status: z
    .enum(["OPEN", "PICKED", "EXPIRED", "CANCELLED"])
    .optional(),
  requestId: z.string().uuid().optional(),
  jobId: z.string().uuid().optional(),
  quoteId: z.string().uuid().optional(),
});
const configSchema = z.object({
  travelBufferMinutes: z.coerce.number().int().min(0).max(240),
  bookingMode: z.enum(["DISPATCHER_CONFIRMS", "SELF_SERVE_WINDOWS"]),
  businessHours: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        open: z.string().regex(/^\d{2}:\d{2}$/),
        close: z.string().regex(/^\d{2}:\d{2}$/),
      }),
    )
    .max(7),
});

router.get(
  "/config",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    response.status(200).json({ data: await getBookingConfig(request.auth!) });
  },
);

router.patch(
  "/config",
  requireAuth,
  requireRole("OWNER"),
  async (request, response) => {
    const parsed = configSchema.safeParse(request.body);
    if (!parsed.success) return validation(response, parsed.error);
    response
      .status(200)
      .json({ data: await updateBookingConfig(request.auth!, parsed.data) });
  },
);

router.get(
  "/queue",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    response
      .status(200)
      .json({ data: await listUnscheduledJobs(request.auth!) });
  },
);

router.get(
  "/availability",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    const parsed = availabilitySchema.safeParse(request.query);
    if (!parsed.success) return validation(response, parsed.error);
    response
      .status(200)
      .json({
        data: await getAvailability(
          request.auth!,
          parsed.data.startsAt,
          parsed.data.endsAt,
          parsed.data.durationMinutes,
          parsed.data.serviceId,
        ),
      });
  },
);

const workingHoursSchema = z.object({
  hours: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        open: z.string().regex(/^\d{2}:\d{2}$/),
        close: z.string().regex(/^\d{2}:\d{2}$/),
      }),
    )
    .max(7),
});

const timeOffSchema = z.object({
  technicianId: z.string().uuid(),
  startsAt: date,
  endsAt: date,
  reason: z.string().trim().max(500).optional(),
});

router.get(
  "/team-availability",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    response
      .status(200)
      .json({ data: await getTeamAvailability(request.auth!) });
  },
);

router.put(
  "/technicians/:technicianId/working-hours",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    const parsed = workingHoursSchema.safeParse(request.body);
    if (!parsed.success) return validation(response, parsed.error);
    response.status(200).json({
      data: await setTechnicianWorkingHours(
        request.auth!,
        id(request.params.technicianId),
        parsed.data.hours,
      ),
    });
  },
);

router.post(
  "/time-off",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    const parsed = timeOffSchema.safeParse(request.body);
    if (!parsed.success) return validation(response, parsed.error);
    response
      .status(201)
      .json({ data: await createTimeOff(request.auth!, parsed.data) });
  },
);

router.delete(
  "/time-off/:timeOffId",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    response
      .status(200)
      .json({ data: await deleteTimeOff(request.auth!, id(request.params.timeOffId)) });
  },
);

router.get(
  "/proposals",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    const parsed = proposalListSchema.safeParse(request.query);
    if (!parsed.success) return validation(response, parsed.error);
    response
      .status(200)
      .json({ data: await listProposals(request.auth!, parsed.data) });
  },
);

router.post(
  "/proposals",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    const parsed = proposalSchema.safeParse(request.body);
    if (!parsed.success) return validation(response, parsed.error);
    response
      .status(201)
      .json({ data: await createProposal(request.auth!, parsed.data) });
  },
);

router.post(
  "/proposals/:proposalId/pick",
  requireAuth,
  async (request, response) => {
    const parsed = pickSchema.safeParse(request.body);
    if (!parsed.success) return validation(response, parsed.error);
    response
      .status(200)
      .json({
        data: await pickProposal(
          request.auth!,
          id(request.params.proposalId),
          parsed.data,
        ),
      });
  },
);

router.post(
  "/holds",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    const parsed = holdSchema.safeParse(request.body);
    if (!parsed.success) return validation(response, parsed.error);
    response
      .status(201)
      .json({ data: await createHold(request.auth!, parsed.data) });
  },
);

router.post(
  "/holds/:holdId/confirm",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    response
      .status(200)
      .json({
        data: await confirmHold(request.auth!, id(request.params.holdId)),
      });
  },
);

export { router as bookingRouter };
