import type { Request, Response } from "express";
import { env } from "../../config/env.js";
import { AppError } from "../../common/errors.js";
import { prisma } from "../../db/prisma.js";
import { generateToken, hashToken } from "./portal.tokens.js";
import { getCompanyContacts } from "./portal.contacts.js";

/**
 * Portal session cookie name.
 * __Host- prefix ensures the cookie is only sent from the exact host
 * (not subdomains) and requires Secure + SameSite=Strict.
 */
const PORTAL_COOKIE_NAME = "__Host-aera_portal";

/**
 * Parse the portal session token from a request.
 * Checks Authorization: Bearer header first, then cookie.
 */
export function getPortalSessionToken(request: Request): string | null {
  // Check Authorization header first (mobile bearer tokens)
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  // Fall back to cookie (web sessions)
  const cookieHeader = request.headers.cookie;
  if (cookieHeader) {
    const cookies = cookieHeader.split(";").map((c) => c.trim());
    for (const cookie of cookies) {
      if (cookie.startsWith(`${PORTAL_COOKIE_NAME}=`)) {
        return cookie.slice(PORTAL_COOKIE_NAME.length + 1);
      }
    }
  }

  return null;
}

/**
 * Set the portal session cookie on a response.
 * HttpOnly, Secure, SameSite=Strict, Path=/, no Domain.
 */
export function setPortalSessionCookie(
  response: Response,
  token: string,
): void {
  response.cookie(PORTAL_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: env.PORTAL_SESSION_MAX_DAYS * 24 * 60 * 60 * 1000,
  });
}

/**
 * Clear the portal session cookie from a response.
 */
export function clearPortalSessionCookie(response: Response): void {
  response.clearCookie(PORTAL_COOKIE_NAME, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
  });
}

type PrismaLike =
  typeof prisma | Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Create a new portal session.
 * Returns the plaintext session token (for immediate use) and the session record.
 * Pass a transaction client as `db` to create the session atomically with
 * the caller's other writes (the exchange flow relies on this: if session
 * creation fails, the link burn rolls back with it).
 */
export async function createPortalSession(
  grantId: string,
  userAgent?: string,
  db: PrismaLike = prisma,
) {
  const sessionToken = generateToken();
  const sessionTokenHash = hashToken(sessionToken);

  // Hash user agent for device fingerprinting (optional, for security analysis)
  const userAgentHash = userAgent ? hashToken(userAgent) : null;

  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + env.PORTAL_SESSION_MAX_DAYS * 24 * 60 * 60 * 1000,
  );

  // First, get the grant to fetch companyId, customerId, jobId
  const grant = await db.portalAccessGrant.findFirst({
    where: { id: grantId },
    select: { companyId: true, customerId: true, jobId: true },
  });

  if (!grant) {
    throw new Error("Grant not found");
  }

  const session = await db.portalSession.create({
    data: {
      grantId,
      companyId: grant.companyId,
      customerId: grant.customerId,
      jobId: grant.jobId,
      sessionTokenHash,
      userAgentHash,
      expiresAt,
      lastSeenAt: now,
    },
    select: {
      id: true,
      companyId: true,
      customerId: true,
      jobId: true,
      expiresAt: true,
    },
  });

  return { sessionToken, session };
}

/**
 * Validate a portal session and load its associated grant.
 * Throws if the session is invalid, expired, revoked, or the grant is deactivated.
 */
export async function validatePortalSession(sessionToken: string): Promise<{
  sessionId: string;
  grantId: string;
  companyId: string;
  customerId: string;
  jobId: string;
  expiresAt: Date;
}> {
  const sessionTokenHash = hashToken(sessionToken);

  const session = await prisma.portalSession.findUnique({
    where: { sessionTokenHash },
    include: {
      grant: {
        select: {
          id: true,
          status: true,
          deactivatedAt: true,
          deactivatedReason: true,
          companyId: true,
          customerId: true,
          jobId: true,
        },
      },
    },
  });

  if (!session) {
    throw new AppError("PORTAL_SESSION_INVALID", "Invalid portal session", 401);
  }

  if (session.revokedAt || session.grant.status === "DEACTIVATED") {
    const contacts = await getCompanyContacts(session.companyId);
    throw new AppError(
      "PORTAL_ACCESS_DEACTIVATED",
      "Portal access has been deactivated",
      410,
      { state: "DEACTIVATED", ...contacts },
    );
  }

  // Defence in depth: archiving a customer deactivates their grants,
  // but a session must also die here if the customer is no longer
  // ACTIVE for any other reason (e.g. archived before that cleanup
  // existed, or archived through a different path).
  const customer = await prisma.customer.findFirst({
    where: { id: session.customerId, companyId: session.companyId },
    select: { status: true },
  });
  if (!customer || customer.status !== "ACTIVE") {
    const contacts = await getCompanyContacts(session.companyId);
    throw new AppError(
      "PORTAL_ACCESS_DEACTIVATED",
      "Portal access has been deactivated",
      410,
      { state: "DEACTIVATED", ...contacts },
    );
  }

  const now = new Date();
  if (session.expiresAt <= now) {
    // The expired-session response carries the company contact payload so
    // the closed screen can show the customer who to contact.
    const contacts = await getCompanyContacts(session.companyId);
    throw new AppError(
      "PORTAL_SESSION_EXPIRED",
      "Portal session has expired",
      401,
      {
        state: "EXPIRED",
        ...contacts,
      },
    );
  }

  // Check idle timeout
  const idleMs = now.getTime() - session.lastSeenAt.getTime();
  const idleDays = idleMs / (24 * 60 * 60 * 1000);
  if (idleDays >= env.PORTAL_SESSION_IDLE_DAYS) {
    const contacts = await getCompanyContacts(session.companyId);
    throw new AppError(
      "PORTAL_SESSION_EXPIRED",
      "Portal session has expired due to inactivity",
      401,
      { state: "EXPIRED", ...contacts },
    );
  }

  // Update lastSeenAt only if older than 5 minutes (avoid write per request)
  const fiveMinutesMs = 5 * 60 * 1000;
  if (idleMs > fiveMinutesMs) {
    await prisma.portalSession.update({
      where: { id: session.id },
      data: { lastSeenAt: now },
    });
  }

  return {
    sessionId: session.id,
    grantId: session.grantId,
    companyId: session.grant.companyId,
    customerId: session.grant.customerId,
    jobId: session.grant.jobId,
    expiresAt: session.expiresAt,
  };
}

/**
 * Revoke a portal session.
 */
export async function revokePortalSession(sessionId: string): Promise<void> {
  await prisma.portalSession.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });
}

/**
 * Revoke all sessions for a grant.
 */
export async function revokeAllSessionsForGrant(
  grantId: string,
): Promise<void> {
  await prisma.portalSession.updateMany({
    where: { grantId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
