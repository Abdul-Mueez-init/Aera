import rateLimit from "express-rate-limit";
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