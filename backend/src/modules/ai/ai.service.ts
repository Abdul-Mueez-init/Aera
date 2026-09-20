import { AppError } from "../../common/errors.js";
import { prisma } from "../../db/prisma.js";

/**
 * Phase 11, Slice B: AI conversation persistence.
 *
 * Scope of this slice: conversations and messages are stored and read back.
 * NO model/LLM call happens here (that is Slice D) and there is NO tool layer
 * (Slice C). Per architecture ADR-010 the model will never receive database
 * access; nothing in this file gives it any.
 *
 * Tenancy + ownership: every query is scoped by `companyId` AND `userId`.
 * A conversation is private to the user who started it. Anything else is
 * reported as "not found" (never "forbidden") so IDs cannot be probed.
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
  conversationId: string;
  content: string;
}

/**
 * Persists a USER message. The role is fixed to USER here: clients can never
 * author ASSISTANT or TOOL messages.
 *
 * The response shape already reserves `assistantMessage` (always null in this
 * slice) so that Slice D can fill it in without changing the API contract.
 *
 * Message insert + conversation bump happen in one transaction so a message
 * can never exist without the conversation's `updatedAt` reflecting it.
 */
export async function postUserMessage(input: PostUserMessageInput) {
  return prisma.$transaction(async (transaction) => {
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

    return { userMessage, assistantMessage: null };
  });
}