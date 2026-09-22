import { AppError } from "../../../common/errors.js";
import { businessMetricsTool } from "./business-metrics.tool.js";
import { customerHistoryTool } from "./customer-history.tool.js";
import { jobsAtRiskTool } from "./jobs-at-risk.tool.js";
import { scheduleWorkloadTool } from "./schedule-workload.tool.js";
import type { ToolContext, ToolDefinition } from "./types.js";

/**
 * Phase 11, Slice C tool registry.
 *
 * The initial Slice C delivery registered only jobsAtRiskTool and
 * customerHistoryTool, leaving the two other tools plan.md/PRD.md call for
 * ("analytics questions" and technician workload) unbuilt. scheduleWorkloadTool
 * and businessMetricsTool complete that set (Slice C2).
 *
 * Slice D's model gateway calls `executeTool` by name with whatever
 * arguments the model produced; it never touches Prisma or an individual
 * tool file directly. That keeps the authorization/validation boundary in
 * exactly one place (ADR-010).
 */

// See the comment on `ToolDefinition` in ./types.ts for why this array is
// loosely typed — each tool above is still declared with concrete types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TOOLS: ToolDefinition<any, any>[] = [
  jobsAtRiskTool,
  customerHistoryTool,
  scheduleWorkloadTool,
  businessMetricsTool,
];

export interface ToolDescriptor {
  name: string;
  description: string;
  parameters: ToolDefinition["parameters"];
}

/** Provider-facing tool list for Slice D (name, description, parameters). */
export function listToolDescriptors(): ToolDescriptor[] {
  return TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

/**
 * Validates `rawInput` against the named tool's own schema and runs it,
 * scoped to `context.companyId`. Throws `AppError` for an unknown tool name
 * or input that fails validation — both are caller/model mistakes, not a
 * normal "no data" result, so they are distinct from a tool's own
 * not-found-shaped return value (see e.g. `CustomerHistoryResult.found`).
 */
export async function executeTool(
  name: string,
  rawInput: unknown,
  context: ToolContext,
): Promise<unknown> {
  const tool = TOOLS.find((candidate) => candidate.name === name);
  if (!tool) {
    throw new AppError("AI_TOOL_NOT_FOUND", `Unknown AI tool: ${name}`, 422);
  }

  const parsed = tool.inputSchema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    throw new AppError(
      "AI_TOOL_INVALID_INPUT",
      parsed.error.issues.map((issue) => issue.message).join(", "),
      422,
    );
  }

  return tool.execute(context, parsed.data);
}

export type { ToolContext, ToolDefinition } from "./types.js";
export {
  customerHistoryTool,
  getCustomerJobHistory,
  type CustomerHistoryInput,
  type CustomerHistoryResult,
} from "./customer-history.tool.js";
export {
  jobsAtRiskTool,
  getJobsAtRisk,
  type JobsAtRiskInput,
  type JobsAtRiskResult,
} from "./jobs-at-risk.tool.js";
export {
  scheduleWorkloadTool,
  getScheduleWorkload,
  type ScheduleWorkloadInput,
  type ScheduleWorkloadResult,
} from "./schedule-workload.tool.js";
export {
  businessMetricsTool,
  getBusinessMetrics,
  type BusinessMetricsInput,
  type BusinessMetricsResult,
} from "./business-metrics.tool.js";