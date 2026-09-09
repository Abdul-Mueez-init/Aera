import { AppError } from "../../common/errors.js";
import type { AuthContext } from "../../common/auth/auth.types.js";
import { prisma } from "../../db/prisma.js";

export interface InviteMemberInput {
  email: string;
  firstName: string;
  lastName: string;
  role: "OWNER" | "DISPATCHER" | "TECHNICIAN";
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

    const member = await tx.companyMember.create({
      data: {
        companyId: context.companyId,
        userId: user.id,
        role: input.role,
        status: "INVITED",
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

    return member;
  });
}

export async function updateMemberRole(
  context: AuthContext,
  memberId: string,
  role: "OWNER" | "DISPATCHER" | "TECHNICIAN",
) {
  const member = await prisma.companyMember.findFirst({
    where: { id: memberId, companyId: context.companyId },
  });

  if (!member) {
    throw new AppError("RESOURCE_NOT_FOUND", "Member not found", 404);
  }

  const updated = await prisma.companyMember.update({
    where: { id: memberId },
    data: { role },
    select: {
      id: true,
      role: true,
      status: true,
      updatedAt: true,
    },
  });

  return updated;
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

  await prisma.companyMember.delete({
    where: { id: memberId },
  });

  return { id: memberId, removed: true };
}
