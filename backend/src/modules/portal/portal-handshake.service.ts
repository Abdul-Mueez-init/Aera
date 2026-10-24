import { AppError } from "../../common/errors.js";
import type { AuthContext } from "../../common/auth/auth.types.js";
import { prisma } from "../../db/prisma.js";
import { deriveHandshakeCode } from "./portal.tokens.js";
import { env } from "../../config/env.js";

const MAX_HANDSHAKE_ATTEMPTS = 5;
const HANDSHAKE_LOCKOUT_MINUTES = 15;

/**
 * Verify a handshake code for a job.
 * Only works when job is EN_ROUTE and not already verified.
 * After 5 failed attempts, lock for 15 minutes.
 */
export async function verifyHandshakeCode(
  companyId: string,
  customerId: string,
  jobId: string,
  code: string,
) {
  const job = await prisma.job.findFirst({
    where: { id: jobId, companyId, customerId },
    select: {
      id: true,
      status: true,
      handshakeVersion: true,
      handshakeFailedAttempts: true,
      handshakeLockedUntil: true,
      handshakeVerifiedAt: true,
    },
  });

  if (!job) {
    throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  }

  if (job.status !== "EN_ROUTE") {
    throw new AppError(
      "HANDSHAKE_JOB_NOT_EN_ROUTE",
      "Handshake verification is only available for jobs in EN_ROUTE status",
      422,
    );
  }

  if (job.handshakeVerifiedAt) {
    throw new AppError(
      "HANDSHAKE_ALREADY_VERIFIED",
      "Handshake has already been verified for this job",
      409,
    );
  }

  // Check lockout
  const now = new Date();
  if (job.handshakeLockedUntil && job.handshakeLockedUntil > now) {
    const lockoutMinutes = Math.ceil(
      (job.handshakeLockedUntil.getTime() - now.getTime()) / (60 * 1000),
    );
    throw new AppError(
      "HANDSHAKE_LOCKED",
      `Too many failed attempts. Try again in ${lockoutMinutes} minutes.`,
      429,
    );
  }

  // Derive expected code
  const expectedCode = deriveHandshakeCode(
    env.PORTAL_CODE_SECRET || "fallback-secret-for-testing",
    companyId,
    jobId,
    job.handshakeVersion,
  );

  if (code !== expectedCode) {
    // Increment failed attempts
    const newFailedAttempts = (job.handshakeFailedAttempts || 0) + 1;
    const lockUntil =
      newFailedAttempts >= MAX_HANDSHAKE_ATTEMPTS
        ? new Date(now.getTime() + HANDSHAKE_LOCKOUT_MINUTES * 60 * 1000)
        : null;

    await prisma.job.update({
      where: { id: jobId },
      data: {
        handshakeFailedAttempts: newFailedAttempts,
        handshakeLockedUntil: lockUntil,
      },
    });

    const remainingAttempts = MAX_HANDSHAKE_ATTEMPTS - newFailedAttempts;
    if (remainingAttempts <= 0) {
      throw new AppError(
        "HANDSHAKE_LOCKED",
        `Too many failed attempts. Try again in ${HANDSHAKE_LOCKOUT_MINUTES} minutes.`,
        429,
      );
    }

    throw new AppError(
      "HANDSHAKE_INVALID",
      `Invalid code. ${remainingAttempts} attempts remaining.`,
      401,
    );
  }

  // Code is correct - mark as verified
  await prisma.job.update({
    where: { id: jobId },
    data: {
      handshakeVerifiedAt: now,
      handshakeFailedAttempts: 0,
      handshakeLockedUntil: null,
    },
  });

  return { success: true };
}

/**
 * Override handshake verification (staff-only).
 * Requires OWNER/DISPATCHER role.
 * Bypasses code check and marks as verified.
 */
export async function overrideHandshake(
  context: AuthContext,
  jobId: string,
  reason?: string,
) {
  const job = await prisma.job.findFirst({
    where: { id: jobId, companyId: context.companyId },
    select: {
      id: true,
      status: true,
      handshakeVerifiedAt: true,
    },
  });

  if (!job) {
    throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  }

  if (job.status !== "EN_ROUTE") {
    throw new AppError(
      "HANDSHAKE_JOB_NOT_EN_ROUTE",
      "Handshake override is only available for jobs in EN_ROUTE status",
      422,
    );
  }

  if (job.handshakeVerifiedAt) {
    throw new AppError(
      "HANDSHAKE_ALREADY_VERIFIED",
      "Handshake has already been verified for this job",
      409,
    );
  }

  const now = new Date();
  await prisma.job.update({
    where: { id: jobId },
    data: {
      handshakeVerifiedAt: now,
      handshakeFailedAttempts: 0,
      handshakeLockedUntil: null,
    },
  });

  // Audit the override
  await prisma.portalAuditEvent.create({
    data: {
      companyId: context.companyId,
      jobId,
      actorUserId: context.userId,
      action: "HANDSHAKE_OVERRIDE",
      metadata: { reason: reason?.trim() || "Staff override" },
    },
  });

  return { success: true };
}

/**
 * Check if handshake is required for EN_ROUTE → IN_PROGRESS transition.
 * Returns true if handshake is required and not yet verified.
 */
export async function isHandshakeRequired(jobId: string): Promise<boolean> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      status: true,
      handshakeVerifiedAt: true,
    },
  });

  if (!job) {
    return false;
  }

  // Handshake is required for EN_ROUTE → IN_PROGRESS
  return job.status === "EN_ROUTE" && !job.handshakeVerifiedAt;
}

/**
 * Regenerate handshake code by incrementing version.
 * Staff-only. Use when customer lost their code.
 */
export async function regenerateHandshakeCode(
  context: AuthContext,
  jobId: string,
) {
  const job = await prisma.job.findFirst({
    where: { id: jobId, companyId: context.companyId },
    select: {
      id: true,
      status: true,
      handshakeVersion: true,
    },
  });

  if (!job) {
    throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  }

  if (job.status !== "EN_ROUTE") {
    throw new AppError(
      "HANDSHAKE_JOB_NOT_EN_ROUTE",
      "Handshake code regeneration is only available for jobs in EN_ROUTE status",
      422,
    );
  }

  const newVersion = (job.handshakeVersion || 0) + 1;

  await prisma.job.update({
    where: { id: jobId },
    data: {
      handshakeVersion: newVersion,
      handshakeVerifiedAt: null,
      handshakeFailedAttempts: 0,
      handshakeLockedUntil: null,
    },
  });

  // Audit the regeneration
  await prisma.portalAuditEvent.create({
    data: {
      companyId: context.companyId,
      jobId,
      actorUserId: context.userId,
      action: "HANDSHAKE_REGENERATED",
      metadata: { newVersion },
    },
  });

  return { success: true, newVersion };
}
