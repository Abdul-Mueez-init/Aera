import { env } from "../../../config/env.js";
import { logger } from "../../../common/logger.js";
import type { ToolParameterSchema } from "../tools/types.js";

/**
 * Phase 11, Slice D: raw REST call to Google Gemini's `generateContent`
 * endpoint. Plain `fetch` rather than the `@google/genai` SDK — the request
 * shape is a single stable JSON POST, so a dependency isn't warranted
 * (rules.md §11: "do not introduce a library for a problem that can be
 * solved clearly with the existing stack"), matching the pattern already
 * used for `resend-email.adapter.ts` and `fcm-push.adapter.ts`.
 *
 * `generateContent` (rather than the newer Interactions API, GA since June
 * 2026) is used deliberately: it is stateless, still fully supported, and
 * the whole conversation is already persisted by ai.service.ts, so
 * server-side state management on Google's side buys nothing here.
 *
 * This module only knows how to make one call and parse one response. It
 * has no opinion about tools, conversation history, or looping — that is
 * ai-gateway.service.ts's job. Keeping the two separate means this file can
 * be tested with a couple of mocked `fetch` calls, the same way
 * push-notifications.test.ts tests fcm-push.adapter.ts.
 */

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

// Per-call bound so one slow/hung Gemini request can't hold an HTTP request
// (and the rate-limited AI endpoint) open indefinitely.
const REQUEST_TIMEOUT_MS = 30_000;

export interface GeminiFunctionCall {
  id?: string;
  name: string;
  args?: Record<string, unknown>;
}

export interface GeminiFunctionResponse {
  id?: string;
  name: string;
  response: Record<string, unknown>;
}

export interface GeminiPart {
  text?: string;
  functionCall?: GeminiFunctionCall;
  functionResponse?: GeminiFunctionResponse;
}

export interface GeminiContent {
  // Gemini's REST schema also accepts "function"/"tool" for the turn that
  // carries a functionResponse in some doc examples, but Google's own
  // current REST example for matching function-call ids uses "user" for
  // that turn (ai.google.dev, "What's new in Gemini 3.5 Flash") — used
  // consistently here for both plain replies and functionResponse turns.
  role: "user" | "model";
  parts: GeminiPart[];
}

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  // The classic `parameters` field expects Gemini's own uppercase-typed
  // Schema (e.g. `"type": "OBJECT"`). `parametersJsonSchema` is a separate,
  // mutually-exclusive field that accepts plain lowercase JSON Schema
  // instead, which is exactly the shape `ToolParameterSchema` already uses
  // (see tools/types.ts) — so no case-conversion layer is needed.
  parametersJsonSchema: ToolParameterSchema;
}

export interface GenerateContentInput {
  systemInstruction: string;
  contents: GeminiContent[];
  functionDeclarations: GeminiFunctionDeclaration[];
}

export interface GenerateContentResult {
  content: GeminiContent;
  finishReason: string | null;
}

// Local/dev/test environments intentionally run without a Gemini API key.
// Warn once (not per-call) so logs stay readable.
let warnedMissingKey = false;

/**
 * Calls Gemini's `generateContent` once. Returns `null` (never throws) when
 * `GEMINI_API_KEY` is not configured — the caller treats that exactly like
 * "no assistant reply this turn", the same graceful-skip shape as the
 * Resend/FCM/Textbee adapters. Throws on a network error or a non-2xx
 * response so the caller's existing try/catch can degrade the AI turn
 * without failing the user's message post.
 */
export async function generateContent(
  input: GenerateContentInput,
): Promise<GenerateContentResult | null> {
  if (!env.GEMINI_API_KEY) {
    if (!warnedMissingKey) {
      logger.warn(
        "GEMINI_API_KEY is not configured; skipping AI reply. This is expected in local/dev/test — set GEMINI_API_KEY to get real AI replies.",
      );
      warnedMissingKey = true;
    }
    return null;
  }

  const url = `${GEMINI_API_BASE}/${env.GEMINI_MODEL}:generateContent`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "x-goog-api-key": env.GEMINI_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: input.systemInstruction }] },
      contents: input.contents,
      ...(input.functionDeclarations.length > 0
        ? { tools: [{ functionDeclarations: input.functionDeclarations }] }
        : {}),
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1024,
      },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    // Never log the API key or full response body verbatim (rules.md §2,
    // §6: no secrets/sensitive data in logs); truncate defensively.
    const body = await response.text().catch(() => "");
    throw new Error(
      `Gemini API request failed (${response.status}): ${body.slice(0, 300)}`,
    );
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: GeminiContent;
      finishReason?: string;
    }>;
  };

  const candidate = data.candidates?.[0];
  if (!candidate?.content) {
    throw new Error("Gemini API returned no candidate content");
  }

  return {
    content: { role: "model", parts: candidate.content.parts ?? [] },
    finishReason: candidate.finishReason ?? null,
  };
}
