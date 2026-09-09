import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { AppError } from "../../common/errors.js";
import { hashPassword, verifyPassword } from "../../common/auth/password.js";
import {
  createAccessToken,
  createRefreshToken,
  hashRefreshToken,
} from "../../common/auth/tokens.js";
import type { AuthContext } from "../../common/auth/auth.types.js";
import { acceptInvitation } from "../companies/member.service.js";

interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  companyName: string;
  companySlug?: string;
}

interface LoginInput {
  email: string;
  password: string;
}

interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string | null;
    firstName: string;
    lastName: string;
  };
  company: {
    id: string;
    name: string;
    slug: string;
  };
  role: "OWNER" | "DISPATCHER" | "TECHNICIAN";
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function createSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

async function issueSession(
  context: AuthContext,
  user: AuthResult["user"],
  company: AuthResult["company"],
): Promise<AuthResult> {
  const refreshToken = createRefreshToken();
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  await prisma.refreshSession.create({
    data: {
      id: context.sessionId,
      companyId: context.companyId,
      userId: context.userId,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt,
    },
  });

  return {
    accessToken: await createAccessToken(context),
    refreshToken,
    user,
    company,
    role: context.role,
  };
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  const email = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);
  const companySlug = createSlug(input.companySlug ?? input.companyName);

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: {
          email,
          passwordHash,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
        },
      });
      const company = await transaction.company.create({
        data: {
          name: input.companyName.trim(),
          slug: companySlug,
        },
      });
      await transaction.companyMember.create({
        data: {
          companyId: company.id,
          userId: user.id,
          role: "OWNER",
          status: "ACTIVE",
        },
      });

      return { user, company };
    });

    const context: AuthContext = {
      userId: result.user.id,
      sessionId: randomUUID(),
      companyId: result.company.id,
      role: "OWNER",
    };
    return issueSession(
      context,
      {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
      },
      {
        id: result.company.id,
        name: result.company.name,
        slug: result.company.slug,
      },
    );
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AppError(
        "AUTH_ACCOUNT_EXISTS",
        "An account or company with these details already exists",
        409,
      );
    }
    throw error;
  }
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const user = await prisma.user.findUnique({
    where: { email: normalizeEmail(input.email) },
  });
  const passwordMatches = user?.passwordHash
    ? await verifyPassword(input.password, user.passwordHash)
    : false;

  if (!user || !passwordMatches || !user.isActive) {
    throw new AppError(
      "AUTH_INVALID_CREDENTIALS",
      "Invalid email or password",
      401,
    );
  }

  const membership = await prisma.companyMember.findFirst({
    where: { userId: user.id, status: "ACTIVE" },
    include: { company: true },
    orderBy: { createdAt: "asc" },
  });

  if (!membership) {
    throw new AppError(
      "AUTH_NO_ACTIVE_MEMBERSHIP",
      "No active company membership",
      403,
    );
  }

  return issueSession(
    {
      userId: user.id,
      sessionId: randomUUID(),
      companyId: membership.companyId,
      role: membership.role,
    },
    {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    },
    {
      id: membership.company.id,
      name: membership.company.name,
      slug: membership.company.slug,
    },
  );
}

export async function rotateRefreshSession(
  refreshToken: string,
): Promise<AuthResult> {
  const session = await prisma.refreshSession.findUnique({
    where: { tokenHash: hashRefreshToken(refreshToken) },
    include: { user: true, company: true },
  });

  if (!session) {
    throw new AppError(
      "AUTH_SESSION_EXPIRED",
      "Refresh session has expired",
      401,
    );
  }

  // Reuse detection (docs/architecture.md section 6: "Revoke refresh session
  // on suspicious reuse"). A refresh token is single-use: once rotated, the
  // old token is marked revoked and replaced. If a *revoked* token is
  // presented again, that token has leaked (device theft, log exposure,
  // etc). The correct response is not just to reject this call, but to
  // revoke the entire active session chain so the attacker's stolen token
  // (and any session descended from it) stops working, forcing the
  // legitimate user to log in again.
  if (session.revokedAt) {
    await prisma.refreshSession.updateMany({
      where: {
        userId: session.userId,
        companyId: session.companyId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    throw new AppError(
      "AUTH_SESSION_REUSE_DETECTED",
      "This session has been revoked. Please log in again.",
      401,
    );
  }

  if (session.expiresAt <= new Date() || !session.user.isActive) {
    throw new AppError(
      "AUTH_SESSION_EXPIRED",
      "Refresh session has expired",
      401,
    );
  }

  const membership = await prisma.companyMember.findUnique({
    where: {
      companyId_userId: {
        companyId: session.companyId,
        userId: session.userId,
      },
    },
  });

  if (!membership || membership.status !== "ACTIVE") {
    throw new AppError(
      "AUTH_FORBIDDEN",
      "Company membership is not active",
      403,
    );
  }

  const replacementId = randomUUID();
  const replacementToken = createRefreshToken();
  const expiresAt = new Date(
    Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  await prisma.$transaction([
    prisma.refreshSession.update({
      where: { id: session.id },
      data: {
        revokedAt: new Date(),
        lastUsedAt: new Date(),
        replacedBySessionId: replacementId,
      },
    }),
    prisma.refreshSession.create({
      data: {
        id: replacementId,
        companyId: session.companyId,
        userId: session.userId,
        tokenHash: hashRefreshToken(replacementToken),
        expiresAt,
      },
    }),
  ]);

  const context: AuthContext = {
    userId: session.userId,
    sessionId: replacementId,
    companyId: session.companyId,
    role: membership.role,
  };
  return {
    accessToken: await createAccessToken(context),
    refreshToken: replacementToken,
    user: {
      id: session.user.id,
      email: session.user.email,
      firstName: session.user.firstName,
      lastName: session.user.lastName,
    },
    company: {
      id: session.company.id,
      name: session.company.name,
      slug: session.company.slug,
    },
    role: membership.role,
  };
}

export async function revokeRefreshSession(
  refreshToken: string,
): Promise<void> {
  await prisma.refreshSession.updateMany({
    where: {
      tokenHash: hashRefreshToken(refreshToken),
      revokedAt: null,
    },
    data: { revokedAt: new Date(), lastUsedAt: new Date() },
  });
}

export async function acceptInvitationAndLogin(
  token: string,
  password: string,
): Promise<AuthResult> {
  const { userId, companyId } = await acceptInvitation(token, password);

  const [user, membership] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.companyMember.findUniqueOrThrow({
      where: { companyId_userId: { companyId, userId } },
      include: { company: true },
    }),
  ]);

  return issueSession(
    {
      userId: user.id,
      sessionId: randomUUID(),
      companyId,
      role: membership.role,
    },
    {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    },
    {
      id: membership.company.id,
      name: membership.company.name,
      slug: membership.company.slug,
    },
  );
}

export async function getCurrentUser(context: AuthContext) {
  const membership = await prisma.companyMember.findUnique({
    where: {
      companyId_userId: {
        companyId: context.companyId,
        userId: context.userId,
      },
    },
    include: { user: true, company: true },
  });

  if (
    !membership ||
    membership.status !== "ACTIVE" ||
    !membership.user.isActive
  ) {
    throw new AppError("AUTH_FORBIDDEN", "Active membership is required", 403);
  }

  return {
    user: {
      id: membership.user.id,
      email: membership.user.email,
      firstName: membership.user.firstName,
      lastName: membership.user.lastName,
    },
    company: {
      id: membership.company.id,
      name: membership.company.name,
      slug: membership.company.slug,
    },
    role: membership.role,
  };
}