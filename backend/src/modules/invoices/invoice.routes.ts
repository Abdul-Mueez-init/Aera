import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../common/auth/auth.middleware.js";
import {
  addInvoiceManualItem,
  generateInvoiceFromJob,
  getInvoice,
  issueInvoice,
  listInvoicePayments,
  listInvoices,
  recordPayment,
  type InvoiceStatusValue,
  type PaymentMethodValue,
} from "./invoice.service.js";
import { createRefund, listInvoiceRefunds } from "./refund.service.js";
import {
  listDisputes,
  markDisputeUnderReview,
  resolveDispute,
} from "./invoice-dispute.service.js";

const router = Router();
const managerRoles = ["OWNER", "DISPATCHER"] as const;
const statuses = [
  "DRAFT",
  "ISSUED",
  "PARTIALLY_PAID",
  "PAID",
  "VOID",
  "OVERDUE",
] as const;
const methods = ["CASH", "CARD", "BANK_TRANSFER", "OTHER"] as const;
const listSchema = z.object({
  status: z.enum(statuses).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
const manualItemSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.number().positive().max(1_000_000),
  unitPriceMinor: z.number().int().min(0).max(100_000_000),
});
const paymentSchema = z.object({
  amountMinor: z.number().int().min(0).max(1_000_000_000),
  currency: z.string().regex(/^[A-Za-z]{3}$/),
  method: z.enum(methods),
  reference: z.string().trim().max(240).optional(),
});
const refundSchema = z.object({
  paymentId: z.string().uuid(),
  amountMinor: z.number().int().positive().max(1_000_000_000),
  reason: z.string().trim().min(1).max(500),
});
const disputeListSchema = z.object({
  status: z.enum(["OPEN", "UNDER_REVIEW", "RESOLVED"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
const disputeResolveSchema = z.object({
  resolution: z.enum(["UPHELD", "ADJUSTED", "REFUNDED"]),
  note: z.string().trim().min(1).max(1000),
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

function idempotencyKey(request: { header(name: string): string | undefined }) {
  // HTTP headers are case-insensitive, so check both common casings
  return (
    request.header("idempotency-key") ||
    request.header("Idempotency-Key") ||
    request.header("IDEMPOTENCY-KEY")
  )?.trim();
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
      data: await listInvoices(
        request.auth!,
        parsed.data.status as InvoiceStatusValue | undefined,
        parsed.data.page,
        parsed.data.pageSize,
      ),
    });
  },
);

// Phase 7.6 — disputes inbox. Registered before /:invoiceId so the
// literal "disputes" segment isn't captured as an invoice id.
router.get(
  "/disputes",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    const parsed = disputeListSchema.safeParse(request.query);
    if (!parsed.success) {
      sendValidationError(response, parsed.error);
      return;
    }
    response.status(200).json({
      data: await listDisputes(
        request.auth!,
        parsed.data.status,
        parsed.data.page,
        parsed.data.pageSize,
      ),
    });
  },
);

router.post(
  "/disputes/:disputeId/review",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    response.status(200).json({
      data: await markDisputeUnderReview(
        request.auth!,
        routeId(request.params.disputeId),
      ),
    });
  },
);

router.post(
  "/disputes/:disputeId/resolve",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    const parsed = disputeResolveSchema.safeParse(request.body);
    if (!parsed.success) {
      sendValidationError(response, parsed.error);
      return;
    }
    response.status(200).json({
      data: await resolveDispute(
        request.auth!,
        routeId(request.params.disputeId),
        parsed.data,
      ),
    });
  },
);

const fromJobSchema = z.object({
  allowZeroAmount: z.boolean().optional(),
});

router.post(
  "/from-job/:jobId",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    const parsed = fromJobSchema.safeParse(request.body ?? {});
    response.status(201).json({
      data: await generateInvoiceFromJob(
        request.auth!,
        routeId(request.params.jobId),
        parsed.success ? parsed.data : undefined,
      ),
    });
  },
);

// Phase 6.6 — staff add a MANUAL line while reviewing the DRAFT preview.
router.post(
  "/:invoiceId/items",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    const parsed = manualItemSchema.safeParse(request.body);
    if (!parsed.success) {
      sendValidationError(response, parsed.error);
      return;
    }
    response.status(201).json({
      data: await addInvoiceManualItem(
        request.auth!,
        routeId(request.params.invoiceId),
        parsed.data,
      ),
    });
  },
);

router.get(
  "/:invoiceId",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    response.status(200).json({
      data: await getInvoice(request.auth!, routeId(request.params.invoiceId)),
    });
  },
);

router.post(
  "/:invoiceId/issue",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    response.status(200).json({
      data: await issueInvoice(
        request.auth!,
        routeId(request.params.invoiceId),
      ),
    });
  },
);

router.get(
  "/:invoiceId/payments",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    response.status(200).json({
      data: await listInvoicePayments(
        request.auth!,
        routeId(request.params.invoiceId),
      ),
    });
  },
);

router.post(
  "/:invoiceId/payments",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    const parsed = paymentSchema.safeParse(request.body);
    const key = idempotencyKey(request);
    if (!parsed.success || !key || key.length > 200) {
      if (!parsed.success) {
        sendValidationError(response, parsed.error);
      } else {
        response.status(422).json({
          error: {
            code: "VALIDATION_FAILED",
            message: "Idempotency-Key header is required",
          },
        });
      }
      return;
    }
    response.status(201).json({
      data: await recordPayment(
        request.auth!,
        routeId(request.params.invoiceId),
        {
          ...parsed.data,
          idempotencyKey: key,
          method: parsed.data.method as PaymentMethodValue,
        },
      ),
    });
  },
);

// Phase 7.5 — refunds. OWNER only: moving money back out is the most
// sensitive operation in the ledger.
router.get(
  "/:invoiceId/refunds",
  requireAuth,
  requireRole(...managerRoles),
  async (request, response) => {
    response.status(200).json({
      data: await listInvoiceRefunds(
        request.auth!,
        routeId(request.params.invoiceId),
      ),
    });
  },
);

router.post(
  "/:invoiceId/refunds",
  requireAuth,
  requireRole("OWNER"),
  async (request, response) => {
    const parsed = refundSchema.safeParse(request.body);
    if (!parsed.success) {
      sendValidationError(response, parsed.error);
      return;
    }
    response.status(201).json({
      data: await createRefund(
        request.auth!,
        routeId(request.params.invoiceId),
        parsed.data,
      ),
    });
  },
);

export { router as invoiceRouter };
