import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { inProcessQueue } from "../src/queue/in-process-queue.adapter.js";
import type { EmailMessage } from "../src/modules/notifications/email.port.js";
import { resendEmailAdapter } from "../src/modules/notifications/resend-email.adapter.js";

const app = buildApp();

const OLD_PASSWORD = "correct-horse-battery-staple";
const NEW_PASSWORD = "a-much-better-password-2026";

let sent: EmailMessage[] = [];

beforeEach(() => {
  sent = [];
  vi.spyOn(resendEmailAdapter, "send").mockImplementation(
    async (message: EmailMessage) => {
      sent.push(message);
    },
  );
});

afterEach(async () => {
  // Let any fire-and-forget job (e.g. the "password changed" notice) finish
  // while the mock is still in place, so it cannot leak into the next test.
  await inProcessQueue.onIdle();
  vi.restoreAllMocks();
});

function unique(label: string) {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

async function registerUser() {
  const suffix = unique("reset");
  const email = `${suffix}@example.com`;
  const response = await request(app)
    .post("/api/v1/auth/register")
    .send({
      email,
      password: OLD_PASSWORD,
      firstName: "Rita",
      lastName: "Reset",
      companyName: `Reset Co ${suffix}`,
    });
  expect(response.status).toBe(201);
  return {
    email,
    userId: response.body.data.user.id as string,
    refreshToken: response.body.data.refreshToken as string,
    accessToken: response.body.data.accessToken as string,
  };
}

async function requestCode(email: string) {
  const response = await request(app)
    .post("/api/v1/auth/forgot-password")
    .send({ email });
  await inProcessQueue.onIdle();
  return response;
}

function codeFrom(message: EmailMessage): string {
  const match = message.text.match(/\b[A-Z2-9]{5}-[A-Z2-9]{5}\b/);
  expect(match).not.toBeNull();
  return match![0];
}

async function backdateCooldown(userId: string) {
  await prisma.passwordResetToken.updateMany({
    where: { userId },
    data: { createdAt: new Date(Date.now() - 5 * 60 * 1000) },
  });
}

describe("POST /auth/forgot-password", () => {
  it("answers identically for known and unknown emails, and only mails the real one", async () => {
    const user = await registerUser();

    const known = await requestCode(user.email);
    const unknown = await requestCode(`nobody-${unique("x")}@example.com`);

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual(known.body);

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(user.email);
    expect(sent[0].subject).toMatch(/reset code/i);
  });

  it("stores only a hash of the code", async () => {
    const user = await registerUser();
    await requestCode(user.email);
    const code = codeFrom(sent[0]);

    const rows = await prisma.passwordResetToken.findMany({
      where: { userId: user.userId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].codeHash).not.toContain(code.replace("-", ""));
    expect(rows[0].codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(rows[0].expiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + 31 * 60 * 1000,
    );
  });

  it("rejects a malformed email with 422", async () => {
    const response = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "not-an-email" });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("does not email twice inside the per-account cooldown", async () => {
    const user = await registerUser();
    await requestCode(user.email);
    await requestCode(user.email);
    expect(sent).toHaveLength(1);
  });

  it("invalidates the previous code when a new one is issued", async () => {
    const user = await registerUser();
    await requestCode(user.email);
    const firstCode = codeFrom(sent[0]);

    await backdateCooldown(user.userId);
    await requestCode(user.email);
    expect(sent).toHaveLength(2);
    const secondCode = codeFrom(sent[1]);
    expect(secondCode).not.toBe(firstCode);

    const stale = await request(app).post("/api/v1/auth/reset-password").send({
      email: user.email,
      code: firstCode,
      password: NEW_PASSWORD,
    });
    expect(stale.status).toBe(400);
    expect(stale.body.error.code).toBe("PASSWORD_RESET_INVALID_OR_EXPIRED");
  });

  it("never mails an invited person who has not accepted (no password yet)", async () => {
    const owner = await registerUser();
    const inviteeEmail = `${unique("invited")}@example.com`;
    const invite = await request(app)
      .post("/api/v1/companies/current/invitations")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({
        email: inviteeEmail,
        firstName: "Ivy",
        lastName: "Invitee",
        role: "TECHNICIAN",
      });
    expect(invite.status).toBe(201);

    await requestCode(inviteeEmail);
    expect(sent).toHaveLength(0);

    const attempt = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({
        email: inviteeEmail,
        code: "ABCDE-FGHJK",
        password: NEW_PASSWORD,
      });
    expect(attempt.status).toBe(400);
  });

  it("limits how many codes one address can request", async () => {
    const email = `${unique("flood")}@example.com`;
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await request(app)
        .post("/api/v1/auth/forgot-password")
        .send({ email });
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses[5]).toBe(429);
  });

  it("retries delivery after a provider failure instead of losing the code", async () => {
    const user = await registerUser();
    vi.mocked(resendEmailAdapter.send).mockReset();
    let calls = 0;
    vi.mocked(resendEmailAdapter.send).mockImplementation(
      async (message: EmailMessage) => {
        calls += 1;
        if (calls === 1) throw new Error("provider down");
        sent.push(message);
      },
    );

    await requestCode(user.email);
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(sent).toHaveLength(1);

    const reset = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({
        email: user.email,
        code: codeFrom(sent[0]),
        password: NEW_PASSWORD,
      });
    expect(reset.status).toBe(200);
  });
});

describe("POST /auth/reset-password", () => {
  it("resets the password, signs everyone out and makes the code single-use", async () => {
    const user = await registerUser();
    await requestCode(user.email);
    const code = codeFrom(sent[0]);

    const reset = await request(app).post("/api/v1/auth/reset-password").send({
      email: user.email,
      code,
      password: NEW_PASSWORD,
    });
    expect(reset.status).toBe(200);
    expect(reset.body.data.reset).toBe(true);

    const oldLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: OLD_PASSWORD });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: NEW_PASSWORD });
    expect(newLogin.status).toBe(200);

    // The session that existed before the reset is dead.
    const oldRefresh = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: user.refreshToken });
    expect(oldRefresh.status).toBe(401);

    // The code cannot be used a second time.
    const reuse = await request(app).post("/api/v1/auth/reset-password").send({
      email: user.email,
      code,
      password: "yet-another-password-2026",
    });
    expect(reuse.status).toBe(400);
    expect(reuse.body.error.code).toBe("PASSWORD_RESET_INVALID_OR_EXPIRED");

    // A "your password changed" notice goes out after the reset.
    await inProcessQueue.onIdle();
    expect(sent.some((message) => /was changed/i.test(message.subject))).toBe(
      true,
    );
  });

  it("accepts the code typed in lower case with spaces", async () => {
    const user = await registerUser();
    await requestCode(user.email);
    const typed = codeFrom(sent[0]).toLowerCase().replace("-", " ");

    const reset = await request(app).post("/api/v1/auth/reset-password").send({
      email: user.email,
      code: typed,
      password: NEW_PASSWORD,
    });
    expect(reset.status).toBe(200);
  });

  it("rejects a wrong code and leaves the password unchanged", async () => {
    const user = await registerUser();
    await requestCode(user.email);

    const wrong = await request(app).post("/api/v1/auth/reset-password").send({
      email: user.email,
      code: "AAAAA-AAAAA",
      password: NEW_PASSWORD,
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.code).toBe("PASSWORD_RESET_INVALID_OR_EXPIRED");

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: OLD_PASSWORD });
    expect(login.status).toBe(200);
  });

  it("locks the code after 5 wrong guesses, even for the right code", async () => {
    const user = await registerUser();
    await requestCode(user.email);
    const code = codeFrom(sent[0]);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const wrong = await request(app)
        .post("/api/v1/auth/reset-password")
        .send({
          email: user.email,
          code: `WRONG-${attempt}XXXX`,
          password: NEW_PASSWORD,
        });
      expect(wrong.status).toBe(400);
    }

    const right = await request(app).post("/api/v1/auth/reset-password").send({
      email: user.email,
      code,
      password: NEW_PASSWORD,
    });
    expect(right.status).toBe(400);
    expect(right.body.error.code).toBe("PASSWORD_RESET_INVALID_OR_EXPIRED");

    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: OLD_PASSWORD });
    expect(login.status).toBe(200);
  });

  it("cannot be beaten by guessing in parallel", async () => {
    const user = await registerUser();
    await requestCode(user.email);

    await Promise.all(
      Array.from({ length: 8 }, (_unused, index) =>
        request(app)
          .post("/api/v1/auth/reset-password")
          .send({
            email: user.email,
            code: `PARAL-LEL${index}X`,
            password: NEW_PASSWORD,
          }),
      ),
    );

    const row = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId: user.userId },
    });
    expect(row.failedAttempts).toBe(5);
  });

  it("rejects an expired code", async () => {
    const user = await registerUser();
    await requestCode(user.email);
    const code = codeFrom(sent[0]);

    await prisma.passwordResetToken.updateMany({
      where: { userId: user.userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ email: user.email, code, password: NEW_PASSWORD });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("PASSWORD_RESET_INVALID_OR_EXPIRED");
  });

  it("will not accept user A's code for user B", async () => {
    const userA = await registerUser();
    const userB = await registerUser();
    await requestCode(userA.email);
    const codeForA = codeFrom(sent[0]);
    await requestCode(userB.email);

    const response = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ email: userB.email, code: codeForA, password: NEW_PASSWORD });
    expect(response.status).toBe(400);

    const loginB = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: userB.email, password: OLD_PASSWORD });
    expect(loginB.status).toBe(200);
  });

  it("gives the same error for an unknown email as for a wrong code", async () => {
    const response = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({
        email: `ghost-${unique("x")}@example.com`,
        code: "ABCDE-FGHJK",
        password: NEW_PASSWORD,
      });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("PASSWORD_RESET_INVALID_OR_EXPIRED");
  });

  it("enforces the 12-character minimum without consuming the code", async () => {
    const user = await registerUser();
    await requestCode(user.email);
    const code = codeFrom(sent[0]);

    const tooShort = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ email: user.email, code, password: "short-pw-1" });
    expect(tooShort.status).toBe(422);
    expect(tooShort.body.error.code).toBe("VALIDATION_FAILED");

    const ok = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ email: user.email, code, password: NEW_PASSWORD });
    expect(ok.status).toBe(200);
  });

  it("revokes sessions in every company the user belongs to", async () => {
    const user = await registerUser();
    const otherOwner = await registerUser();

    // Put the user into a second company: an invitation to an email that
    // already has an account, accepted with that account's own password.
    const invite = await request(app)
      .post("/api/v1/companies/current/invitations")
      .set("Authorization", `Bearer ${otherOwner.accessToken}`)
      .send({
        email: user.email,
        firstName: "Rita",
        lastName: "Reset",
        role: "TECHNICIAN",
      });
    expect(invite.status).toBe(201);
    const join = await request(app)
      .post("/api/v1/auth/accept-invitation")
      .send({
        token: invite.body.data.invitationToken,
        password: OLD_PASSWORD,
      });
    expect(join.status).toBe(200);

    const companiesWithLiveSessions = await prisma.refreshSession.groupBy({
      by: ["companyId"],
      where: { userId: user.userId, revokedAt: null },
    });
    expect(companiesWithLiveSessions).toHaveLength(2);

    await requestCode(user.email);
    const reset = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({
        email: user.email,
        code: codeFrom(sent[0]),
        password: NEW_PASSWORD,
      });
    expect(reset.status).toBe(200);

    const live = await prisma.refreshSession.count({
      where: { userId: user.userId, revokedAt: null },
    });
    expect(live).toBe(0);
  });
});
