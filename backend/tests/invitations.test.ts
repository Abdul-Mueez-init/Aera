import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

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
});
