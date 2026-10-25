import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { AppError } from "../../common/errors.js";

/**
 * Generate a 256-bit random token (43 chars, base64url).
 * Used for both link tokens and session tokens.
 */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Compute SHA-256 hash of a token (hex string).
 * This is what we store in the database; plaintext tokens never leave memory.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Timing-safe comparison for derived values (e.g., handshake codes).
 * Prevents timing attacks against brute-force guessing.
 */
export function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return timingSafeEqual(aBuffer, bBuffer);
}

/**
 * Derive a 6-digit handshake code from HMAC-SHA256 (handoff 5.7):
 * code = HMAC_SHA256(secret, `${companyId}:${jobId}:${version}`)
 *          .readUInt32BE(0) % 1_000_000, zero-padded to 6 digits.
 * The code itself is never stored; it is re-derived on demand.
 * The secret must be the configured PORTAL_CODE_SECRET. There is no
 * fallback secret: an unset/empty secret is a server misconfiguration.
 */
export function deriveHandshakeCode(
  secret: string,
  companyId: string,
  jobId: string,
  version: number,
): string {
  if (!secret) {
    throw new AppError(
      "CONFIG_PORTAL_CODE_SECRET_MISSING",
      "PORTAL_CODE_SECRET is not configured on the server",
      500,
    );
  }
  const digest = createHmac("sha256", secret)
    .update(`${companyId}:${jobId}:${version}`)
    .digest();
  const code = (digest.readUInt32BE(0) % 1_000_000).toString().padStart(6, "0");
  return code;
}
