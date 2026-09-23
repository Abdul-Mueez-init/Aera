import { z } from "zod";
import { prisma } from "../../../db/prisma.js";
import type {
  ToolContext,
  ToolDefinition,
  ToolParameterSchema,
} from "./types.js";

/**
 * "Give me a concise summary of <customer>'s last N service visits" — the
 * second Phase-11 demo moment (plan.md, 2:55).
 *
 * Name lookup is deliberately conservative: an ambiguous or missing name
 * returns candidates/nothing rather than guessing, so the model can never
 * attribute one customer's history to another (ADR-010's "cannot invent
 * database facts" applies to identity resolution too, not just numbers).
 */

const DEFAULT_VISIT_LIMIT = 3;
const MAX_VISIT_LIMIT = 10;
const MAX_NAME_MATCHES = 5;

export const customerHistoryInputSchema = z
  .object({
    customerId: z.string().uuid().optional(),
    customerName: z.string().trim().min(1).max(200).optional(),
    limit: z.number().int().positive().max(MAX_VISIT_LIMIT).optional(),
  })
  .refine((value) => Boolean(value.customerId ?? value.customerName), {
    message: "Provide either customerId or customerName",
  });
export type CustomerHistoryInput = z.infer<typeof customerHistoryInputSchema>;

export const customerHistoryParameters: ToolParameterSchema = {
  type: "object",
  properties: {
    customerId: {
      type: "string",
      description: "Exact customer UUID, if already known.",
    },
    customerName: {
      type: "string",
      description: "Customer's full or partial name, e.g. 'Sarah Khan'.",
    },
    limit: {
      type: "number",
      description: "Max number of recent visits to return (default 3, max 10).",
    },
  },
};

interface CustomerMatch {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

interface JobVisit {
  jobId: string;
  jobNumber: number;
  serviceType: string;
  problemDescription: string;
  status: string;
  completedAt: string | null;
  scheduledStart: string | null;
  completionSummary: string | null;
  technician: string | null;
}

export interface CustomerHistoryResult {
  found: boolean;
  ambiguous: boolean;
  matches: CustomerMatch[];
  customer: CustomerMatch | null;
  visits: JobVisit[];
}

function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`;
}

async function findCustomer(
  companyId: string,
  input: CustomerHistoryInput,
): Promise<{ customer: CustomerMatch | null; matches: CustomerMatch[] }> {
  if (input.customerId) {
    const customer = await prisma.customer.findFirst({
      where: { companyId, id: input.customerId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
      },
    });
    if (!customer) {
      return { customer: null, matches: [] };
    }
    return {
      customer: {
        id: customer.id,
        name: fullName(customer),
        email: customer.email,
        phone: customer.phone,
      },
      matches: [],
    };
  }

  const term = input.customerName!.trim();
  const tokens = term.split(/\s+/).filter(Boolean);
  const lastToken = tokens[tokens.length - 1];

  const rows = await prisma.customer.findMany({
    where: {
      companyId,
      OR: [
        { firstName: { contains: term, mode: "insensitive" } },
        { lastName: { contains: term, mode: "insensitive" } },
        ...(tokens.length > 1
          ? [
              {
                AND: [
                  {
                    firstName: {
                      contains: tokens[0],
                      mode: "insensitive" as const,
                    },
                  },
                  {
                    lastName: {
                      contains: lastToken,
                      mode: "insensitive" as const,
                    },
                  },
                ],
              },
            ]
          : []),
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: MAX_NAME_MATCHES,
  });

  const matches = rows.map((row) => ({
    id: row.id,
    name: fullName(row),
    email: row.email,
    phone: row.phone,
  }));

  if (matches.length === 1) {
    return { customer: matches[0], matches: [] };
  }
  return { customer: null, matches };
}

export async function getCustomerJobHistory(
  context: ToolContext,
  input: CustomerHistoryInput,
): Promise<CustomerHistoryResult> {
  const { customer, matches } = await findCustomer(context.companyId, input);

  if (!customer) {
    return {
      found: false,
      ambiguous: matches.length > 1,
      matches,
      customer: null,
      visits: [],
    };
  }

  const limit = input.limit ?? DEFAULT_VISIT_LIMIT;
  const jobs = await prisma.job.findMany({
    where: {
      companyId: context.companyId,
      customerId: customer.id,
      status: "COMPLETED",
    },
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      jobNumber: true,
      serviceType: true,
      problemDescription: true,
      status: true,
      completedAt: true,
      scheduledStart: true,
      completionSummary: true,
      assignedTechnician: { select: { firstName: true, lastName: true } },
    },
  });

  const visits: JobVisit[] = jobs.map((job) => ({
    jobId: job.id,
    jobNumber: job.jobNumber,
    serviceType: job.serviceType,
    problemDescription: job.problemDescription,
    status: job.status,
    completedAt: job.completedAt?.toISOString() ?? null,
    scheduledStart: job.scheduledStart?.toISOString() ?? null,
    completionSummary: job.completionSummary,
    technician: job.assignedTechnician
      ? fullName(job.assignedTechnician)
      : null,
  }));

  return { found: true, ambiguous: false, matches: [], customer, visits };
}

export const customerHistoryTool: ToolDefinition<
  CustomerHistoryInput,
  CustomerHistoryResult
> = {
  name: "get_customer_job_history",
  description:
    "Looks up a customer by exact ID or by name and returns their most recent completed service visits (job type, problem, completion summary, technician, date). If a name matches more than one customer, returns the candidate list instead of guessing — call again with customerId once the right one is known.",
  inputSchema: customerHistoryInputSchema,
  parameters: customerHistoryParameters,
  execute: getCustomerJobHistory,
};
