import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../common/auth/auth.middleware.js";
import {
  generateInvoiceFromJob,
  getInvoice,
  issueInvoice,
  listInvoicePayments,
  listInvoices,
  recordPayment,
  type InvoiceStatusValue,
  type PaymentMethodValue,
} from "./invoice.service.js";

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
const listSchema = z.object({ status: z.enum(statuses).optional() });
const paymentSchema = z.object({
  amountMinor: z.number().int().positive().max(1_000_000_000),
  currency: z.string().regex(/^[A-Za-z]{3}$/),
  method: z.enum(methods),
  reference: z.string().trim().max(240).optional(),
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
  return request.header("idempotency-key")?.trim();
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

export { router as invoiceRouter };
