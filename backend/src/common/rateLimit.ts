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