import { AppError } from "../../common/errors.js";
import { logger } from "../../common/logger.js";
import { prisma } from "../../db/prisma.js";
import type { Prisma } from "../../generated/prisma/index.js";
import {
  runAiTurn,
  AI_HISTORY_MESSAGE_LIMIT,
} from "./gateway/ai-gateway.service.js";
import type { AiHistoryMessage } from "./gateway/ai-gateway.service.js";

/**
 * Phase 11: AI conversation persistence (Slice B) plus the model gateway
 * turn (Slice D).
 *
 * Tenancy + ownership: every query is scoped by `companyId` AND `userId`.
 * A conversation is private to the user who started it. Anything else is
 * reported as "not found" (never "forbidden") so IDs cannot be probed.
 *
 * Per architecture ADR-010 the model never receives database access — it
 * only sees whatever `runAiTurn` (Slice D, calling Slice C's typed tools)
 * hands back, and nothing here lets it write anything.
 */

const TITLE_MAX_CHARS = 60;

// TOOL messages hold raw tool-call results that the server (Slice C/D) will
// write. They are internal plumbing and are never returned to clients.
const CLIENT_VISIBLE_ROLES = ["USER", "ASSISTANT"] as const;

const conversationSelect = {
  id: true,
  title: true,
  createdAt: true,
  updatedAt: true,
} as const;

const messageSelect = {
  id: true,
  role: true,
  content: true,
  metadata: true,
  createdAt: true,
} as const;

function conversationNotFound(): AppError {
  return new AppError("RESOURCE_NOT_FOUND", "AI conversation not found", 404);
}

/**
 * Derives a short single-line title from the first user message.
 * Uses code points (not UTF-16 units) so an emoji is never split in half.
 */
export function deriveConversationTitle(content: string): string {
  const singleLine = content.replace(/\s+/g, " ").trim();
  const characters = Array.from(singleLine);

  if (characters.length <= TITLE_MAX_CHARS) {
    return singleLine;
  }

  return `${characters
    .slice(0, TITLE_MAX_CHARS - 1)
    .join("")
    .trimEnd()}…`;
}

export interface CreateConversationInput {
  companyId: string;
  userId: string;
  title?: string;
}

export async function createConversation(input: CreateConversationInput) {
  return prisma.aiConversation.create({
    data: {
      companyId: input.companyId,
      userId: input.userId,
      title: input.title ?? null,
    },
    select: conversationSelect,
  });
}

export interface ListConversationsInput {
  companyId: string;
  userId: string;
  page: number;
  pageSize: number;
}

export async function listConversations(input: ListConversationsInput) {
  const where = { companyId: input.companyId, userId: input.userId };
  const skip = (input.page - 1) * input.pageSize;

  const [items, total] = await prisma.$transaction([
    prisma.aiConversation.findMany({
      where,
      select: conversationSelect,
      // Matches index (companyId, userId, updatedAt DESC). `id` is a stable
      // tie-breaker so pagination never repeats or skips rows.
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip,
      take: input.pageSize,
    }),
    prisma.aiConversation.count({ where }),
  ]);

  return {
    items,
    meta: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      pageCount: Math.ceil(total / input.pageSize),
    },
  };
}

export interface GetConversationInput {
  companyId: string;
  userId: string;
  conversationId: string;
  limit: number;
}

/**
 * Returns the conversation plus its most recent `limit` client-visible
 * messages in chronological order (oldest first, ready to render).
 * The message list is always bounded (rules.md: no unbounded lists).
 */
export async function getConversation(input: GetConversationInput) {
  const conversation = await prisma.aiConversation.findFirst({
    where: {
      id: input.conversationId,
      companyId: input.companyId,
      userId: input.userId,
    },
    select: conversationSelect,
  });

  if (!conversation) {
    throw conversationNotFound();
  }

  const where = {
    companyId: input.companyId,
    conversationId: input.conversationId,
    role: { in: [...CLIENT_VISIBLE_ROLES] },
  };

  const [messageCount, newestFirst] = await prisma.$transaction([
    prisma.aiMessage.count({ where }),
    prisma.aiMessage.findMany({
      where,
      select: messageSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit,
    }),
  ]);

  const messages = [...newestFirst].reverse();

  return {
    conversation,
    messages,
    meta: {
      messageCount,
      hasMore: messageCount > messages.length,
    },
  };
}

export interface PostUserMessageInput {
  companyId: string;
  userId: string;
  role: "OWNER" | "DISPATCHER" | "TECHNICIAN";
  conversationId: string;
  content: string;
}

/**
 * Persists a USER message, then (Slice D) runs one AI turn and persists the
 * TOOL/ASSISTANT messages it produces. The role is fixed to USER for the
 * client-supplied message: clients can never author ASSISTANT or TOOL
 * messages directly.
 *
 * Two separate transactions, deliberately: the user message must exist the
 * moment it's sent regardless of what the model does afterward (rules.md
 * §7's transaction guidance is about writes that must succeed/fail
 * together — persisting the user's message and calling an external HTTP
 * API are not that; holding a transaction open across a network round trip
 * to Gemini would hold a row lock for the duration of that call, which is
 * exactly what to avoid). If the AI turn fails or is unconfigured,
 * `assistantMessage` is `null` and the user's message is unaffected — an
 * AI failure must not look like a lost message.
 */
export async function postUserMessage(input: PostUserMessageInput) {
  const { userMessage, conversationId } = await prisma.$transaction(
    async (transaction) => {
      const conversation = await transaction.aiConversation.findFirst({
        where: {
          id: input.conversationId,
          companyId: input.companyId,
          userId: input.userId,
        },
        select: { id: true, title: true },
      });

      if (!conversation) {
        throw conversationNotFound();
      }

      const userMessage = await transaction.aiMessage.create({
        data: {
          companyId: input.companyId,
          conversationId: conversation.id,
          role: "USER",
          content: input.content,
        },
        select: messageSelect,
      });

      await transaction.aiConversation.update({
        where: { id: conversation.id },
        data: {
          // @updatedAt only fires when the row itself changes, so bump it
          // explicitly to keep "most recent conversation first" correct.
          updatedAt: new Date(),
          ...(conversation.title === null
            ? { title: deriveConversationTitle(input.content) }
            : {}),
        },
      });

      return { userMessage, conversationId: conversation.id };
    },
  );

  const assistantMessage = await runAssistantTurn({
    companyId: input.companyId,
    userId: input.userId,
    role: input.role,
    conversationId,
  });

  return { userMessage, assistantMessage };
}

/**
 * `AiTurnToolCall.input` is `unknown` (it originates from Gemini's parsed
 * JSON response), but Prisma's `metadata Json?` column requires a value
 * assignable to `Prisma.InputJsonValue`, a strict recursive JSON type that
 * `unknown` never satisfies. Round-tripping through `JSON.stringify`/
 * `JSON.parse` both guarantees the value really is plain JSON (tool
 * inputs/outputs should already be, but this is the one place it's
 * actually written to the DB) and gives TypeScript a value it can check
 * against `InputJsonValue`, rather than reaching for a blind `as` cast.
 */
function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

interface RunAssistantTurnInput {
  companyId: string;
  userId: string;
  role: "OWNER" | "DISPATCHER" | "TECHNICIAN";
  conversationId: string;
}

/**
 * Loads bounded recent history (including the user message just committed
 * above), runs the model gateway, and persists whatever it produced. Any
 * failure here — no API key configured, a Gemini API error, a network
 * error — is caught and logged; the function returns `null` rather than
 * throwing so a broken AI gateway can never turn into a failed message
 * post (the user's message already committed successfully).
 */
async function runAssistantTurn(input: RunAssistantTurnInput) {
  let history: AiHistoryMessage[];
  try {
    const recent = await prisma.aiMessage.findMany({
      where: {
        companyId: input.companyId,
        conversationId: input.conversationId,
        role: { in: [...CLIENT_VISIBLE_ROLES] },
      },
      select: { role: true, content: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: AI_HISTORY_MESSAGE_LIMIT,
    });
    history = recent.reverse().map((message) => ({
      role: message.role as "USER" | "ASSISTANT",
      content: message.content,
    }));
  } catch (error) {
    logger.error(
      { err: error, conversationId: input.conversationId },
      "Failed to load AI conversation history",
    );
    return null;
  }

  let turn;
  try {
    turn = await runAiTurn(
      { companyId: input.companyId, userId: input.userId, role: input.role },
      history,
    );
  } catch (error) {
    logger.error(
      { err: error, conversationId: input.conversationId },
      "AI gateway turn failed",
    );
    return null;
  }

  if (!turn) {
    // GEMINI_API_KEY not configured — already logged once by gemini.client.ts.
    return null;
  }

  try {
    return await prisma.$transaction(async (transaction) => {
      for (const call of turn.toolCalls) {
        await transaction.aiMessage.create({
          data: {
            companyId: input.companyId,
            conversationId: input.conversationId,
            role: "TOOL",
            content: JSON.stringify({
              tool: call.name,
              input: call.input,
              output: call.output,
              ...(call.error ? { error: call.error } : {}),
            }),
          },
        });
      }

      const assistantMessage = await transaction.aiMessage.create({
        data: {
          companyId: input.companyId,
          conversationId: input.conversationId,
          role: "ASSISTANT",
          content: turn.text,
          metadata: {
            toolCalls: turn.toolCalls.map((call) => ({
              name: call.name,
              input: toInputJson(call.input),
            })),
            degraded: turn.degraded,
          },
        },
        select: messageSelect,
      });

      await transaction.aiConversation.update({
        where: { id: input.conversationId },
        data: { updatedAt: new Date() },
      });

      return assistantMessage;
    });
  } catch (error) {
    logger.error(
      { err: error, conversationId: input.conversationId },
      "Failed to persist AI assistant reply",
    );
    return null;
  }
}