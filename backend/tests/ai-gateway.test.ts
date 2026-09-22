import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { prisma } from "../src/db/prisma.js";
import { generateContent } from "../src/modules/ai/gateway/gemini.client.js";

const app = buildApp();

type MutableEnv = {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL: string;
  AI_MAX_TOOL_ITERATIONS: number;
};

const original = {
  GEMINI_API_KEY: env.GEMINI_API_KEY,
  GEMINI_MODEL: env.GEMINI_MODEL,
  AI_MAX_TOOL_ITERATIONS: env.AI_MAX_TOOL_ITERATIONS,
};

function setGeminiKey(key: string | undefined) {
  (env as MutableEnv).GEMINI_API_KEY = key;
}

function setMaxIterations(value: number) {
  (env as MutableEnv).AI_MAX_TOOL_ITERATIONS = value;
}

afterEach(() => {
  vi.unstubAllGlobals();
  const mutable = env as MutableEnv;
  mutable.GEMINI_API_KEY = original.GEMINI_API_KEY;
  mutable.GEMINI_MODEL = original.GEMINI_MODEL;
  mutable.AI_MAX_TOOL_ITERATIONS = original.AI_MAX_TOOL_ITERATIONS;
});

function geminiTextResponse(text: string) {
  return {
    ok: true,
    status: 200,
    text: async () => "",
    json: async () => ({
      candidates: [
        {
          content: { role: "model", parts: [{ text }] },
          finishReason: "STOP",
        },
      ],
    }),
  };
}

function geminiFunctionCallResponse(
  name: string,
  args: Record<string, unknown>,
  id = "call-1",
) {
  return {
    ok: true,
    status: 200,
    text: async () => "",
    json: async () => ({
      candidates: [
        {
          content: {
            role: "model",
            parts: [{ functionCall: { id, name, args } }],
          },
          finishReason: "STOP",
        },
      ],
    }),
  };
}

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
  return { Authorization: `Bearer ${res.body.data.accessToken}` };
}

async function createConversation(auth: { Authorization: string }) {
  const res = await request(app)
    .post("/api/v1/ai/conversations")
    .set(auth)
    .send({});
  expect(res.status).toBe(201);
  return res.body.data as { id: string };
}

function postMessage(
  auth: { Authorization: string },
  conversationId: string,
  content: string,
) {
  return request(app)
    .post(`/api/v1/ai/conversations/${conversationId}/messages`)
    .set(auth)
    .send({ content });
}

describe("gemini.client (Phase 11, Slice D)", () => {
  beforeEach(() => setGeminiKey(undefined));

  it("skips the call (and never touches fetch) when GEMINI_API_KEY is not configured", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await generateContent({
      systemInstruction: "test",
      contents: [{ role: "user", parts: [{ text: "hi" }] }],
      functionDeclarations: [],
    });

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts to the configured model with the API key header and parses the reply", async () => {
    setGeminiKey("fake-gemini-key");
    (env as MutableEnv).GEMINI_MODEL = "gemini-3.1-flash-lite";
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(geminiTextResponse("Hello there."));
    vi.stubGlobal("fetch", fetchSpy);

    const result = await generateContent({
      systemInstruction: "You are a test assistant.",
      contents: [{ role: "user", parts: [{ text: "hi" }] }],
      functionDeclarations: [],
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent",
    );
    expect(init.headers["x-goog-api-key"]).toBe("fake-gemini-key");
    const body = JSON.parse(init.body);
    expect(body.systemInstruction.parts[0].text).toBe(
      "You are a test assistant.",
    );
    expect(body.tools).toBeUndefined();

    expect(result?.content.parts[0].text).toBe("Hello there.");
  });

  it("includes functionDeclarations under tools when tools are passed", async () => {
    setGeminiKey("fake-gemini-key");
    const fetchSpy = vi.fn().mockResolvedValueOnce(geminiTextResponse("ok"));
    vi.stubGlobal("fetch", fetchSpy);

    await generateContent({
      systemInstruction: "test",
      contents: [],
      functionDeclarations: [
        {
          name: "get_jobs_at_risk",
          description: "desc",
          parametersJsonSchema: { type: "object", properties: {} },
        },
      ],
    });

    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.tools).toEqual([
      {
        functionDeclarations: [
          {
            name: "get_jobs_at_risk",
            description: "desc",
            parametersJsonSchema: { type: "object", properties: {} },
          },
        ],
      },
    ]);
  });

  it("throws on a non-2xx response", async () => {
    setGeminiKey("fake-gemini-key");
    const fetchSpy = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => "quota exceeded",
    });
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      generateContent({
        systemInstruction: "test",
        contents: [],
        functionDeclarations: [],
      }),
    ).rejects.toThrow(/Gemini API request failed \(429\)/);
  });

  it("throws when the response has no candidate content", async () => {
    setGeminiKey("fake-gemini-key");
    const fetchSpy = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => "",
      json: async () => ({ candidates: [] }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      generateContent({
        systemInstruction: "test",
        contents: [],
        functionDeclarations: [],
      }),
    ).rejects.toThrow(/no candidate content/);
  });
});

describe("AI gateway turn, end to end (Phase 11, Slice D)", () => {
  beforeEach(() => setGeminiKey(undefined));

  it("leaves assistantMessage null and never calls fetch when no key is configured", async () => {
    const owner = await registerOwner("no-key");
    const conversation = await createConversation(owner);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const res = await postMessage(
      owner,
      conversation.id,
      "Which jobs are at risk today?",
    );

    expect(res.status).toBe(201);
    expect(res.body.data.assistantMessage).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("answers directly when the model needs no tool call", async () => {
    setGeminiKey("fake-gemini-key");
    const owner = await registerOwner("direct");
    const conversation = await createConversation(owner);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          geminiTextResponse("Hi! How can I help with today's jobs?"),
        ),
    );

    const res = await postMessage(owner, conversation.id, "hello");

    expect(res.status).toBe(201);
    expect(res.body.data.assistantMessage.role).toBe("ASSISTANT");
    expect(res.body.data.assistantMessage.content).toBe(
      "Hi! How can I help with today's jobs?",
    );

    const toolMessageCount = await prisma.aiMessage.count({
      where: { conversationId: conversation.id, role: "TOOL" },
    });
    expect(toolMessageCount).toBe(0);
  });

  it("executes a tool call, echoes the functionCall id back, and returns the model's final answer", async () => {
    setGeminiKey("fake-gemini-key");
    const owner = await registerOwner("tool-call");
    const conversation = await createConversation(owner);

    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        geminiFunctionCallResponse("get_jobs_at_risk", {}, "call-abc-123"),
      )
      .mockResolvedValueOnce(geminiTextResponse("No jobs are at risk today."));
    vi.stubGlobal("fetch", fetchSpy);

    const res = await postMessage(
      owner,
      conversation.id,
      "Which jobs are at risk today?",
    );

    expect(res.status).toBe(201);
    expect(res.body.data.assistantMessage.content).toBe(
      "No jobs are at risk today.",
    );

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(fetchSpy.mock.calls[1][1].body);
    const lastTurn = secondBody.contents[secondBody.contents.length - 1];
    expect(lastTurn.role).toBe("user");
    expect(lastTurn.parts[0].functionResponse.id).toBe("call-abc-123");
    expect(lastTurn.parts[0].functionResponse.name).toBe("get_jobs_at_risk");
    expect(lastTurn.parts[0].functionResponse.response).toHaveProperty(
      "atRiskCount",
    );

    const toolMessage = await prisma.aiMessage.findFirst({
      where: { conversationId: conversation.id, role: "TOOL" },
    });
    expect(toolMessage).not.toBeNull();
    const toolContent = JSON.parse(toolMessage!.content);
    expect(toolContent.tool).toBe("get_jobs_at_risk");

    const detail = await request(app)
      .get(`/api/v1/ai/conversations/${conversation.id}`)
      .set(owner);
    // TOOL messages are never client-visible, even though they exist.
    expect(
      detail.body.data.messages.every(
        (m: { role: string }) => m.role !== "TOOL",
      ),
    ).toBe(true);
  });

  it("reports a tool error back to the model instead of crashing the turn", async () => {
    setGeminiKey("fake-gemini-key");
    const owner = await registerOwner("tool-error");
    const conversation = await createConversation(owner);

    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        geminiFunctionCallResponse("not_a_real_tool", {}, "call-1"),
      )
      .mockResolvedValueOnce(
        geminiTextResponse(
          "I don't have a tool for that, but I can check jobs at risk.",
        ),
      );
    vi.stubGlobal("fetch", fetchSpy);

    const res = await postMessage(
      owner,
      conversation.id,
      "do something unsupported",
    );

    expect(res.status).toBe(201);
    expect(res.body.data.assistantMessage.content).toBe(
      "I don't have a tool for that, but I can check jobs at risk.",
    );

    const secondBody = JSON.parse(fetchSpy.mock.calls[1][1].body);
    const lastTurn = secondBody.contents[secondBody.contents.length - 1];
    expect(lastTurn.parts[0].functionResponse.response.error).toBeDefined();
  });

  it("degrades gracefully when the tool-iteration cap is reached", async () => {
    setGeminiKey("fake-gemini-key");
    setMaxIterations(2);
    const owner = await registerOwner("iteration-cap");
    const conversation = await createConversation(owner);

    // The model asks for a tool call on every single turn, never finishing.
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(
        geminiFunctionCallResponse("get_jobs_at_risk", {}, "loop"),
      );
    vi.stubGlobal("fetch", fetchSpy);

    const res = await postMessage(owner, conversation.id, "keep looping");

    expect(res.status).toBe(201);
    expect(res.body.data.assistantMessage.content).toMatch(/couldn't finish/i);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const detail = await request(app)
      .get(`/api/v1/ai/conversations/${conversation.id}`)
      .set(owner);
    const assistant = detail.body.data.messages.find(
      (m: { role: string }) => m.role === "ASSISTANT",
    );
    expect(assistant.metadata.degraded).toBe(true);
  });

  it("keeps the user's message even when the Gemini call itself fails", async () => {
    setGeminiKey("fake-gemini-key");
    const owner = await registerOwner("gateway-error");
    const conversation = await createConversation(owner);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "internal error",
      }),
    );

    const res = await postMessage(owner, conversation.id, "hello");

    expect(res.status).toBe(201);
    expect(res.body.data.userMessage.content).toBe("hello");
    expect(res.body.data.assistantMessage).toBeNull();
  });
});