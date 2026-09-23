import type { z } from "zod";

/**
 * Phase 11, Slice C: authorized tool layer.
 *
 * Per architecture.md ADR-010, the AI model never gets direct database
 * access. Every fact it can act on comes from one of these tools, which are
 * plain typed server-side functions — company-scoped, read-only, and
 * independent of any model/provider. Slice D (model gateway) will call
 * `executeTool` by name; nothing in this directory talks to an LLM.
 */

export interface ToolContext {
  companyId: string;
  userId: string;
  role: "OWNER" | "DISPATCHER" | "TECHNICIAN";
}

/**
 * Hand-authored JSON-schema-shaped parameter description for the eventual
 * model provider (Slice D). This is written by hand rather than derived
 * from the Zod schema below so we don't need a `zod-to-json-schema`
 * dependency (rules.md: never add a dependency silently), and so the
 * provider-facing description can stay simple and readable independent of
 * internal validation details.
 */
export interface ToolParameterSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
}

// The registry in index.ts holds tools with different Input/Output shapes
// in one array. TypeScript can't preserve each entry's specific generic
// through that, so `Input`/`Output` default to `any` here purely for that
// storage step. `executeTool` re-validates every call against the tool's
// own Zod `inputSchema` before it runs, so this erasure never bypasses
// runtime type safety — it only loosens compile-time inference for the
// registry array itself. Every individual tool below is still declared
// with its own concrete Input/Output types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ToolDefinition<Input = any, Output = any> {
  name: string;
  description: string;
  inputSchema: z.ZodType<Input>;
  parameters: ToolParameterSchema;
  execute: (context: ToolContext, input: Input) => Promise<Output>;
}
