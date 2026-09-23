import { randomBytes, createHash } from "node:crypto";
import { AppError } from "../../common/errors.js";
import type { AuthContext } from "../../common/auth/auth.types.js";
import { hashPassword } from "../../common/auth/password.js";
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

    // NOTE: Notifications module (docs/architecture.md ADR-009) should send
    // this token to the invited user's email instead of returning it in the
    // API response once an email adapter is wired up. Returning it here is a
    // deliberate, temporary stand-in so invitations are usable end-to-end
    // before Phase 10 (Notifications) lands.
    return { ...member, invitationToken };
  });
}

export async function acceptInvitation(
  token: string,
  password: string,
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

  const passwordHash = await hashPassword(password);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: member.userId },
      data: { passwordHash, isActive: true },
    }),
    prisma.companyMember.update({
      where: { id: member.id },
      data: {
        status: "ACTIVE",
        invitationTokenHash: null,
        invitationTokenExpiresAt: null,
      },
    }),
  ]);

  return { userId: member.userId, companyId: member.companyId };
}

export interface UpdateMemberInput {
  role?: "OWNER" | "DISPATCHER" | "TECHNICIAN";
  status?: "ACTIVE" | "SUSPENDED";
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

  if (member.userId === context.userId && updates.status === "SUSPENDED") {
    throw new AppError(
      "CANNOT_SUSPEND_SELF",
      "You cannot suspend your own company membership",
      422,
    );
  }

  const updated = await prisma.companyMember.update({
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
    await prisma.refreshSession.updateMany({
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

  await prisma.$transaction([
    prisma.companyMember.delete({
      where: { id: memberId },
    }),
    prisma.refreshSession.updateMany({
      where: {
        userId: member.userId,
        companyId: member.companyId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        lastUsedAt: new Date(),
      },
    }),
  ]);

  return { id: memberId, removed: true };
}
