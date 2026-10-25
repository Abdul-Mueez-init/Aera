import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";
import { AppError } from "./errors.js";

/**
 * Architecture rule (docs/architecture.md, section 6 - Authentication):
 * "Rate-limit login." and docs/rules.md security checklist:
 * "brute-force/rate limiting present."
 *
 * Keyed by IP + email so a single attacker cannot lock out a legitimate
 * user's account for everyone else on the same network, while still
 * bounding brute-force attempts against any single account.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (request) => {
    const email =
      typeof request.body?.email === "string"
        ? request.body.email.trim().toLowerCase()
        : "unknown";
    return `${request.ip}:${email}`;
  },
  handler: (_request, _response, next) => {
    next(
      new AppError(
        "RATE_LIMITED",
        "Too many attempts. Please try again later.",
        429,
      ),
    );
  },
});

/**
 * Registration ceiling keyed by IP ONLY. authRateLimiter keys by
 * IP+email, which is right for login (no global victim lockout) but
 * means each new signup email gets a fresh bucket — one IP could
 * script unlimited account/company creation. This coarser cap sits in
 * front of /register only: 20 signups per IP per hour is far above any
 * legitimate office/NAT use and far below scripted tenant spam.
 * Skipped under NODE_ENV=test like the other IP-only limiters (the
 * suite registers many accounts from one IP).
 */
export const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test",
  handler: (_request, _response, next) => {
    next(
      new AppError(
        "RATE_LIMITED",
        "Too many signups from this network. Please try again later.",
        429,
      ),
    );
  },
});

/**
 * Invitation acceptance has no email in the request body (it is identified by
 * an opaque token), so it must NOT share authRateLimiter's `ip:email` key -
 * every request would collapse into one `ip:unknown` bucket and lock out all
 * legitimate invitees behind the same IP (office NAT, test runner, etc.).
 *
 * Keyed by IP only, deliberately not by token: keying by the submitted token
 * would hand a brute-forcer a fresh bucket per guess. Skipped under
 * NODE_ENV=test because the whole suite shares one process and one IP.
 */
export const invitationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test",
  handler: (_request, _response, next) => {
    next(
      new AppError(
        "RATE_LIMITED",
        "Too many attempts. Please try again later.",
        429,
      ),
    );
  },
});

/**
 * Password-reset limiters (OWASP API4). Keyed by IP + email, like
 * authRateLimiter, so one attacker cannot lock a real user out of recovery for
 * everyone else while a single address still cannot be flooded with codes.
 *
 * Requesting a code is capped tightly because every request can send an email.
 * Confirming is looser, but each issued code has its own 5-guess cap too
 * (modules/auth/password-reset.service.ts).
 */
function passwordResetKey(request: {
  ip?: string;
  body?: { email?: unknown };
}): string {
  const email =
    typeof request.body?.email === "string"
      ? request.body.email.trim().toLowerCase()
      : "unknown";
  return `${request.ip}:${email}`;
}

export const passwordResetRequestRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: passwordResetKey,
  handler: (_request, _response, next) => {
    next(
      new AppError(
        "RATE_LIMITED",
        "Too many attempts. Please try again later.",
        429,
      ),
    );
  },
});

export const passwordResetConfirmRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: passwordResetKey,
  handler: (_request, _response, next) => {
    next(
      new AppError(
        "RATE_LIMITED",
        "Too many attempts. Please try again later.",
        429,
      ),
    );
  },
});

/**
 * Looser limiter for refresh-token rotation, which legitimate clients call
 * far more often than login, but which is still a credential-bearing
 * endpoint worth bounding against abuse/enumeration.
 */
export const refreshRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_request, _response, next) => {
    next(
      new AppError(
        "RATE_LIMITED",
        "Too many attempts. Please try again later.",
        429,
      ),
    );
  },
});

/**
 * Phase 11: bounds AI message posting per authenticated user
 * (OWASP API4 - unrestricted resource consumption). This endpoint will
 * trigger paid LLM calls in a later slice, so it must be limited before that
 * wiring exists, not after.
 *
 * Keyed by user id (not IP): it is mounted after requireAuth, so one busy
 * office sharing an IP cannot exhaust each other's allowance.
 */
export const aiMessageRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (request) => request.auth?.userId ?? "unauthenticated",
  handler: (_request, _response, next) => {
    next(
      new AppError(
        "RATE_LIMITED",
        "Too many AI messages. Please try again shortly.",
        429,
      ),
    );
  },
});

/**
 * Customer portal rate limiters (Handoff Phase 2).
 * These protect the portal endpoints from abuse while allowing legitimate use.
 */

/**
 * Portal exchange rate limiter - protects against brute-force token guessing.
 * Keyed by IP only since the token is not yet validated.
 */
export const portalExchangeRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test",
  handler: (_request, _response, next) => {
    next(
      new AppError(
        "RATE_LIMITED",
        "Too many portal link attempts. Please try again later.",
        429,
      ),
    );
  },
});

/**
 * Portal read rate limiter - protects against enumeration/scraping.
 * Keyed by IP (session validated after).
 */
export const portalReadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test",
  handler: (_request, _response, next) => {
    next(
      new AppError(
        "RATE_LIMITED",
        "Too many portal read requests. Please try again later.",
        429,
      ),
    );
  },
});

/**
 * Portal write rate limiter - protects against mutation abuse.
 * Keyed by IP (session validated after).
 */
export const portalWriteRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test",
  handler: (_request, _response, next) => {
    next(
      new AppError(
        "RATE_LIMITED",
        "Too many portal write requests. Please try again later.",
        429,
      ),
    );
  },
});

/**
 * Handshake rate limiter - protects against code brute-forcing.
 * Keyed by userId:jobId (requires auth context).
 */
export const handshakeRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test",
  keyGenerator: (request) => {
    const userId = request.auth?.userId ?? "unauthenticated";
    const jobId = request.params.jobId ?? "unknown";
    return `${userId}:${jobId}`;
  },
  handler: (_request, _response, next) => {
    next(
      new AppError(
        "RATE_LIMITED",
        "Too many handshake attempts. Please try again later.",
        429,
      ),
    );
  },
});
