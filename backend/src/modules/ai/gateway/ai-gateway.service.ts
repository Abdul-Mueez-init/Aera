import { env } from "../../../config/env.js";
import { logger } from "../../../common/logger.js";
import { AppError } from "../../../common/errors.js";
import { executeTool, listToolDescriptors } from "../tools/index.js";
import type { ToolContext } from "../tools/types.js";
import { generateContent } from "./gemini.client.js";
import type { GeminiContent, GeminiPart } from "./gemini.client.js";

/**
 * Phase 11, Slice D: the model gateway.
 *
 * Per architecture.md ADR-010, the model never receives database access.
 * The only facts it can act on are whatever `executeTool` (Slice C) hands
 * back, and every tool call/result made here is reported to the caller so
 * ai.service.ts can persist an honest, inspectable trail — this is also
 * what design.md's "AI surfaces" section asks for: "AI cards should show
 * the question, the answer, the underlying data references, and an
 * action," not a black-box chat bubble.
 */

const SYSTEM_INSTRUCTION = `You are Aera's operations assistant for a field-service (HVAC) company.

You help owners and dispatchers understand what is happening in their business right now: which jobs need attention, what today's schedule and technician workload look like, current operational/financial metrics, and what a customer's service history looks like.

Rules:
- Only state facts returned by your tools. Never invent job numbers, customer names, addresses, dates, amounts, or statuses.
- If a tool finds nothing, or a customer name is ambiguous, say so plainly and ask a short follow-up instead of guessing.
- Prefer the most specific tool result available; call a tool again with a narrower argument (e.g. a customerId once a name match is confirmed) rather than assuming.
- Be concise and operational: lead with the answer, then the supporting detail. This is a working tool for someone mid-shift, not a chat companion.
- You cannot change any record. If asked to do something like reschedule a job or record a payment, say that you can only report on data today and the person should use the relevant screen.`;

// Bounds how much prior conversation is replayed into each new turn. Kept
// well under the client-facing message-list cap (ai.routes.ts: 100) to
// bound both the request payload and token usage per turn.
export const AI_HISTORY_MESSAGE_LIMIT = 20;

export interface AiHistoryMessage {
  role: "USER" | "ASSISTANT";
  content: string;
}

export interface AiTurnToolCall {
  name: string;
  input: unknown;
  output: unknown;
  error?: string;
}

export interface AiTurnResult {
  text: string;
  toolCalls: AiTurnToolCall[];
  degraded: boolean;
}

function toGeminiHistory(history: AiHistoryMessage[]): GeminiContent[] {
  return history.map((message) => ({
    role: message.role === "USER" ? "user" : "model",
    parts: [{ text: message.content }],
  }));
}

function toolResponsePayload(output: unknown): Record<string, unknown> {
  // Gemini's functionResponse.response must be an object (it is sent as a
  // Struct). Every real tool in tools/index.ts already returns a plain
  // object, so this only matters for the defensive error-shape fallback.
  if (typeof output === "object" && output !== null && !Array.isArray(output)) {
    return output as Record<string, unknown>;
  }
  return { result: output };
}

/**
 * Runs one AI turn (the newest user message plus however much prior
 * history the caller passes in) to completion: repeatedly calls Gemini,
 * executes any tool calls it asks for, and feeds the results back until it
 * returns a plain text answer or the iteration cap is hit.
 *
 * Returns `null` — never throws for a missing key — when `GEMINI_API_KEY`
 * is not configured, matching gemini.client.ts's own graceful-skip
 * contract. Network/API errors from Gemini itself still throw; the caller
 * (ai.service.ts) decides how to degrade.
 */
export async function runAiTurn(
  context: ToolContext,
  history: AiHistoryMessage[],
): Promise<AiTurnResult | null> {
  const functionDeclarations = listToolDescriptors().map((tool) => ({
    name: tool.name,
    description: tool.description,
    parametersJsonSchema: tool.parameters,
  }));

  const contents = toGeminiHistory(history);
  const toolCalls: AiTurnToolCall[] = [];

  for (
    let iteration = 0;
    iteration < env.AI_MAX_TOOL_ITERATIONS;
    iteration += 1
  ) {
    const result = await generateContent({
      systemInstruction: SYSTEM_INSTRUCTION,
      contents,
      functionDeclarations,
    });

    if (!result) {
      return null;
    }

    // Echoed back verbatim (not reconstructed) so any id/thoughtSignature
    // Gemini attached to a functionCall part survives into the next
    // request, per Gemini's own multi-step tool-call guidance.
    contents.push(result.content);

    const callParts = result.content.parts.filter(
      (
        part,
      ): part is GeminiPart & {
        functionCall: NonNullable<GeminiPart["functionCall"]>;
      } => part.functionCall !== undefined,
    );

    if (callParts.length === 0) {
      const text = result.content.parts
        .map((part) => part.text ?? "")
        .join("")
        .trim();
      return {
        text:
          text ||
          "I didn't get a usable response for that — try rephrasing the question.",
        toolCalls,
        degraded: false,
      };
    }

    const responseParts: GeminiPart[] = [];
    for (const part of callParts) {
      const call = part.functionCall;
      let output: unknown;
      let error: string | undefined;

      try {
        output = await executeTool(call.name, call.args ?? {}, context);
      } catch (toolError) {
        error =
          toolError instanceof AppError
            ? toolError.message
            : "Tool execution failed unexpectedly.";
        output = { error };
        logger.warn(
          { err: toolError, tool: call.name, companyId: context.companyId },
          "AI tool call failed",
        );
      }

      toolCalls.push({
        name: call.name,
        input: call.args ?? {},
        output,
        error,
      });
      responseParts.push({
        functionResponse: {
          ...(call.id ? { id: call.id } : {}),
          name: call.name,
          response: toolResponsePayload(output),
        },
      });
    }

    contents.push({ role: "user", parts: responseParts });
  }

  logger.warn(
    { companyId: context.companyId, toolCallCount: toolCalls.length },
    "AI turn hit the tool-iteration cap without a final answer",
  );

  return {
    text: "I gathered some data but couldn't finish forming an answer within the allowed number of steps. Try asking again, or narrow the question (e.g. a specific customer or date).",
    toolCalls,
    degraded: true,
  };
}
