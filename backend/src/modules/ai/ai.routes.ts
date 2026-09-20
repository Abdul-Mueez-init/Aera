import { Router, type Response } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../common/auth/auth.middleware.js";
import { aiMessageRateLimiter } from "../../common/rateLimit.js";
import {
  createConversation,
  getConversation,
  listConversations,
  postUserMessage,
} from "./ai.service.js";

const router = Router();

// AI is an owner/dispatcher operations tool (PRD section 2 + design.md AI
// screens). Technicians are excluded until a technician-scoped tool set is
// designed in Slice C. Loosening this later is a one-line change; tightening
// it after release would be a breaking change, so we start strict.
// Applied at router level so no future AI endpoint can forget it.
router.use(requireAuth, requireRole("OWNER", "DISPATCHER"));

const MAX_TITLE_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 4000;

// PostgreSQL text columns cannot store the NUL character; without this check
// it would surface as an unhandled database error (HTTP 500).
function boundedText(maxLength: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(maxLength)
    .refine(
      (value) => !value.includes("\u0000"),
      "Text contains invalid characters",
    );
}

const createConversationSchema = z.object({
  title: boundedText(MAX_TITLE_LENGTH).optional(),
});

const listConversationsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const conversationParamsSchema = z.object({
  conversationId: z.string().uuid(),
});

const getConversationQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
});

// Note: `role` is intentionally NOT part of this schema. Clients can only
// ever create USER messages; unknown keys (e.g. a spoofed "role") are dropped.
const postMessageSchema = z.object({
  content: boundedText(MAX_MESSAGE_LENGTH),
});

function sendValidationError(response: Response, error: z.ZodError) {
  response.status(422).json({
    error: {
      code: "VALIDATION_FAILED",
      message: error.issues.map((issue) => issue.message).join(", "),
    },
  });
}

router.post("/conversations", async (request, response) => {
  // Express 5 leaves req.body undefined when no body is sent, and starting a
  // conversation without a title is a valid request.
  const parsed = createConversationSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    sendValidationError(response, parsed.error);
    return;
  }

  const conversation = await createConversation({
    companyId: request.auth!.companyId,
    userId: request.auth!.userId,
    title: parsed.data.title,
  });
  response.status(201).json({ data: conversation });
});

router.get("/conversations", async (request, response) => {
  const parsed = listConversationsSchema.safeParse(request.query);
  if (!parsed.success) {
    sendValidationError(response, parsed.error);
    return;
  }

  response.status(200).json({
    data: await listConversations({
      companyId: request.auth!.companyId,
      userId: request.auth!.userId,
      ...parsed.data,
    }),
  });
});

router.get("/conversations/:conversationId", async (request, response) => {
  const params = conversationParamsSchema.safeParse(request.params);
  if (!params.success) {
    sendValidationError(response, params.error);
    return;
  }
  const query = getConversationQuerySchema.safeParse(request.query);
  if (!query.success) {
    sendValidationError(response, query.error);
    return;
  }

  response.status(200).json({
    data: await getConversation({
      companyId: request.auth!.companyId,
      userId: request.auth!.userId,
      conversationId: params.data.conversationId,
      limit: query.data.limit,
    }),
  });
});

router.post(
  "/conversations/:conversationId/messages",
  aiMessageRateLimiter,
  async (request, response) => {
    const params = conversationParamsSchema.safeParse(request.params);
    if (!params.success) {
      sendValidationError(response, params.error);
      return;
    }
    const body = postMessageSchema.safeParse(request.body ?? {});
    if (!body.success) {
      sendValidationError(response, body.error);
      return;
    }

    const result = await postUserMessage({
      companyId: request.auth!.companyId,
      userId: request.auth!.userId,
      conversationId: params.data.conversationId,
      content: body.data.content,
    });
    response.status(201).json({ data: result });
  },
);

export { router as aiRouter };