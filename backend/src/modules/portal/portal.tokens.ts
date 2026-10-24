import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

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
 * Derive a 6-digit handshake code from HMAC-SHA256.
 * Used for technician-customer verification.
 */
export function deriveHandshakeCode(
  secret: string,
  companyId: string,
  jobId: string,
  version: number,
): string {
  const hmac = createHash("sha256");
  hmac.update(`${companyId}:${jobId}:${version}`);
  hmac.update(secret);
  const hash = hmac.digest();
  const hashAsNumber = hash.readUInt32BE(0);
  const code = (hashAsNumber % 1_000_000).toString().padStart(6, "0");
  return code;
}
