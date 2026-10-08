import request from "supertest";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";

const app = buildApp();

function unique(label: string) {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

async function registerOwner() {
  const suffix = unique("lifecycle-owner");
  const response = await request(app)
    .post("/api/v1/auth/register")
    .send({
      email: `${suffix}@example.com`,
      password: "correct-horse-battery-staple",
      firstName: "Owner",
      lastName: "Lifecycle",
      companyName: `Lifecycle Co ${suffix}`,
    });
  expect(response.status).toBe(201);
  return response.body.data as {
    accessToken: string;
    company: { id: string };
    user: { id: string };
  };
}

async function invite(
  owner: { accessToken: string },
  role: "DISPATCHER" | "TECHNICIAN" = "TECHNICIAN",
  email = `${unique("invitee")}@example.com`,
) {
  const response = await request(app)
    .post("/api/v1/companies/current/invitations")
    .set("Authorization", `Bearer ${owner.accessToken}`)
    .send({ email, firstName: "Ivy", lastName: "Invitee", role });
  return { response, email };
}

function expireInvitation(companyId: string, userId: string) {
  return prisma.companyMember.update({
    where: { companyId_userId: { companyId, userId } },
    data: { invitationTokenExpiresAt: new Date(Date.now() - 60 * 1000) },
  });
}

describe("Expired invitations: resend", () => {
  it("issues a new working code, kills the old one and restarts the 7-day window", async () => {
    const owner = await registerOwner();
    const { response: first } = await invite(owner);
    expect(first.status).toBe(201);
    const oldToken = first.body.data.invitationToken as string;
    const memberId = first.body.data.id as string;
    const inviteeId = first.body.data.user.id as string;

    await expireInvitation(owner.company.id, inviteeId);

    // The expired code no longer works.
    const expired = await request(app)
      .post("/api/v1/auth/accept-invitation")
      .send({ token: oldToken, password: "expired-code-password-1" });
    expect(expired.status).toBe(400);
    expect(expired.body.error.code).toBe("INVITATION_INVALID_OR_EXPIRED");

    // The Team list can show the invitation as expired.
    const listed = await request(app)
      .get("/api/v1/companies/current/members")
      .set("Authorization", `Bearer ${owner.accessToken}`);
    const row = listed.body.data.find((m: { id: string }) => m.id === memberId);
    expect(row.status).toBe("INVITED");
    expect(new Date(row.invitationExpiresAt).getTime()).toBeLessThan(
      Date.now(),
    );
    // The code itself is never part of the list.
    expect(JSON.stringify(listed.body)).not.toContain(oldToken);

    const resend = await request(app)
      .post(`/api/v1/companies/current/members/${memberId}/resend-invitation`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(resend.status).toBe(200);
    expect(resend.body.data.status).toBe("INVITED");
    const newToken = resend.body.data.invitationToken as string;
    expect(newToken).toBeTruthy();
    expect(newToken).not.toBe(oldToken);
    const newExpiry = new Date(resend.body.data.invitationExpiresAt).getTime();
    expect(newExpiry).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);

    // The old code stays dead even though the member is pending again.
    const oldAgain = await request(app)
      .post("/api/v1/auth/accept-invitation")
      .send({ token: oldToken, password: "old-code-password-123456" });
    expect(oldAgain.status).toBe(400);

    // The new code works, exactly once.
    const accept = await request(app)
      .post("/api/v1/auth/accept-invitation")
      .send({ token: newToken, password: "fresh-code-password-123456" });
    expect(accept.status).toBe(200);
    expect(accept.body.data.role).toBe("TECHNICIAN");
    expect(accept.body.data.company.id).toBe(owner.company.id);

    const reuse = await request(app)
      .post("/api/v1/auth/accept-invitation")
      .send({ token: newToken, password: "reuse-code-password-123456" });
    expect(reuse.status).toBe(400);
  });

  it("stores only a hash of the new code", async () => {
    const owner = await registerOwner();
    const { response: first } = await invite(owner);
    const memberId = first.body.data.id as string;

    const resend = await request(app)
      .post(`/api/v1/companies/current/members/${memberId}/resend-invitation`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(resend.status).toBe(200);

    const stored = await prisma.companyMember.findUniqueOrThrow({
      where: { id: memberId },
    });
    expect(stored.invitationTokenHash).toBeTruthy();
    expect(stored.invitationTokenHash).not.toBe(
      resend.body.data.invitationToken,
    );
  });

  it("tells the owner to resend when the same email is invited again", async () => {
    const owner = await registerOwner();
    const { response: first, email } = await invite(owner);
    expect(first.status).toBe(201);

    const again = await invite(owner, "TECHNICIAN", email);
    expect(again.response.status).toBe(409);
    expect(again.response.body.error.code).toBe("MEMBER_INVITATION_PENDING");
  });

  it("keeps MEMBER_ALREADY_EXISTS for people who already joined", async () => {
    const owner = await registerOwner();
    const { response: first, email } = await invite(owner);
    await request(app).post("/api/v1/auth/accept-invitation").send({
      token: first.body.data.invitationToken,
      password: "joined-password-123456",
    });

    const again = await invite(owner, "TECHNICIAN", email);
    expect(again.response.status).toBe(409);
    expect(again.response.body.error.code).toBe("MEMBER_ALREADY_EXISTS");
  });

  it("only works for pending members (not active, not unknown)", async () => {
    const owner = await registerOwner();
    const { response: first } = await invite(owner);
    const memberId = first.body.data.id as string;
    await request(app).post("/api/v1/auth/accept-invitation").send({
      token: first.body.data.invitationToken,
      password: "active-member-password-123",
    });

    const active = await request(app)
      .post(`/api/v1/companies/current/members/${memberId}/resend-invitation`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(active.status).toBe(409);
    expect(active.body.error.code).toBe("MEMBER_NOT_INVITED");

    const unknown = await request(app)
      .post(
        "/api/v1/companies/current/members/00000000-0000-0000-0000-000000000000/resend-invitation",
      )
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(unknown.status).toBe(404);
  });

  it("is owner-only and cannot reach another company's invitation", async () => {
    const owner = await registerOwner();
    const { response: pending } = await invite(owner);
    const memberId = pending.body.data.id as string;

    // A dispatcher in the same company is refused.
    const { response: dispatcherInvite } = await invite(owner, "DISPATCHER");
    const dispatcherAccept = await request(app)
      .post("/api/v1/auth/accept-invitation")
      .send({
        token: dispatcherInvite.body.data.invitationToken,
        password: "dispatcher-password-123456",
      });
    expect(dispatcherAccept.status).toBe(200);
    const asDispatcher = await request(app)
      .post(`/api/v1/companies/current/members/${memberId}/resend-invitation`)
      .set("Authorization", `Bearer ${dispatcherAccept.body.data.accessToken}`);
    expect(asDispatcher.status).toBe(403);

    // An owner of a different company cannot see it at all.
    const otherOwner = await registerOwner();
    const crossTenant = await request(app)
      .post(`/api/v1/companies/current/members/${memberId}/resend-invitation`)
      .set("Authorization", `Bearer ${otherOwner.accessToken}`);
    expect(crossTenant.status).toBe(404);

    // No token at all.
    const anonymous = await request(app).post(
      `/api/v1/companies/current/members/${memberId}/resend-invitation`,
    );
    expect(anonymous.status).toBe(401);
  });
});

describe("Invited members cannot be activated by the owner", () => {
  it("rejects ACTIVE and SUSPENDED on a pending invitation and leaves it INVITED", async () => {
    const owner = await registerOwner();
    const { response: pending } = await invite(owner);
    const memberId = pending.body.data.id as string;

    for (const status of ["ACTIVE", "SUSPENDED"]) {
      const response = await request(app)
        .patch(`/api/v1/companies/current/members/${memberId}`)
        .set("Authorization", `Bearer ${owner.accessToken}`)
        .send({ status });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("MEMBER_NOT_ACCEPTED");
    }

    const stored = await prisma.companyMember.findUniqueOrThrow({
      where: { id: memberId },
    });
    expect(stored.status).toBe("INVITED");
  });

  it("still allows fixing the role of a pending invitation", async () => {
    const owner = await registerOwner();
    const { response: pending } = await invite(owner, "TECHNICIAN");
    const memberId = pending.body.data.id as string;

    const response = await request(app)
      .patch(`/api/v1/companies/current/members/${memberId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ role: "DISPATCHER" });
    expect(response.status).toBe(200);
    expect(response.body.data.role).toBe("DISPATCHER");
    expect(response.body.data.status).toBe("INVITED");
  });

  it("still lets the owner suspend and reactivate someone who really joined", async () => {
    const owner = await registerOwner();
    const { response: pending } = await invite(owner);
    const memberId = pending.body.data.id as string;
    await request(app).post("/api/v1/auth/accept-invitation").send({
      token: pending.body.data.invitationToken,
      password: "real-member-password-123",
    });

    const suspend = await request(app)
      .patch(`/api/v1/companies/current/members/${memberId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ status: "SUSPENDED" });
    expect(suspend.status).toBe(200);
    expect(suspend.body.data.status).toBe("SUSPENDED");

    const reactivate = await request(app)
      .patch(`/api/v1/companies/current/members/${memberId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .send({ status: "ACTIVE" });
    expect(reactivate.status).toBe(200);
    expect(reactivate.body.data.status).toBe("ACTIVE");
  });
});

describe("Removing a pending invitation (the existing way out)", () => {
  it("lets the owner remove the pending row and invite the same email again", async () => {
    const owner = await registerOwner();
    const { response: first, email } = await invite(owner);
    const memberId = first.body.data.id as string;

    const removal = await request(app)
      .delete(`/api/v1/companies/current/members/${memberId}`)
      .set("Authorization", `Bearer ${owner.accessToken}`);
    expect(removal.status).toBe(200);

    const again = await invite(owner, "TECHNICIAN", email);
    expect(again.response.status).toBe(201);
    expect(again.response.body.data.invitationToken).not.toBe(
      first.body.data.invitationToken,
    );
  });
});
