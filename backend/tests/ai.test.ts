import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { prisma } from "../src/db/prisma.js";

const app = buildApp();
const originalGeminiKey = env.GEMINI_API_KEY;

beforeEach(() => {
  (env as { GEMINI_API_KEY?: string }).GEMINI_API_KEY = undefined;
});

afterEach(() => {
  (env as { GEMINI_API_KEY?: string }).GEMINI_API_KEY = originalGeminiKey;
});

type Auth = { Authorization: string };

async function registerOwner(label: string) {
  const suffix = `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({
      email: `owner-${suffix}@example.com`,
      password: "correct-horse-battery-staple",
      firstName: "Owner",
      lastName: label,
      companyName: `Company ${suffix}`,
    });
  expect(res.status).toBe(201);
  return { Authorization: `Bearer ${res.body.data.accessToken}` } as Auth;
}

async function inviteAndAccept(
  ownerAuth: Auth,
  role: "DISPATCHER" | "TECHNICIAN",
) {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const invite = await request(app)
    .post("/api/v1/companies/current/invitations")
    .set(ownerAuth)
    .send({
      email: `${role.toLowerCase()}-${suffix}@example.com`,
      firstName: "Team",
      lastName: "Member",
      role,
    });
  expect(invite.status).toBe(201);

  const accept = await request(app)
    .post("/api/v1/auth/accept-invitation")
    .send({
      token: invite.body.data.invitationToken,
      password: "a-brand-new-password-123",
    });
  expect(accept.status).toBe(200);
  return { Authorization: `Bearer ${accept.body.data.accessToken}` } as Auth;
}

async function createConversation(auth: Auth, title?: string) {
  const res = await request(app)
    .post("/api/v1/ai/conversations")
    .set(auth)
    .send(title === undefined ? {} : { title });
  expect(res.status).toBe(201);
  return res.body.data as { id: string; title: string | null };
}

function postMessage(auth: Auth, conversationId: string, content: unknown) {
  return request(app)
    .post(`/api/v1/ai/conversations/${conversationId}/messages`)
    .set(auth)
    .send({ content });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("AI conversations (Phase 11, Slice B)", () => {
  it("requires authentication on every endpoint", async () => {
    const id = randomUUID();
    const responses = await Promise.all([
      request(app).post("/api/v1/ai/conversations").send({}),
      request(app).get("/api/v1/ai/conversations"),
      request(app).get(`/api/v1/ai/conversations/${id}`),
      request(app)
        .post(`/api/v1/ai/conversations/${id}/messages`)
        .send({ content: "hello" }),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("AUTH_SESSION_EXPIRED");
    }
  });

  it("forbids technicians on every endpoint", async () => {
    const owner = await registerOwner("tech-block");
    const technician = await inviteAndAccept(owner, "TECHNICIAN");
    const id = randomUUID();

    const responses = await Promise.all([
      request(app).post("/api/v1/ai/conversations").set(technician).send({}),
      request(app).get("/api/v1/ai/conversations").set(technician),
      request(app).get(`/api/v1/ai/conversations/${id}`).set(technician),
      postMessage(technician, id, "hello"),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("AUTH_FORBIDDEN");
    }
  });

  it("creates a conversation with a title, and without any body", async () => {
    const owner = await registerOwner("create");

    const titled = await createConversation(owner, "  Today's risks  ");
    expect(titled.title).toBe("Today's risks");

    // No body at all (Express 5 leaves req.body undefined) must still work.
    const bare = await request(app).post("/api/v1/ai/conversations").set(owner);
    expect(bare.status).toBe(201);
    expect(bare.body.data.title).toBeNull();
    expect(bare.body.data.id).toEqual(expect.any(String));
  });

  it("rejects invalid conversation titles", async () => {
    const owner = await registerOwner("create-invalid");

    for (const title of ["", "   ", "x".repeat(121), "bad\u0000title", 42]) {
      const res = await request(app)
        .post("/api/v1/ai/conversations")
        .set(owner)
        .send({ title });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    }
  });

  it("stores a user message, ignores a spoofed role, and derives the title", async () => {
    const owner = await registerOwner("post");
    const conversation = await createConversation(owner);

    const res = await request(app)
      .post(`/api/v1/ai/conversations/${conversation.id}/messages`)
      .set(owner)
      .send({
        content: "  Which jobs are at risk today?  ",
        role: "ASSISTANT",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.userMessage.role).toBe("USER");
    expect(res.body.data.userMessage.content).toBe(
      "Which jobs are at risk today?",
    );
    // Reserved for Slice D; must exist now so the contract never changes.
    expect(res.body.data.assistantMessage).toBeNull();

    const detail = await request(app)
      .get(`/api/v1/ai/conversations/${conversation.id}`)
      .set(owner);
    expect(detail.status).toBe(200);
    expect(detail.body.data.conversation.title).toBe(
      "Which jobs are at risk today?",
    );
    expect(detail.body.data.messages).toHaveLength(1);
    expect(detail.body.data.messages[0].role).toBe("USER");
    expect(detail.body.data.meta).toEqual({ messageCount: 1, hasMore: false });
  });

  it("truncates long derived titles and keeps an existing title", async () => {
    const owner = await registerOwner("title");

    const untitled = await createConversation(owner);
    await postMessage(owner, untitled.id, "word ".repeat(100));
    const untitledDetail = await request(app)
      .get(`/api/v1/ai/conversations/${untitled.id}`)
      .set(owner);
    const derived = untitledDetail.body.data.conversation.title as string;
    expect(Array.from(derived).length).toBeLessThanOrEqual(60);
    expect(derived.endsWith("…")).toBe(true);

    const titled = await createConversation(owner, "My chosen title");
    await postMessage(owner, titled.id, "First question");
    const titledDetail = await request(app)
      .get(`/api/v1/ai/conversations/${titled.id}`)
      .set(owner);
    expect(titledDetail.body.data.conversation.title).toBe("My chosen title");
  });

  it("lists conversations by latest activity and paginates", async () => {
    const owner = await registerOwner("list");
    const first = await createConversation(owner, "First");
    await sleep(15);
    const second = await createConversation(owner, "Second");
    await sleep(15);

    let list = await request(app).get("/api/v1/ai/conversations").set(owner);
    expect(list.status).toBe(200);
    expect(list.body.data.items.map((item: { id: string }) => item.id)).toEqual(
      [second.id, first.id],
    );

    // Posting to the older conversation moves it to the top.
    const post = await postMessage(owner, first.id, "bump");
    expect(post.status).toBe(201);
    list = await request(app).get("/api/v1/ai/conversations").set(owner);
    expect(list.body.data.items.map((item: { id: string }) => item.id)).toEqual(
      [first.id, second.id],
    );

    const paged = await request(app)
      .get("/api/v1/ai/conversations?page=2&pageSize=1")
      .set(owner);
    expect(paged.status).toBe(200);
    expect(paged.body.data.items).toHaveLength(1);
    expect(paged.body.data.items[0].id).toBe(second.id);
    expect(paged.body.data.meta).toEqual({
      page: 2,
      pageSize: 1,
      total: 2,
      pageCount: 2,
    });

    for (const query of ["page=0", "pageSize=101", "pageSize=abc"]) {
      const bad = await request(app)
        .get(`/api/v1/ai/conversations?${query}`)
        .set(owner);
      expect(bad.status).toBe(422);
      expect(bad.body.error.code).toBe("VALIDATION_FAILED");
    }
  });

  it("returns messages oldest-first, hides TOOL messages, and bounds the result", async () => {
    const owner = await registerOwner("read");
    const conversation = await createConversation(owner);
    const row = await prisma.aiConversation.findFirstOrThrow({
      where: { id: conversation.id },
      select: { companyId: true },
    });

    // Seed the roles that only the server will ever write (Slices C/D), with
    // explicit timestamps so ordering is deterministic.
    const base = Date.now() - 60_000;
    const seed = [
      { role: "USER", content: "m1", offset: 0 },
      { role: "TOOL", content: "internal tool result", offset: 1_000 },
      { role: "ASSISTANT", content: "m2", offset: 2_000 },
      { role: "USER", content: "m3", offset: 3_000 },
    ] as const;
    for (const message of seed) {
      await prisma.aiMessage.create({
        data: {
          companyId: row.companyId,
          conversationId: conversation.id,
          role: message.role,
          content: message.content,
          createdAt: new Date(base + message.offset),
        },
      });
    }

    const all = await request(app)
      .get(`/api/v1/ai/conversations/${conversation.id}`)
      .set(owner);
    expect(all.status).toBe(200);
    expect(
      all.body.data.messages.map((m: { content: string }) => m.content),
    ).toEqual(["m1", "m2", "m3"]);
    expect(all.body.data.messages.map((m: { role: string }) => m.role)).toEqual(
      ["USER", "ASSISTANT", "USER"],
    );
    expect(all.body.data.meta).toEqual({ messageCount: 3, hasMore: false });

    // limit=2 returns the NEWEST two, still in chronological order.
    const limited = await request(app)
      .get(`/api/v1/ai/conversations/${conversation.id}?limit=2`)
      .set(owner);
    expect(limited.status).toBe(200);
    expect(
      limited.body.data.messages.map((m: { content: string }) => m.content),
    ).toEqual(["m2", "m3"]);
    expect(limited.body.data.meta).toEqual({ messageCount: 3, hasMore: true });

    for (const query of ["limit=0", "limit=101", "limit=abc"]) {
      const bad = await request(app)
        .get(`/api/v1/ai/conversations/${conversation.id}?${query}`)
        .set(owner);
      expect(bad.status).toBe(422);
    }
  });

  it("isolates conversations per user and per company", async () => {
    const ownerA = await registerOwner("iso-a");
    const dispatcherA = await inviteAndAccept(ownerA, "DISPATCHER");
    const ownerB = await registerOwner("iso-b");

    const conversation = await createConversation(ownerA, "Private");
    const ownMessage = await postMessage(ownerA, conversation.id, "mine");
    expect(ownMessage.status).toBe(201);

    // Same company, different user, and a completely different company:
    // every access is a plain 404 so IDs cannot be probed.
    for (const outsider of [dispatcherA, ownerB]) {
      const read = await request(app)
        .get(`/api/v1/ai/conversations/${conversation.id}`)
        .set(outsider);
      expect(read.status).toBe(404);
      expect(read.body.error.code).toBe("RESOURCE_NOT_FOUND");

      const write = await postMessage(outsider, conversation.id, "intruder");
      expect(write.status).toBe(404);
      expect(write.body.error.code).toBe("RESOURCE_NOT_FOUND");

      const list = await request(app)
        .get("/api/v1/ai/conversations")
        .set(outsider);
      expect(list.status).toBe(200);
      expect(list.body.data.items).toHaveLength(0);
    }

    // The failed cross-tenant writes must not have persisted anything.
    const detail = await request(app)
      .get(`/api/v1/ai/conversations/${conversation.id}`)
      .set(ownerA);
    expect(detail.body.data.meta.messageCount).toBe(1);
    expect(detail.body.data.messages[0].content).toBe("mine");
  });

  it("returns 404 for an unknown id and 422 for a malformed id", async () => {
    const owner = await registerOwner("ids");

    const unknown = await request(app)
      .get(`/api/v1/ai/conversations/${randomUUID()}`)
      .set(owner);
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe("RESOURCE_NOT_FOUND");

    const unknownPost = await postMessage(owner, randomUUID(), "hello");
    expect(unknownPost.status).toBe(404);

    const malformed = await request(app)
      .get("/api/v1/ai/conversations/not-a-uuid")
      .set(owner);
    expect(malformed.status).toBe(422);
    expect(malformed.body.error.code).toBe("VALIDATION_FAILED");

    const malformedPost = await postMessage(owner, "not-a-uuid", "hello");
    expect(malformedPost.status).toBe(422);
  });

  it("validates message content", async () => {
    const owner = await registerOwner("validate");
    const conversation = await createConversation(owner);

    for (const content of [
      "",
      "   ",
      "x".repeat(4001),
      "bad\u0000text",
      42,
      null,
    ]) {
      const res = await postMessage(owner, conversation.id, content);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    }

    const missingBody = await request(app)
      .post(`/api/v1/ai/conversations/${conversation.id}/messages`)
      .set(owner);
    expect(missingBody.status).toBe(422);

    const maxLength = await postMessage(
      owner,
      conversation.id,
      "x".repeat(4000),
    );
    expect(maxLength.status).toBe(201);

    // Nothing invalid was persisted.
    const detail = await request(app)
      .get(`/api/v1/ai/conversations/${conversation.id}`)
      .set(owner);
    expect(detail.body.data.meta.messageCount).toBe(1);
  });

  it("rate limits AI messages per user", async () => {
    const owner = await registerOwner("rate");
    const other = await registerOwner("rate-other");
    const conversation = await createConversation(owner);
    const otherConversation = await createConversation(other);

    for (let index = 0; index < 30; index += 1) {
      const res = await postMessage(owner, conversation.id, `message ${index}`);
      expect(res.status).toBe(201);
    }

    const limited = await postMessage(owner, conversation.id, "one too many");
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("RATE_LIMITED");

    // The limit is per user, not shared across the whole API.
    const unaffected = await postMessage(other, otherConversation.id, "hello");
    expect(unaffected.status).toBe(201);
  });
});
