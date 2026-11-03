import { z } from "zod";
import type { Prisma } from "../../generated/prisma/index.js";

export const requestStatuses = [
  "SUBMITTED",
  "NEEDS_INFO",
  "QUOTING",
  "QUOTED",
  "ACCEPTED",
  "DECLINED",
  "EXPIRED",
  "CANCELLED",
  "CLOSED",
] as const;

export const requestSources = [
  "PHONE",
  "WALK_IN",
  "WEB_PORTAL",
  "STAFF_DIRECT",
] as const;

export const priorities = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

const requestFields = z.object({
  customerId: z.string().uuid(),
  serviceAddressId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(4000),
  serviceCategory: z.string().trim().min(1).max(120),
  priority: z.enum(priorities).optional(),
  requiresInspection: z.boolean().optional(),
  source: z.enum(requestSources).default("PHONE"),
  preferredWindows: z.custom<Prisma.InputJsonValue>().optional(),
  budgetMinMinor: z.number().int().nonnegative().optional(),
  budgetMaxMinor: z.number().int().nonnegative().optional(),
  budgetCurrency: z.string().regex(/^[A-Za-z]{3}$/).optional(),
});

export const createRequestSchema = requestFields.refine(
  (value) =>
    value.budgetMinMinor === undefined ||
    value.budgetMaxMinor === undefined ||
    value.budgetMinMinor <= value.budgetMaxMinor,
  "Minimum budget cannot exceed maximum budget",
);

export const updateRequestSchema = requestFields
  .omit({ customerId: true, serviceAddressId: true, source: true })
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one request field is required",
  );
