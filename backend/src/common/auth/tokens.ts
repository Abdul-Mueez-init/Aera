import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "../../config/env.js";
import type { AuthContext } from "./auth.types.js";

const secret = new TextEncoder().encode(env.JWT_SECRET);

export interface AccessTokenClaims extends AuthContext {
  sub: string;
}

export async function createAccessToken(context: AuthContext): Promise<string> {
  return new SignJWT({
    sessionId: context.sessionId,
    companyId: context.companyId,
    role: context.role,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(context.userId)
    .setIssuer(env.JWT_ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secret);
}

export async function verifyAccessToken(
  token: string,
): Promise<AuthContext | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: env.JWT_ISSUER,
    });
    const userId = payload.sub;
    const sessionId = payload.sessionId;
    const companyId = payload.companyId;
    const role = payload.role;

    if (
      typeof userId !== "string" ||
      typeof sessionId !== "string" ||
      typeof companyId !== "string" ||
      (role !== "OWNER" && role !== "DISPATCHER" && role !== "TECHNICIAN")
    ) {
      return null;
    }

    return { userId, sessionId, companyId, role };
  } catch {
    return null;
  }
}

export function createRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
