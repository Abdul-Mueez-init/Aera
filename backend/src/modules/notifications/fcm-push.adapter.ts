import { SignJWT, importPKCS8 } from "jose";
import { env } from "../../config/env.js";
import { logger } from "../../common/logger.js";
import type { PushMessage, PushPort } from "./push.port.js";

// Plain REST calls against Firebase Cloud Messaging's HTTP v1 API rather
// than the `firebase-admin` SDK: the only two calls this needs are a
// service-account OAuth2 token exchange and a single `messages:send` POST,
// both stable JSON-over-HTTP, so a heavyweight SDK dependency isn't
// warranted (rules.md §11). `jose` is already a project dependency (used
// for access-token signing in common/auth/tokens.ts) and covers the RS256
// signing this needs, so no new package is introduced.
// Docs: https://firebase.google.com/docs/cloud-messaging/migrate-v1
//       https://developers.google.com/identity/protocols/oauth2/service-account
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWT_BEARER_GRANT = "urn:ietf:params:oauth:grant-type:jwt-bearer";

// Local/dev/test environments intentionally run without Firebase
// credentials configured. Warn once (not per-send) so logs stay readable
// when a burst of notifications fires with no credentials configured.
let warnedMissingConfig = false;

// Access tokens are valid ~1 hour; cache and reuse until shortly before
// expiry instead of round-tripping to Google on every push.
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

/**
 * Clears the cached OAuth access token. Exists so tests can start from a known
 * state; the cache lives at module level, so without this a token fetched by
 * one test silently changes how many fetch calls the next test sees.
 */
export function resetFcmAccessTokenCache(): void {
  cachedAccessToken = null;
}

function isConfigured(): boolean {
  return Boolean(
    env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY,
  );
}

/**
 * Thrown when FCM reports a token as no longer valid (unregistered/app
 * uninstalled). Callers should treat this as a signal to delete the stored
 * device token, not as a transient failure to retry.
 */
export class PushTokenInvalidError extends Error {
  constructor(public readonly token: string) {
    super("Push token is no longer registered with FCM");
    this.name = "PushTokenInvalidError";
  }
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 30_000) {
    return cachedAccessToken.token;
  }

  // Service-account private keys are stored in the environment with
  // literal "\n" sequences (dotenv cannot hold real newlines cleanly);
  // restore real newlines before handing the key to jose.
  const privateKey = await importPKCS8(
    env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    "RS256",
  );

  const assertion = await new SignJWT({ scope: FCM_SCOPE })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(env.FIREBASE_CLIENT_EMAIL!)
    .setSubject(env.FIREBASE_CLIENT_EMAIL!)
    .setAudience(OAUTH_TOKEN_URL)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);

  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: JWT_BEARER_GRANT, assertion }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Firebase OAuth token exchange failed (${response.status}): ${body.slice(0, 300)}`,
    );
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = { token: data.access_token, expiresAt: now + data.expires_in * 1000 };
  return cachedAccessToken.token;
}

export const fcmPushAdapter: PushPort = {
  async send(message: PushMessage): Promise<void> {
    if (!isConfigured()) {
      if (!warnedMissingConfig) {
        logger.warn(
          "Firebase push credentials are not configured; skipping push send. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY to send real push notifications.",
        );
        warnedMissingConfig = true;
      }
      return;
    }

    const accessToken = await getAccessToken();
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token: message.token,
            notification: { title: message.title, body: message.body },
            ...(message.data ? { data: message.data } : {}),
          },
        }),
      },
    );

    if (response.ok) {
      return;
    }

    // Never log the access token or full response body verbatim
    // (rules.md §2, §6: no secrets/sensitive data in logs).
    const body = await response.text().catch(() => "");
    const errorStatus = (() => {
      try {
        return (JSON.parse(body)?.error?.status as string | undefined) ?? null;
      } catch {
        return null;
      }
    })();

    if (errorStatus === "UNREGISTERED" || errorStatus === "NOT_FOUND" || response.status === 404) {
      throw new PushTokenInvalidError(message.token);
    }

    throw new Error(`FCM send failed (${response.status}): ${body.slice(0, 300)}`);
  },
};