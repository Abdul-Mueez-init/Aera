import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import {
  fcmPushAdapter,
  PushTokenInvalidError,
  resetFcmAccessTokenCache,
} from "../src/modules/notifications/fcm-push.adapter.js";
import { buildPushMessage } from "../src/modules/notifications/push-messages.js";

const app = buildApp();

type MutableEnv = {
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_PRIVATE_KEY?: string;
};

// A freshly generated RSA test key so `jose` can parse and sign with it —
// not connected to any real Firebase project or credential.
const TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCdFdQIq4OFSGhJ
63bpVMrCbf6/uCHNti8qQS+T/XyZ2hszTYJ4Qf1UOFANvtpLTRtj05f6Otdfl77G
Uw24xLuSt/emP1Lg7H5WFNuWeELv/aNgkAOUaaIdgNWfofSbFU3QDdFumjzQa8gh
8AL1i4jCfwlhZblXdUJ0MvOZ8CUQJ2LejtB1p/5kQAYvDFGoQfWrkCIo3pIdtKaW
Ib1T5tZ7CEXTbX3V+fww8tXn51GMC1CnMrN9bfT4QJpWFtgH1yujJF8QecXnCzo/
T7Y39tSNjYFzX1bm7sXzYt4g9kzM6ecdlABubAGE7ttAk54R1SnExaAtSE8nrvIT
lt3jZvjpAgMBAAECggEAByDTuk79t5o8m4E6RKnHMlbueGxksE05Z7DayyLncdwS
Q1v/WH/L4J5yrN3lGMysyJGe5br1t1wrvMaGY5o6R7FQAa3IuqAX0uKD+YpOT7/D
7Ms6bz8PObqDU5cQyViWpDFe/4oIyhvDxFYKQo8B6AEbOJahTYijnKG2msBpZF8H
WkxKrdcQ3cCIyINww5uDqyx+rkADxDZyyD3opKO8E/qHqnB6IMh7Px2sNk/HFxtZ
wSqnheaKR05RFbcuOK7e1XsoYksFc03SCD29ZAMWNZw0PGdQpnkMWwnA2VIi9jlW
e8d5t0oZsMuMnBENezmn+LxKlyWbWXkbugFPupHTfwKBgQDaxIy+cEmLHwhRuWl4
db7/9knToEQ5skpvjDFMKmWsu4+auJdy0hF86o2d2Hd6fdAaup1I+IE2NeqrUxEw
2w63x2gMSA964XhXwW5Ke5nnUHd3IvFojUKi0vR0ebCV+tVnGBZCJxjzqpqgEWbd
qbRijwLkEUsMptLuXlCluqgVLwKBgQC30dhwGJsoaPMjbZjUX2Xfx467hkV/MGXA
6iKPhUg7AM6c0Wp295Mo4SvO53jmvyH8i4BxnvfpI3hHn+VpXIV3PONmwgUX7vRG
iVH7+LF/HVMrx+VVxpOQ+RBUxvTGEaddcyqpRWwsHoq5TowCqQ878yxtsx27U1ER
QY8fyNn9ZwKBgFikiY7kurf3ZAyRP05DD5hxeCqa5uol9wlJ2fPNvhMGkMKVhzBM
NC/UbnuF6aulbPxXn0GhB+IqaKLw7qdIK6eF0gAf9r3IvFV6mDDv8kWLEk0gyIaf
rl+BcPH9GPM8htnWJba6Vt7swuiXBIJOsDu7TOWSqEFBG3jgmHb+sfqbAoGAOua6
+/Bmh2RZxJhxyFtpQXOogN5dlovjjxV3TZXft0hi7E0OWGCsfwToDLyPOSE1ur7Y
wY+20LXU7N6HnGNRQQv5sguppimjjJaj9qGR/rFe3UCIdBvVXTbxzLiT5oPxpTgq
C2N7bge7W/WXV6Lkhsk9C0nB1Sy1ZVokioLJlzECgYEAx+d+CLABg/G94GI3hbSx
z83+J4DYHtZi/jiLQneCmY3J1G7YpxuQTftuy27q5gw5IHfx3IP4b/g3yCdPkhCQ
d/DR87jBkBBZuBIwp9Tf+yYELrKtMS6lw8OJ8j+8d92WvPS5rnxhOvIZ8co4+ewE
wBFY1ysR0vDRehJ8sofs5lw=
-----END PRIVATE KEY-----`;

describe("fcmPushAdapter", () => {
  const original = {
    FIREBASE_PROJECT_ID: env.FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL: env.FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY: env.FIREBASE_PRIVATE_KEY,
  };

  beforeEach(() => {
    resetFcmAccessTokenCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    const mutable = env as MutableEnv;
    mutable.FIREBASE_PROJECT_ID = original.FIREBASE_PROJECT_ID;
    mutable.FIREBASE_CLIENT_EMAIL = original.FIREBASE_CLIENT_EMAIL;
    mutable.FIREBASE_PRIVATE_KEY = original.FIREBASE_PRIVATE_KEY;
  });

  it("skips sending (and never calls fetch) when Firebase credentials are not configured", async () => {
    const mutable = env as MutableEnv;
    mutable.FIREBASE_PROJECT_ID = undefined;
    mutable.FIREBASE_CLIENT_EMAIL = undefined;
    mutable.FIREBASE_PRIVATE_KEY = undefined;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      fcmPushAdapter.send({ token: "device-token", title: "Hi", body: "Hi" }),
    ).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("exchanges for an access token then posts to the FCM v1 send endpoint", async () => {
    const mutable = env as MutableEnv;
    mutable.FIREBASE_PROJECT_ID = "aera-test-project";
    mutable.FIREBASE_CLIENT_EMAIL =
      "fcm@aera-test-project.iam.gserviceaccount.com";
    mutable.FIREBASE_PRIVATE_KEY = TEST_PRIVATE_KEY;

    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "fake-access-token",
          expires_in: 3600,
        }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => "" });
    vi.stubGlobal("fetch", fetchSpy);

    await fcmPushAdapter.send({
      token: "device-token",
      title: "Job #4 assigned",
      body: "AC repair for Bilal Ahmed",
      data: { jobId: "job-1" },
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const [tokenUrl, tokenInit] = fetchSpy.mock.calls[0];
    expect(tokenUrl).toBe("https://oauth2.googleapis.com/token");
    expect(tokenInit.method).toBe("POST");

    const [sendUrl, sendInit] = fetchSpy.mock.calls[1];
    expect(sendUrl).toBe(
      "https://fcm.googleapis.com/v1/projects/aera-test-project/messages:send",
    );
    expect(sendInit.headers.Authorization).toBe("Bearer fake-access-token");
    expect(JSON.parse(sendInit.body)).toMatchObject({
      message: {
        token: "device-token",
        notification: {
          title: "Job #4 assigned",
          body: "AC repair for Bilal Ahmed",
        },
        data: { jobId: "job-1" },
      },
    });
  });

  it("throws PushTokenInvalidError when FCM reports the token as unregistered", async () => {
    const mutable = env as MutableEnv;
    mutable.FIREBASE_PROJECT_ID = "aera-test-project";
    mutable.FIREBASE_CLIENT_EMAIL =
      "fcm@aera-test-project.iam.gserviceaccount.com";
    mutable.FIREBASE_PRIVATE_KEY = TEST_PRIVATE_KEY;

    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "fake-access-token",
          expires_in: 3600,
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () =>
          JSON.stringify({
            error: { status: "UNREGISTERED", message: "gone" },
          }),
      });
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      fcmPushAdapter.send({ token: "stale-token", title: "Hi", body: "Hi" }),
    ).rejects.toBeInstanceOf(PushTokenInvalidError);
  });

  it("throws a generic error on other non-2xx responses so the queue retries", async () => {
    const mutable = env as MutableEnv;
    mutable.FIREBASE_PROJECT_ID = "aera-test-project";
    mutable.FIREBASE_CLIENT_EMAIL =
      "fcm@aera-test-project.iam.gserviceaccount.com";
    mutable.FIREBASE_PRIVATE_KEY = TEST_PRIVATE_KEY;

    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "fake-access-token",
          expires_in: 3600,
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "internal error",
      });
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      fcmPushAdapter.send({ token: "device-token", title: "Hi", body: "Hi" }),
    ).rejects.toThrow(/500/);
  });
});

describe("buildPushMessage", () => {
  it("returns null when the referenced record does not exist for the company", async () => {
    const message = await buildPushMessage({
      type: "JOB_ASSIGNED",
      companyId: "00000000-0000-0000-0000-000000000000",
      jobId: "00000000-0000-0000-0000-000000000000",
    });
    expect(message).toBeNull();
  });

  it("builds a QUOTE_SENT push referencing the real quote total and customer", async () => {
    const suffix = `push-tpl-${Date.now()}`;
    const owner = await request(app)
      .post("/api/v1/auth/register")
      .send({
        email: `owner-${suffix}@example.com`,
        password: "correct-horse-battery-staple",
        firstName: "Owner",
        lastName: "Push",
        companyName: `Company ${suffix}`,
      });
    expect(owner.status).toBe(201);
    const ownerAuth = {
      Authorization: `Bearer ${owner.body.data.accessToken}`,
    };

    const me = await request(app).get("/api/v1/auth/me").set(ownerAuth);
    const companyId = me.body.data.company.id as string;

    const customer = await request(app)
      .post("/api/v1/customers")
      .set(ownerAuth)
      .send({ firstName: "Bilal", lastName: "Ahmed" });
    expect(customer.status).toBe(201);

    const quote = await request(app)
      .post("/api/v1/quotes")
      .set(ownerAuth)
      .send({
        customerId: customer.body.data.id,
        currency: "USD",
        items: [
          {
            description: "Compressor replacement",
            quantity: 1,
            unitPriceMinor: 50000,
          },
        ],
      });
    expect(quote.status).toBe(201);

    const message = await buildPushMessage({
      type: "QUOTE_SENT",
      companyId,
      quoteId: quote.body.data.id,
    });

    expect(message).not.toBeNull();
    expect(message!.title).toBe("Quote sent");
    expect(message!.body).toContain("500.00 USD");
    expect(message!.body).toContain("Bilal Ahmed");
    expect(message!.data).toMatchObject({ quoteId: quote.body.data.id });
  });
});

describe("device token routes", () => {
  it("rejects registration without auth", async () => {
    const response = await request(app)
      .post("/api/v1/notifications/device-tokens")
      .send({ token: "abc", platform: "ANDROID" });
    expect(response.status).toBe(401);
  });

  it("registers a device token, then allows the same user to remove it", async () => {
    const suffix = `push-device-${Date.now()}`;
    const owner = await request(app)
      .post("/api/v1/auth/register")
      .send({
        email: `owner-${suffix}@example.com`,
        password: "correct-horse-battery-staple",
        firstName: "Owner",
        lastName: "Device",
        companyName: `Company ${suffix}`,
      });
    expect(owner.status).toBe(201);
    const auth = { Authorization: `Bearer ${owner.body.data.accessToken}` };

    const register = await request(app)
      .post("/api/v1/notifications/device-tokens")
      .set(auth)
      .send({ token: `fcm-token-${suffix}`, platform: "ANDROID" });
    expect(register.status).toBe(201);
    expect(register.body.data.platform).toBe("ANDROID");

    // Re-registering the same token is idempotent (upsert), not a conflict.
    const reRegister = await request(app)
      .post("/api/v1/notifications/device-tokens")
      .set(auth)
      .send({ token: `fcm-token-${suffix}`, platform: "IOS" });
    expect(reRegister.status).toBe(201);
    expect(reRegister.body.data.platform).toBe("IOS");

    const remove = await request(app)
      .delete("/api/v1/notifications/device-tokens")
      .set(auth)
      .send({ token: `fcm-token-${suffix}` });
    expect(remove.status).toBe(204);

    const removeAgain = await request(app)
      .delete("/api/v1/notifications/device-tokens")
      .set(auth)
      .send({ token: `fcm-token-${suffix}` });
    expect(removeAgain.status).toBe(404);
  });

  it("rejects an invalid platform value", async () => {
    const suffix = `push-device-bad-${Date.now()}`;
    const owner = await request(app)
      .post("/api/v1/auth/register")
      .send({
        email: `owner-${suffix}@example.com`,
        password: "correct-horse-battery-staple",
        firstName: "Owner",
        lastName: "Device",
        companyName: `Company ${suffix}`,
      });
    const auth = { Authorization: `Bearer ${owner.body.data.accessToken}` };

    const response = await request(app)
      .post("/api/v1/notifications/device-tokens")
      .set(auth)
      .send({ token: "abc", platform: "DESKTOP" });
    expect(response.status).toBe(422);
  });
});
