import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../common/auth/auth.middleware.js";
import {
  createQuote,
  getPublicQuote,
  getQuote,
  listQuotes,
  respondToPublicQuote,
  sendQuote,
  type QuoteStatusValue,
} from "./quote.service.js";

const router = Router();
const managerRoles = ["OWNER", "DISPATCHER"] as const;
const statuses = ["DRAFT", "SENT", "APPROVED", "DECLINED", "EXPIRED"] as const;

const itemSchema = z.object({
  description: z.string().trim().min(1).max(240),
  quantity: z.number().positive().max(10_000),
  unitPriceMinor: z.number().int().nonnegative().max(100_000_000),
});
const createSchema = z.object({
  customerId: z.string().uuid(),
  jobId: z.string().uuid().optional(),
  currency: z.string().regex(/^[A-Za-z]{3}$/),
  discountMinor: z.number().int().nonnegative().default(0),
  taxRateBps: z.number().int().min(0).max(10_000).default(0),
  expiresAt: z.coerce.date().optional(),
  items: z.array(itemSchema).min(1).max(100),
});
const listSchema = z.object({ status: z.enum(statuses).optional() });
const responseSchema = z.object({ action: z.enum(["APPROVED", "DECLINED"]) });

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
    const parsed = listSchema.safeParse(request.query);
    if (!parsed.success) {
      sendValidationError(response, parsed.error);
      return;
    }
    response.status(200).json({
      data: await listQuotes(
        request.auth!,
        parsed.data.status as QuoteStatusValue | undefined,
      ),
    });
  },
);

router.post(
  "/",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      sendValidationError(response, parsed.error);
      return;
    }
    response
      .status(201)
      .json({ data: await createQuote(request.auth!, parsed.data) });
  },
);

router.get("/shared/:shareToken", async (request, response) => {
  response.status(200).json({
    data: await getPublicQuote(routeId(request.params.shareToken)),
  });
});

router.post("/shared/:shareToken/respond", async (request, response) => {
  const parsed = responseSchema.safeParse(request.body);
  if (!parsed.success) {
    sendValidationError(response, parsed.error);
    return;
  }
  response.status(200).json({
    data: await respondToPublicQuote(
      routeId(request.params.shareToken),
      parsed.data.action,
    ),
  });
});

router.get(
  "/:quoteId",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    response.status(200).json({
      data: await getQuote(request.auth!, routeId(request.params.quoteId)),
    });
  },
);

router.post(
  "/:quoteId/send",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    response.status(200).json({
      data: await sendQuote(request.auth!, routeId(request.params.quoteId)),
    });
  },
);

export { router as quoteRouter };
