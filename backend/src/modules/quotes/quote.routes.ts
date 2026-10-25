import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../common/auth/auth.middleware.js";
import {
  createQuote,
  getQuote,
  listQuotes,
  respondToQuote,
  sendQuote,
  type QuoteStatusValue,
} from "./quote.service.js";

const router = Router();
const managerRoles = ["OWNER", "DISPATCHER"] as const;
const statuses = ["DRAFT", "SENT", "APPROVED", "DECLINED", "EXPIRED"] as const;

const itemSchema = z.object({
  description: z.string().trim().min(1).max(240),
  // QuoteItem.quantity is Decimal(10,2): at most 8 integer digits and
  // exactly the 2 decimal places the column can store. Anything finer
  // would be silently rounded by Postgres (corrupting the line total);
  // anything wider overflows the column and 500s. Zero is not a quantity.
  quantity: z
    .string()
    .regex(
      /^\d{1,8}(\.\d{1,2})?$/,
      "Quantity must be a decimal with up to 2 decimal places",
    )
    .refine((value) => Number(value) > 0, "Quantity must be greater than zero"),
  unitPriceMinor: z.number().int().nonnegative().max(100_000_000),
});
const createSchema = z.object({
  customerId: z.string().uuid(),
  jobId: z.string().uuid().optional(),
  currency: z.string().regex(/^[A-Za-z]{3}$/),
  discountMinor: z.number().int().nonnegative().default(0),
  taxRateBps: z.number().int().min(0).max(10_000).default(0),
  // A past expiresAt is allowed at creation by design: drafts may carry
  // any date, and expiry is enforced at send/respond time (422
  // QUOTE_EXPIRED) and by the list/sweep — see quote-lifecycle tests.
  expiresAt: z.coerce.date().optional(),
  items: z.array(itemSchema).min(1).max(100),
});
const listSchema = z.object({
  status: z.enum(statuses).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
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
        parsed.data.page,
        parsed.data.pageSize,
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

router.post(
  "/:quoteId/respond",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    const parsed = responseSchema.safeParse(request.body);
    if (!parsed.success) {
      sendValidationError(response, parsed.error);
      return;
    }
    response.status(200).json({
      data: await respondToQuote(
        request.auth!,
        routeId(request.params.quoteId),
        parsed.data.action,
      ),
    });
  },
);

export { router as quoteRouter };
