import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { createAccessToken } from "../src/common/auth/tokens.js";

const app = buildApp();

function uniqueSuffix(label: string) {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function registerOwner(label: string) {
  const suffix = uniqueSuffix(label);
  const email = `owner-${suffix}@example.com`;
  const res = await request(app)
    .post("/api/v1/auth/register")
    .send({
      email,
      password: "correct-horse-battery-staple",
      firstName: "Owner",
      lastName: label,
      companyName: `Company ${suffix}`,
    });

  expect(res.status).toBe(201);
  return {
    ...res.body.data,
    email,
  };
}

async function inviteAndAccept(
  ownerAccessToken: string,
  role: "OWNER" | "DISPATCHER" | "TECHNICIAN",
  label: string,
) {
  const suffix = uniqueSuffix(label);
  const email = `${role.toLowerCase()}-${suffix}@example.com`;
  const inviteRes = await request(app)
    .post("/api/v1/companies/current/invitations")
    .set("Authorization", `Bearer ${ownerAccessToken}`)
    .send({
      email,
      firstName: label,
      lastName: "User",
      role,
    });

  expect(inviteRes.status).toBe(201);
  const invitationToken = inviteRes.body.data.invitationToken;
  const memberId = inviteRes.body.data.id;

  const acceptRes = await request(app)
    .post("/api/v1/auth/accept-invitation")
    .send({
      token: invitationToken,
      password: "correct-horse-battery-staple",
    });

  expect(acceptRes.status).toBe(200);

  return {
    ...acceptRes.body.data,
    memberId,
    email,
  };
}

describe("Phase B1: Access-token freshness and membership authorization", () => {
  it("rejects an access token after logout has revoked the session", async () => {
    const owner = await registerOwner("logout-test");

    // Token works initially
    const beforeLogout = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(beforeLogout.status).toBe(200);
    expect(beforeLogout.body.data.user.id).toBe(owner.user.id);

    // Logout using Bearer token and refresh token
    const logoutRes = await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ refreshToken: owner.refreshToken });
    expect(logoutRes.status).toBe(204);

    // Subsequent call with the same access token must be rejected
    const afterLogout = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(afterLogout.status).toBe(401);
    expect(afterLogout.body.error.code).toBe("AUTH_SESSION_EXPIRED");
  });

  it("immediately rejects an access token when the member is suspended", async () => {
    const owner = await registerOwner("suspend-test");
    const tech = await inviteAndAccept(owner.accessToken, "TECHNICIAN", "Bob");

    // Technician's token works initially
    const beforeSuspend = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${tech.accessToken}`);
    expect(beforeSuspend.status).toBe(200);

    // Owner suspends the technician
    const suspendRes = await request(app)
      .patch(`/api/v1/companies/current/members/${tech.memberId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ status: "SUSPENDED" });
    expect(suspendRes.status).toBe(200);
    expect(suspendRes.body.data.status).toBe("SUSPENDED");

    // Technician's existing access token is immediately rejected with 403
    const afterSuspend = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${tech.accessToken}`);
    expect(afterSuspend.status).toBe(403);
    expect(afterSuspend.body.error.code).toBe("AUTH_MEMBERSHIP_SUSPENDED");

    // Owner cannot suspend themselves
    const ownerMembers = await request(app)
      .get("/api/v1/companies/current/members")
      .set("Authorization", `Bearer ${owner.accessToken}`);
    const ownerMemberId = ownerMembers.body.data.find(
      (m: { user: { id: string } }) => m.user.id === owner.user.id,
    ).id;

    const selfSuspendRes = await request(app)
      .patch(`/api/v1/companies/current/members/${ownerMemberId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ status: "SUSPENDED" });
    expect(selfSuspendRes.status).toBe(422);
    expect(selfSuspendRes.body.error.code).toBe("CANNOT_SUSPEND_SELF");
  });

  it("immediately rejects an access token when the member is removed from the company", async () => {
    const owner = await registerOwner("remove-test");
    const tech = await inviteAndAccept(
      owner.accessToken,
      "TECHNICIAN",
      "Charlie",
    );

    // Token works initially
    const beforeRemove = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${tech.accessToken}`);
    expect(beforeRemove.status).toBe(200);

    // Owner removes technician from the company
    const removeRes = await request(app)
      .delete(`/api/v1/companies/current/members/${tech.memberId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(removeRes.status).toBe(200);

    // Technician's access token is immediately rejected
    const afterRemove = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${tech.accessToken}`);
    expect(afterRemove.status).toBe(403);
    expect(afterRemove.body.error.code).toBe("AUTH_NO_ACTIVE_MEMBERSHIP");
  });

  it("immediately rejects an access token when the user account is deactivated", async () => {
    const owner = await registerOwner("deactivate-test");

    const beforeDeactivate = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(beforeDeactivate.status).toBe(200);

    // Deactivate user in database
    await prisma.user.update({
      where: { id: owner.user.id },
      data: { isActive: false },
    });

    const afterDeactivate = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(afterDeactivate.status).toBe(403);
    expect(afterDeactivate.body.error.code).toBe("AUTH_USER_INACTIVE");
  });

  it("authoritatively enforces role downgrades without waiting for access token expiration", async () => {
    const owner = await registerOwner("downgrade-test");
    // Invite a second user as OWNER
    const coOwner = await inviteAndAccept(
      owner.accessToken,
      "OWNER",
      "CoOwner",
    );

    // Co-owner can invite members because they are currently an OWNER
    const inviteAsOwner = await request(app)
      .post("/api/v1/companies/current/invitations")
      .set("Authorization", `Bearer ${coOwner.accessToken}`)
      .send({
        email: `sub-${uniqueSuffix("sub")}@example.com`,
        firstName: "Sub",
        lastName: "Tech",
        role: "TECHNICIAN",
      });
    expect(inviteAsOwner.status).toBe(201);

    // Primary owner demotes co-owner to TECHNICIAN
    const demoteRes = await request(app)
      .patch(`/api/v1/companies/current/members/${coOwner.memberId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ role: "TECHNICIAN" });
    expect(demoteRes.status).toBe(200);
    expect(demoteRes.body.data.role).toBe("TECHNICIAN");

    // Co-owner tries to invite another member using the OLD token (which still had role: OWNER in JWT payload)
    // requireAuth dynamically loads the authoritative role TECHNICIAN, and requireRole("OWNER") rejects
    const inviteAfterDemote = await request(app)
      .post("/api/v1/companies/current/invitations")
      .set("Authorization", `Bearer ${coOwner.accessToken}`)
      .send({
        email: `blocked-${uniqueSuffix("blocked")}@example.com`,
        firstName: "Blocked",
        lastName: "Tech",
        role: "TECHNICIAN",
      });
    expect(inviteAfterDemote.status).toBe(403);
    expect(inviteAfterDemote.body.error.code).toBe("AUTH_FORBIDDEN");

    // But co-owner can still view their own /me profile as TECHNICIAN
    const meRes = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${coOwner.accessToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.role).toBe("TECHNICIAN");
  });

  it("rejects an access token if its underlying refresh session expired in the database", async () => {
    const owner = await registerOwner("expired-session-test");

    // Find the session ID for this user
    const session = await prisma.refreshSession.findFirstOrThrow({
      where: { userId: owner.user.id },
    });

    // Artificially expire the session
    await prisma.refreshSession.update({
      where: { id: session.id },
      data: { expiresAt: new Date(Date.now() - 10000) },
    });

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_SESSION_EXPIRED");
  });

  it("rejects an access token with a nonexistent or forged session ID", async () => {
    const forgedToken = await createAccessToken({
      userId: "11111111-1111-1111-1111-111111111111",
      sessionId: "22222222-2222-2222-2222-222222222222",
      companyId: "33333333-3333-3333-3333-333333333333",
      role: "OWNER",
    });

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${forgedToken}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_SESSION_EXPIRED");
  });

  it("rejects an access token whose user/company does not match the database session", async () => {
    const ownerA = await registerOwner("mismatch-a");
    const ownerB = await registerOwner("mismatch-b");

    const sessionA = await prisma.refreshSession.findFirstOrThrow({
      where: { userId: ownerA.user.id },
    });

    // Create a token pointing to session A, but claiming user B / company B
    const mismatchedToken = await createAccessToken({
      userId: ownerB.user.id,
      sessionId: sessionA.id,
      companyId: ownerB.company.id,
      role: "OWNER",
    });

    const response = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${mismatchedToken}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_UNAUTHORIZED");
  });
});
