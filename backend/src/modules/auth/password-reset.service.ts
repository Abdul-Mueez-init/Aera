import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { AppError } from "../../common/errors.js";
import { hashPassword } from "../../common/auth/password.js";
import { logger } from "../../common/logger.js";
import { captureBackgroundError } from "../../common/observability.js";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { inProcessQueue } from "../../queue/in-process-queue.adapter.js";
import {
  buildPasswordChangedEmail,
  buildPasswordResetEmail,
} from "../notifications/email-templates.js";
import { resendEmailAdapter } from "../notifications/resend-email.adapter.js";

/**
 * Password recovery (Aera_Handoff_Doc Phase 6, decision D4).
 *
 * Aera owns its users and sessions (users.passwordHash + our own JWTs), so
 * recovery lives here rather than in Supabase Auth, which can only reset
 * passwords for users stored in Supabase's own auth schema. Reset codes are
 * kept in our PostgreSQL (hosted on Supabase) and delivered through the
 * existing email adapter.
 *
 * Security properties:
 * - The code is 10 random characters (about 50 bits) from an alphabet without
 *   look-alike characters, so it is easy to read off an email and type.
 * - Only an HMAC of the code (keyed by JWT_SECRET) is stored.
 * - A code is bound to one user, works once, and expires after 30 minutes.
 * - At most 5 guesses per code. Each guess is reserved atomically BEFORE the
 *   comparison, so parallel guessing cannot exceed the cap.
 * - Requesting a reset always looks identical to the caller, whether or not
 *   the account exists, and the work happens in the queue so timing matches.
 * - A successful reset revokes every refresh session of the user.
 */

const RESET_CODE_TTL_MINUTES = 30;
const RESET_MAX_ATTEMPTS = 5;
const RESET_REQUEST_COOLDOWN_SECONDS = 60;
const RESET_CODE_LENGTH = 10;
// 32 characters, no I / O / 0 / 1.
const RESET_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const STALE_TOKEN_RETENTION_MS = 24 * 60 * 60 * 1000;

const REQUEST_JOB_TYPE = "auth.password-reset-request";
const CHANGED_NOTICE_JOB_TYPE = "auth.password-changed-notice";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Uppercases and strips spaces/dashes so "abcde fghjk" and "ABCDE-FGHJK" match. */
export function normalizeResetCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function generateResetCode(): string {
  let code = "";
  for (let index = 0; index < RESET_CODE_LENGTH; index += 1) {
    code += RESET_CODE_ALPHABET[randomInt(0, RESET_CODE_ALPHABET.length)];
  }
  return code;
}

/** Display form shown in the email: XXXXX-XXXXX. */
function formatResetCode(code: string): string {
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

function hashResetCode(normalizedCode: string): string {
  return createHmac("sha256", env.JWT_SECRET)
    .update(`password-reset:${normalizedCode}`)
    .digest("hex");
}

function hashesMatch(storedHex: string, candidateHex: string): boolean {
  const stored = Buffer.from(storedHex, "hex");
  const candidate = Buffer.from(candidateHex, "hex");
  return (
    stored.length === candidate.length && timingSafeEqual(stored, candidate)
  );
}

function invalidOrExpired(): AppError {
  return new AppError(
    "PASSWORD_RESET_INVALID_OR_EXPIRED",
    "This reset code is invalid or has expired. Request a new one.",
    400,
  );
}

interface ResetRequestJob {
  email: string;
}

/**
 * Runs in the queue. Does nothing (silently) for unknown, inactive or
 * password-less accounts, so an invited-but-not-joined person cannot use
 * password reset to skip accepting their invitation.
 */
async function processResetRequest(job: ResetRequestJob): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email: normalizeEmail(job.email) },
    select: {
      id: true,
      email: true,
      firstName: true,
      isActive: true,
      passwordHash: true,
    },
  });
  if (!user || !user.email || !user.isActive || !user.passwordHash) {
    return;
  }

  // Cheap per-account brake on email flooding, on top of the per-IP limiter.
  const recent = await prisma.passwordResetToken.findFirst({
    where: {
      userId: user.id,
      createdAt: {
        gt: new Date(Date.now() - RESET_REQUEST_COOLDOWN_SECONDS * 1000),
      },
    },
    select: { id: true },
  });
  if (recent) {
    return;
  }

  const code = generateResetCode();
  const [, token] = await prisma.$transaction([
    // Only the newest code is ever valid.
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        codeHash: hashResetCode(code),
        expiresAt: new Date(Date.now() + RESET_CODE_TTL_MINUTES * 60 * 1000),
      },
      select: { id: true },
    }),
  ]);

  try {
    await resendEmailAdapter.send(
      buildPasswordResetEmail({
        to: user.email,
        firstName: user.firstName,
        code: formatResetCode(code),
        ttlMinutes: RESET_CODE_TTL_MINUTES,
      }),
    );
  } catch (error) {
    // Nobody received this code, so drop it: otherwise the cooldown would
    // swallow the queue's retry. Rethrow so the queue retries with backoff.
    await prisma.passwordResetToken
      .deleteMany({ where: { id: token.id } })
      .catch(() => undefined);
    throw error;
  }

  // Opportunistic housekeeping; never blocks or fails the request.
  await prisma.passwordResetToken
    .deleteMany({
      where: {
        expiresAt: { lt: new Date(Date.now() - STALE_TOKEN_RETENTION_MS) },
      },
    })
    .catch(() => undefined);
}

async function processChangedNotice(job: { userId: string }): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: job.userId },
    select: { email: true, firstName: true },
  });
  if (!user?.email) return;
  try {
    await resendEmailAdapter.send(
      buildPasswordChangedEmail({ to: user.email, firstName: user.firstName }),
    );
  } catch (error) {
    // Informational only: never fail or retry-storm over a courtesy email.
    logger.warn({ err: error }, "Failed to send password-changed notice");
    captureBackgroundError(error, "password-changed-notice", {
      userId: job.userId,
    });
  }
}

inProcessQueue.registerHandler<ResetRequestJob>(
  REQUEST_JOB_TYPE,
  processResetRequest,
);
inProcessQueue.registerHandler<{ userId: string }>(
  CHANGED_NOTICE_JOB_TYPE,
  processChangedNotice,
);

/**
 * Always resolves the same way. The real work is queued, so neither the
 * response body nor its timing reveals whether the email has an account.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  try {
    await inProcessQueue.enqueue<ResetRequestJob>(REQUEST_JOB_TYPE, { email });
  } catch (error) {
    logger.warn({ err: error }, "Failed to enqueue password reset request");
  }
}

export interface ResetPasswordInput {
  email: string;
  code: string;
  password: string;
}

export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email: normalizeEmail(input.email) },
    select: { id: true, isActive: true },
  });
  if (!user || !user.isActive) {
    throw invalidOrExpired();
  }

  const token = await prisma.passwordResetToken.findFirst({
    where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, codeHash: true },
  });
  if (!token) {
    throw invalidOrExpired();
  }

  // Spend one of the code's attempts before looking at the guess. Doing it as
  // one conditional UPDATE is what stops parallel requests from sneaking past
  // the cap.
  const reserved = await prisma.passwordResetToken.updateMany({
    where: {
      id: token.id,
      usedAt: null,
      expiresAt: { gt: new Date() },
      failedAttempts: { lt: RESET_MAX_ATTEMPTS },
    },
    data: { failedAttempts: { increment: 1 } },
  });
  if (reserved.count === 0) {
    throw invalidOrExpired();
  }

  const candidate = hashResetCode(normalizeResetCode(input.code));
  if (!hashesMatch(token.codeHash, candidate)) {
    throw invalidOrExpired();
  }

  const passwordHash = await hashPassword(input.password);

  await prisma.$transaction(async (tx) => {
    const consumed = await tx.passwordResetToken.updateMany({
      where: { id: token.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (consumed.count === 0) {
      throw invalidOrExpired();
    }

    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    // Anyone holding an old session (including a thief) is signed out, in
    // every company the user belongs to.
    await tx.refreshSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date(), lastUsedAt: new Date() },
    });

    await tx.passwordResetToken.deleteMany({
      where: { userId: user.id, id: { not: token.id } },
    });
  });

  try {
    await inProcessQueue.enqueue<{ userId: string }>(CHANGED_NOTICE_JOB_TYPE, {
      userId: user.id,
    });
  } catch (error) {
    logger.warn({ err: error }, "Failed to enqueue password-changed notice");
  }
}
