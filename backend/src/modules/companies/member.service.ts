import { randomBytes, createHash } from "node:crypto";
import { AppError } from "../../common/errors.js";
import type { AuthContext } from "../../common/auth/auth.types.js";
import { hashPassword, verifyPassword } from "../../common/auth/password.js";
import { prisma } from "../../db/prisma.js";

export interface InviteMemberInput {
  email: string;
  firstName: string;
  lastName: string;
  role: "OWNER" | "DISPATCHER" | "TECHNICIAN";
}

const INVITATION_TTL_DAYS = 7;

function createInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function listMembers(context: AuthContext) {
  const members = await prisma.companyMember.findMany({
    where: { companyId: context.companyId },
    select: {
      id: true,
      role: true,
      status: true,
      createdAt: true,
      invitationTokenExpiresAt: true,
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return members.map((m) => ({
    id: m.id,
    role: m.role,
    status: m.status,
    createdAt: m.createdAt,
    // Only meaningful while the invitation is pending. The token itself is
    // never returned here: only its hash is stored.
    invitationExpiresAt:
      m.status === "INVITED" ? m.invitationTokenExpiresAt : null,
    user: m.user,
  }));
}

export async function inviteMember(
  context: AuthContext,
  input: InviteMemberInput,
) {
  const email = input.email.trim().toLowerCase();

  return prisma.$transaction(async (tx) => {
    let user = await tx.user.findUnique({ where: { email } });
    if (!user) {
      user = await tx.user.create({
        data: {
          email,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          isActive: true,
        },
      });
    }

    const existingMembership = await tx.companyMember.findUnique({
      where: {
        companyId_userId: {
          companyId: context.companyId,
          userId: user.id,
        },
      },
    });

    if (existingMembership?.status === "INVITED") {
      // Typically an invitation that was never accepted (or has expired).
      // Point the owner at the resend action instead of a dead end.
      throw new AppError(
        "MEMBER_INVITATION_PENDING",
        "An invitation for this email is already pending. Use Resend invitation to issue a new code.",
        409,
      );
    }

    if (existingMembership) {
      throw new AppError(
        "MEMBER_ALREADY_EXISTS",
        "User is already a member of this company",
        409,
      );
    }

    const invitationToken = createInvitationToken();
    const invitationTokenExpiresAt = new Date(
      Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000,
    );

    const member = await tx.companyMember.create({
      data: {
        companyId: context.companyId,
        userId: user.id,
        role: input.role,
        status: "INVITED",
        invitationTokenHash: hashInvitationToken(invitationToken),
        invitationTokenExpiresAt,
      },
      select: {
        id: true,
        role: true,
        status: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // SECURITY NOTE: The invitation token is returned in the API response
    // because it is currently the ONLY delivery channel: invitation
    // emails do not exist yet, and the owner's app shows the token once
    // so it can be shared with the invitee. It is returned solely on
    // these authenticated owner-only invite/resend responses and is
    // never logged. When invitation email delivery lands, stop
    // returning it here.
    //
    // Mitigations in force: 7-day expiry, single use, reissue revokes
    // the previous token, and acceptance requires the accepter to enter
    // the invited email address (enforced in acceptInvitation), so a
    // leaked token alone is not sufficient.
    return {
      ...member,
      invitationToken,
      invitationExpiresAt: invitationTokenExpiresAt,
    };
  });
}

/**
 * Issues a fresh one-time code for a member who has not accepted yet.
 *
 * This is the way out of an expired (or lost) invitation: the old code stops
 * working the moment the new hash is stored, and the 7-day window restarts.
 * Only a still-INVITED member of the caller's own company qualifies; the
 * conditional update means a concurrent acceptance can never be overwritten.
 */
export async function resendInvitation(context: AuthContext, memberId: string) {
  const member = await prisma.companyMember.findFirst({
    where: { id: memberId, companyId: context.companyId },
    select: { id: true, status: true },
  });

  if (!member) {
    throw new AppError("RESOURCE_NOT_FOUND", "Member not found", 404);
  }

  const notPending = new AppError(
    "MEMBER_NOT_INVITED",
    "Only a pending invitation can be resent",
    409,
  );
  if (member.status !== "INVITED") {
    throw notPending;
  }

  const invitationToken = createInvitationToken();
  const invitationTokenExpiresAt = new Date(
    Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  const result = await prisma.companyMember.updateMany({
    where: {
      id: member.id,
      companyId: context.companyId,
      status: "INVITED",
    },
    data: {
      invitationTokenHash: hashInvitationToken(invitationToken),
      invitationTokenExpiresAt,
    },
  });

  if (result.count === 0) {
    throw notPending;
  }

  const updated = await prisma.companyMember.findFirstOrThrow({
    where: { id: member.id, companyId: context.companyId },
    select: {
      id: true,
      role: true,
      status: true,
      createdAt: true,
      user: {
        select: { id: true, email: true, firstName: true, lastName: true },
      },
    },
  });

  return {
    ...updated,
    invitationToken,
    invitationExpiresAt: invitationTokenExpiresAt,
  };
}

export async function acceptInvitation(
  token: string,
  password: string,
  email: string,
): Promise<{ userId: string; companyId: string }> {
  const tokenHash = hashInvitationToken(token);

  const member = await prisma.companyMember.findUnique({
    where: { invitationTokenHash: tokenHash },
  });

  if (
    !member ||
    member.status !== "INVITED" ||
    !member.invitationTokenExpiresAt ||
    member.invitationTokenExpiresAt <= new Date()
  ) {
    throw new AppError(
      "INVITATION_INVALID_OR_EXPIRED",
      "This invitation link is invalid or has expired",
      400,
    );
  }

  // An invitation may point at an email that already has an Aera account
  // (for example from another company). Whoever holds the invitation token
  // must never be able to overwrite that person's password, so an existing
  // account has to prove it by entering its current password.
  const invitedUser = await prisma.user.findUnique({
    where: { id: member.userId },
    select: { passwordHash: true, email: true },
  });
  if (!invitedUser) {
    throw new AppError(
      "INVITATION_INVALID_OR_EXPIRED",
      "This invitation link is invalid or has expired",
      400,
    );
  }

  // The accepter must prove they are the person the invitation was
  // addressed to by entering that email. Same generic error as an
  // invalid token, so this endpoint stays a non-oracle.
  if (
    !invitedUser.email ||
    invitedUser.email.trim().toLowerCase() !== email.trim().toLowerCase()
  ) {
    throw new AppError(
      "INVITATION_INVALID_OR_EXPIRED",
      "This invitation link is invalid or has expired",
      400,
    );
  }

  let newPasswordHash: string | null = null;
  if (invitedUser.passwordHash) {
    const matches = await verifyPassword(password, invitedUser.passwordHash);
    if (!matches) {
      throw new AppError(
        "INVITATION_PASSWORD_MISMATCH",
        "This email already has an Aera account. Enter your existing password to join.",
        400,
      );
    }
  } else {
    newPasswordHash = await hashPassword(password);
  }

  const accepted = await prisma.$transaction(async (tx) => {
    const updateResult = await tx.companyMember.updateMany({
      where: {
        id: member.id,
        status: "INVITED",
        invitationTokenHash: tokenHash,
        invitationTokenExpiresAt: { gt: new Date() },
      },
      data: {
        status: "ACTIVE",
        invitationTokenHash: null,
        invitationTokenExpiresAt: null,
      },
    });

    if (updateResult.count === 0) {
      return false;
    }

    if (newPasswordHash !== null) {
      await tx.user.update({
        where: { id: member.userId },
        data: { passwordHash: newPasswordHash, isActive: true },
      });
    }

    return true;
  });

  if (!accepted) {
    throw new AppError(
      "INVITATION_INVALID_OR_EXPIRED",
      "This invitation link is invalid or has expired",
      400,
    );
  }

  return { userId: member.userId, companyId: member.companyId };
}

export interface UpdateMemberInput {
  role?: "OWNER" | "DISPATCHER" | "TECHNICIAN";
  status?: "ACTIVE" | "SUSPENDED";
}

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Last-owner invariant: a company must always keep at least one ACTIVE
 * owner. Without it, any owner could demote/suspend/remove every other
 * owner and seize the tenant, and a sole owner could demote themselves
 * and orphan the company (nobody left who can manage members).
 * Callers run this inside a transaction that first locks the company
 * row, so two owners cannot race each other's checks.
 */
async function assertNotLastActiveOwner(
  tx: TxClient,
  member: { id: string; companyId: string; role: string; status: string },
) {
  if (member.role !== "OWNER" || member.status !== "ACTIVE") return;
  const otherOwners = await tx.companyMember.count({
    where: {
      companyId: member.companyId,
      role: "OWNER",
      status: "ACTIVE",
      id: { not: member.id },
    },
  });
  if (otherOwners === 0) {
    throw new AppError(
      "LAST_OWNER_REQUIRED",
      "A company must keep at least one active owner; promote another member to owner first",
      409,
    );
  }
}

async function lockCompanyRow(tx: TxClient, companyId: string) {
  await tx.$queryRaw`SELECT id FROM companies WHERE id = ${companyId}::uuid FOR UPDATE`;
}

export async function updateMember(
  context: AuthContext,
  memberId: string,
  updates: UpdateMemberInput,
) {
  const member = await prisma.companyMember.findFirst({
    where: { id: memberId, companyId: context.companyId },
  });

  if (!member) {
    throw new AppError("RESOURCE_NOT_FOUND", "Member not found", 404);
  }

  // Only the invited person can turn INVITED into ACTIVE, by accepting with
  // their code. Letting the owner flip it would put someone who never joined
  // into the assign list. Role changes on a pending invitation stay allowed.
  if (member.status === "INVITED" && updates.status !== undefined) {
    throw new AppError(
      "MEMBER_NOT_ACCEPTED",
      "This person has not accepted their invitation yet. Resend or remove the invitation instead.",
      409,
    );
  }

  if (member.userId === context.userId && updates.status === "SUSPENDED") {
    throw new AppError(
      "CANNOT_SUSPEND_SELF",
      "You cannot suspend your own company membership",
      422,
    );
  }

  const removesOwnership =
    member.role === "OWNER" &&
    member.status === "ACTIVE" &&
    ((updates.role !== undefined && updates.role !== "OWNER") ||
      updates.status === "SUSPENDED");

  const updated = await prisma.$transaction(async (tx) => {
    if (removesOwnership) {
      await lockCompanyRow(tx, member.companyId);
      await assertNotLastActiveOwner(tx, member);
    }

    const row = await tx.companyMember.update({
      where: { id: memberId },
      data: {
        ...(updates.role !== undefined ? { role: updates.role } : {}),
        ...(updates.status !== undefined ? { status: updates.status } : {}),
      },
      select: {
        id: true,
        role: true,
        status: true,
        updatedAt: true,
      },
    });

    if (updates.status === "SUSPENDED") {
      await tx.refreshSession.updateMany({
        where: {
          userId: member.userId,
          companyId: member.companyId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
          lastUsedAt: new Date(),
        },
      });
    }

    return row;
  });

  return updated;
}

export async function updateMemberRole(
  context: AuthContext,
  memberId: string,
  role: "OWNER" | "DISPATCHER" | "TECHNICIAN",
) {
  return updateMember(context, memberId, { role });
}

export async function removeMember(context: AuthContext, memberId: string) {
  const member = await prisma.companyMember.findFirst({
    where: { id: memberId, companyId: context.companyId },
  });

  if (!member) {
    throw new AppError("RESOURCE_NOT_FOUND", "Member not found", 404);
  }

  if (member.userId === context.userId) {
    throw new AppError(
      "CANNOT_REMOVE_SELF",
      "You cannot remove your own company membership",
      422,
    );
  }

  await prisma.$transaction(async (tx) => {
    if (member.role === "OWNER" && member.status === "ACTIVE") {
      await lockCompanyRow(tx, member.companyId);
      await assertNotLastActiveOwner(tx, member);
    }
    await tx.companyMember.delete({
      where: { id: memberId },
    });
    await tx.refreshSession.updateMany({
      where: {
        userId: member.userId,
        companyId: member.companyId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        lastUsedAt: new Date(),
      },
    });
  });

  return { id: memberId, removed: true };
}
