import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";

const app = buildApp();

async function registerOwner() {
  const owner = {
    email: `owner-invite-${Date.now()}-${Math.random()}@example.com`,
    password: "correct-horse-battery-staple",
    firstName: "Owner",
    lastName: "Test",
    companyName: `Invite Test Co ${Date.now()}`,
  };
  const response = await request(app).post("/api/v1/auth/register").send(owner);
  return response.body.data;
}

describe("Team invitations", () => {
  it("lets an invited member accept their invitation, set a password, and log in", async () => {
    const owner = await registerOwner();

    const invite = await request(app)
      .post("/api/v1/companies/current/invitations")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({
        email: `tech-${Date.now()}@example.com`,
        firstName: "Tina",
        lastName: "Tech",
        role: "TECHNICIAN",
      });

    expect(invite.status).toBe(201);
    expect(invite.body.data.status).toBe("INVITED");
    expect(invite.body.data.invitationToken).toBeTruthy();

    // Before accepting, the invited user cannot log in - no password set.
    const prematureLogin = await request(app).post("/api/v1/auth/login").send({
      email: invite.body.data.user.email,
      password: "whatever-password-123456",
    });
    expect(prematureLogin.status).toBe(401);

    const accept = await request(app)
      .post("/api/v1/auth/accept-invitation")
      .send({
        token: invite.body.data.invitationToken,
        password: "a-brand-new-password-123",
      });

    expect(accept.status).toBe(200);
    expect(accept.body.data.role).toBe("TECHNICIAN");
    expect(accept.body.data.accessToken).toBeTruthy();

    // The invitation token is single-use.
    const reuseAccept = await request(app)
      .post("/api/v1/auth/accept-invitation")
      .send({
        token: invite.body.data.invitationToken,
        password: "another-password-123456",
      });
    expect(reuseAccept.status).toBe(400);

    // Now the invited user can log in normally with the password they set.
    const login = await request(app).post("/api/v1/auth/login").send({
      email: invite.body.data.user.email,
      password: "a-brand-new-password-123",
    });
    expect(login.status).toBe(200);
    expect(login.body.data.role).toBe("TECHNICIAN");
  });

  it("rejects an invalid or already-used invitation token", async () => {
    const response = await request(app)
      .post("/api/v1/auth/accept-invitation")
      .send({ token: "not-a-real-token", password: "some-password-123456" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVITATION_INVALID_OR_EXPIRED");
  });

  it("prevents invitation races: exactly one concurrent request succeeds in accepting an invitation", async () => {
    const owner = await registerOwner();

    const invite = await request(app)
      .post("/api/v1/companies/current/invitations")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({
        email: `race-tech-${Date.now()}@example.com`,
        firstName: "Concurrent",
        lastName: "Tech",
        role: "TECHNICIAN",
      });

    expect(invite.status).toBe(201);
    const token = invite.body.data.invitationToken;

    // Fire 2 concurrent acceptance requests with different passwords
    const [res1, res2] = await Promise.all([
      request(app).post("/api/v1/auth/accept-invitation").send({
        token,
        password: "winning-password-111",
      }),
      request(app).post("/api/v1/auth/accept-invitation").send({
        token,
        password: "losing-password-222",
      }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 400]);

    const winner = res1.status === 200 ? res1 : res2;
    const loser = res1.status === 400 ? res1 : res2;

    expect(winner.body.data.accessToken).toBeTruthy();
    expect(loser.body.error.code).toBe("INVITATION_INVALID_OR_EXPIRED");

    // In the database: membership must be ACTIVE and invitationTokenHash null
    const membership = await prisma.companyMember.findUnique({
      where: {
        companyId_userId: {
          companyId: winner.body.data.company.id,
          userId: winner.body.data.user.id,
        },
      },
    });
    expect(membership?.status).toBe("ACTIVE");
    expect(membership?.invitationTokenHash).toBeNull();

    // Verify only the winning password works for login
    const winningPw =
      winner === res1 ? "winning-password-111" : "losing-password-222";
    const losingPw =
      winner === res1 ? "losing-password-222" : "winning-password-111";

    const winLogin = await request(app).post("/api/v1/auth/login").send({
      email: invite.body.data.user.email,
      password: winningPw,
    });
    expect(winLogin.status).toBe(200);

    const loseLogin = await request(app).post("/api/v1/auth/login").send({
      email: invite.body.data.user.email,
      password: losingPw,
    });
    expect(loseLogin.status).toBe(401);
  });
});

describe("Refresh token reuse detection", () => {
  it("revokes the whole session when a rotated (already-used) refresh token is replayed", async () => {
    const owner = await registerOwner();
    const originalRefreshToken = owner.refreshToken;

    // Legitimate rotation.
    const firstRotation = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: originalRefreshToken });
    expect(firstRotation.status).toBe(200);
    const newRefreshToken = firstRotation.body.data.refreshToken;

    // Replaying the now-revoked original token simulates a stolen token
    // being used after the legitimate client already rotated it.
    const replay = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: originalRefreshToken });
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe("AUTH_SESSION_REUSE_DETECTED");

    // The legitimate, newly-rotated token must ALSO be revoked now, since
    // we cannot tell which of the two holders (attacker or legitimate
    // user) is the real owner once reuse is detected.
    const legitimateFollowUp = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: newRefreshToken });
    expect(legitimateFollowUp.status).toBe(401);
  });

  it("prevents refresh rotation races: exactly one concurrent refresh request wins and creates at most one replacement session", async () => {
    const owner = await registerOwner();
    const originalRefreshToken = owner.refreshToken;

    // Fire 2 concurrent refresh requests using the exact same refresh token
    const [res1, res2] = await Promise.all([
      request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: originalRefreshToken }),
      request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: originalRefreshToken }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 401]);

    const winner = res1.status === 200 ? res1 : res2;
    const loser = res1.status === 401 ? res1 : res2;

    expect(winner.body.data.refreshToken).toBeTruthy();
    expect(winner.body.data.accessToken).toBeTruthy();
    expect([
      "AUTH_SESSION_ALREADY_CONSUMED",
      "AUTH_SESSION_REUSE_DETECTED",
    ]).toContain(loser.body.error.code);

    // Verify in database: exactly ONE replacement session was created
    const originalSession = await prisma.refreshSession.findFirstOrThrow({
      where: {
        userId: owner.user.id,
        replacedBySessionId: { not: null },
      },
    });
    expect(originalSession.revokedAt).not.toBeNull();

    // Total non-revoked sessions for this user/company should be exactly 1
    const activeSessions = await prisma.refreshSession.findMany({
      where: {
        userId: owner.user.id,
        companyId: owner.company.id,
        revokedAt: null,
      },
    });
    expect(activeSessions).toHaveLength(1);
    expect(activeSessions[0].id).toBe(originalSession.replacedBySessionId);

    // Verify winner's access token is valid
    const meRes = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${winner.body.data.accessToken}`);
    expect(meRes.status).toBe(200);

    // Verify winner's new refresh token can be rotated legitimately
    const nextRefresh = await request(app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: winner.body.data.refreshToken });
    expect(nextRefresh.status).toBe(200);
  });

  it("handles multiple simultaneous refresh requests: exactly one wins and produces at most one active replacement session", async () => {
    const owner = await registerOwner();
    const token = owner.refreshToken;

    const results = await Promise.all([
      request(app).post("/api/v1/auth/refresh").send({ refreshToken: token }),
      request(app).post("/api/v1/auth/refresh").send({ refreshToken: token }),
      request(app).post("/api/v1/auth/refresh").send({ refreshToken: token }),
      request(app).post("/api/v1/auth/refresh").send({ refreshToken: token }),
    ]);

    const successes = results.filter((r) => r.status === 200);
    const failures = results.filter((r) => r.status === 401);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(3);

    for (const failure of failures) {
      expect([
        "AUTH_SESSION_ALREADY_CONSUMED",
        "AUTH_SESSION_REUSE_DETECTED",
      ]).toContain(failure.body.error.code);
    }

    const activeSessions = await prisma.refreshSession.findMany({
      where: {
        userId: owner.user.id,
        companyId: owner.company.id,
        revokedAt: null,
      },
    });
    expect(activeSessions.length).toBeLessThanOrEqual(1);
  });
});
