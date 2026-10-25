/**
 * Production configuration validation tests
 *
 * These tests ensure that critical production settings are present and valid.
 * The goal is to fail closed if required configuration is missing or insecure.
 *
 * The production/staging enforcement tests are REAL: they stub process.env,
 * reset the module registry and dynamically re-import src/config/env.ts, so
 * the Zod schema (including its production superRefine) actually runs against
 * the stubbed environment. (The previous versions wrapped their assertions in
 * `if (process.env.NODE_ENV === "production")`, which never executes under
 * `NODE_ENV=test`, so they asserted nothing.)
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { env } from "../src/config/env.js";

describe("Production Configuration Validation", () => {
  describe("CORS Configuration", () => {
    it("should allow unset CORS_ORIGINS in development/test", () => {
      // Development and test environments can use open CORS for convenience.
      // (Boot-time enforcement for production/staging is covered by the
      // dynamic-import suite below.)
      expect(
        env.CORS_ORIGINS === undefined || Array.isArray(env.CORS_ORIGINS),
      ).toBe(true);
    });
  });

  describe("Database Configuration", () => {
    it("should have DATABASE_URL set", () => {
      expect(env.DATABASE_URL).toBeDefined();
      expect(env.DATABASE_URL).toMatch(/^(postgresql|https?):\/\//);
    });

    it("should have DIRECT_URL set", () => {
      expect(env.DIRECT_URL).toBeDefined();
      expect(env.DIRECT_URL).toMatch(/^(postgresql|https?):\/\//);
    });
  });

  describe("Authentication Configuration", () => {
    it("should have JWT_SECRET set and meet minimum length", () => {
      expect(env.JWT_SECRET).toBeDefined();
      expect(env.JWT_SECRET.length).toBeGreaterThanOrEqual(32);
    });

    it("should have reasonable token TTL values", () => {
      expect(env.ACCESS_TOKEN_TTL_SECONDS).toBeGreaterThan(0);
      expect(env.ACCESS_TOKEN_TTL_SECONDS).toBeLessThanOrEqual(3600); // Max 1 hour
      expect(env.REFRESH_TOKEN_TTL_DAYS).toBeGreaterThan(0);
      expect(env.REFRESH_TOKEN_TTL_DAYS).toBeLessThanOrEqual(365); // Max 1 year
    });
  });

  describe("Supabase Configuration", () => {
    it("should have SUPABASE_URL set", () => {
      expect(env.SUPABASE_URL).toBeDefined();
      expect(env.SUPABASE_URL).toMatch(/^https?:\/\//);
    });

    it("should have SUPABASE_SERVICE_ROLE_KEY set and meet minimum length", () => {
      expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeDefined();
      expect(env.SUPABASE_SERVICE_ROLE_KEY.length).toBeGreaterThanOrEqual(20);
    });

    it("should have SUPABASE_JOB_PHOTOS_BUCKET set", () => {
      expect(env.SUPABASE_JOB_PHOTOS_BUCKET).toBeDefined();
      expect(env.SUPABASE_JOB_PHOTOS_BUCKET.length).toBeGreaterThan(0);
    });
  });

  describe("Optional Integration Configuration", () => {
    it("should allow optional keys to be unset in development/test", () => {
      // These keys are optional for local development - they may be set
      // in the local .env file but the app should work without them
      // The adapters check for these keys and skip sending if unset
      const optionalKeys = [
        env.RESEND_API_KEY,
        env.FIREBASE_PROJECT_ID,
        env.FIREBASE_CLIENT_EMAIL,
        env.FIREBASE_PRIVATE_KEY,
        env.TEXTBEE_API_KEY,
        env.GEMINI_API_KEY,
        env.SENTRY_DSN,
      ];
      // Just verify they're either undefined or strings - type validation
      optionalKeys.forEach((key) => {
        expect(key === undefined || typeof key === "string").toBe(true);
      });
    });
  });

  describe("AI Configuration", () => {
    it("should have AI_MAX_TOOL_ITERATIONS set and within safe bounds", () => {
      expect(env.AI_MAX_TOOL_ITERATIONS).toBeDefined();
      expect(env.AI_MAX_TOOL_ITERATIONS).toBeGreaterThan(0);
      expect(env.AI_MAX_TOOL_ITERATIONS).toBeLessThanOrEqual(10);
    });

    it("should have GEMINI_MODEL set to a valid value", () => {
      expect(env.GEMINI_MODEL).toBeDefined();
      expect(env.GEMINI_MODEL.length).toBeGreaterThan(0);
    });
  });

  describe("Invoice Reminder Configuration", () => {
    it("should have invoice reminder configuration set", () => {
      expect(env.INVOICE_REMINDERS_ENABLED).toBeDefined();
      expect(typeof env.INVOICE_REMINDERS_ENABLED).toBe("boolean");
      expect(env.INVOICE_REMINDER_SWEEP_MINUTES).toBeGreaterThan(0);
      expect(env.INVOICE_REMINDER_INTERVAL_DAYS).toBeGreaterThan(0);
      expect(env.INVOICE_PAYMENT_TERMS_DAYS).toBeGreaterThan(0);
    });
  });

  describe("Sentry Configuration", () => {
    it("should have traces sample rate within valid range", () => {
      expect(env.SENTRY_TRACES_SAMPLE_RATE).toBeGreaterThanOrEqual(0);
      expect(env.SENTRY_TRACES_SAMPLE_RATE).toBeLessThanOrEqual(1);
    });
  });

  describe("Portal Configuration", () => {
    it("should have portal configuration set", () => {
      expect(env.PORTAL_LINK_UNUSED_TTL_HOURS).toBeGreaterThan(0);
      expect(env.PORTAL_SESSION_IDLE_DAYS).toBeGreaterThan(0);
      expect(env.PORTAL_SESSION_MAX_DAYS).toBeGreaterThan(0);
      expect(env.PORTAL_POST_COMPLETION_MAX_DAYS).toBeGreaterThan(0);
      expect(env.PORTAL_SWEEP_MINUTES).toBeGreaterThan(0);
      expect(env.HANDSHAKE_MAX_ATTEMPTS).toBeGreaterThan(0);
      expect(env.HANDSHAKE_LOCK_MINUTES).toBeGreaterThan(0);
    });
  });
});

/**
 * Boot-time enforcement: re-import env.ts with a fully stubbed environment.
 * The base record below satisfies every always-required variable, so the
 * ONLY reason a load can fail is the variable under test.
 */
// Dummy secrets are built with String.repeat so no credential-shaped
// literal ever lands in the repo.
const VALID_DEPLOY_ENV: Record<string, string> = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/aera",
  DIRECT_URL: "postgresql://user:pass@localhost:5432/aera",
  JWT_SECRET: "j".repeat(40),
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key-0000000000",
  PORTAL_PUBLIC_BASE_URL: "https://portal.quantixlabs.live",
  PORTAL_CODE_SECRET: "p".repeat(40),
  CORS_ORIGINS: "https://portal.quantixlabs.live",
};

async function loadEnvWith(
  overrides: Record<string, string | undefined>,
): Promise<typeof env> {
  const saved = { ...process.env };
  vi.resetModules();
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    const mod = await import("../src/config/env.js");
    return mod.env;
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in saved)) delete process.env[key];
    }
    Object.assign(process.env, saved);
    vi.resetModules();
  }
}

describe("Production/staging boot-time env enforcement", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    // env.ts console.errors the validation failure before throwing; keep the
    // test output readable.
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterAll(() => {
    errorSpy.mockRestore();
  });

  for (const nodeEnv of ["production", "staging"] as const) {
    describe(`NODE_ENV=${nodeEnv}`, () => {
      const base = { ...VALID_DEPLOY_ENV, NODE_ENV: nodeEnv };

      it("boots when PORTAL_PUBLIC_BASE_URL, PORTAL_CODE_SECRET and CORS_ORIGINS are all set", async () => {
        const loaded = await loadEnvWith(base);
        expect(loaded.PORTAL_PUBLIC_BASE_URL).toBe(
          "https://portal.quantixlabs.live",
        );
        expect(loaded.PORTAL_CODE_SECRET).toBe(
          VALID_DEPLOY_ENV.PORTAL_CODE_SECRET,
        );
        expect(loaded.CORS_ORIGINS).toEqual([
          "https://portal.quantixlabs.live",
        ]);
      });

      it("fails to boot without PORTAL_PUBLIC_BASE_URL", async () => {
        await expect(
          loadEnvWith({ ...base, PORTAL_PUBLIC_BASE_URL: undefined }),
        ).rejects.toThrow("Invalid environment configuration");
      });

      it("fails to boot when PORTAL_PUBLIC_BASE_URL is not https", async () => {
        await expect(
          loadEnvWith({
            ...base,
            PORTAL_PUBLIC_BASE_URL: "http://portal.quantixlabs.live",
          }),
        ).rejects.toThrow("Invalid environment configuration");
      });

      it("fails to boot without PORTAL_CODE_SECRET", async () => {
        await expect(
          loadEnvWith({ ...base, PORTAL_CODE_SECRET: undefined }),
        ).rejects.toThrow("Invalid environment configuration");
      });

      it("fails to boot when PORTAL_CODE_SECRET is shorter than 32 chars", async () => {
        await expect(
          loadEnvWith({ ...base, PORTAL_CODE_SECRET: "too-short-secret" }),
        ).rejects.toThrow("Invalid environment configuration");
      });

      it("fails to boot when PORTAL_CODE_SECRET equals JWT_SECRET", async () => {
        await expect(
          loadEnvWith({
            ...base,
            PORTAL_CODE_SECRET: VALID_DEPLOY_ENV.JWT_SECRET,
          }),
        ).rejects.toThrow("Invalid environment configuration");
      });

      it("fails to boot without CORS_ORIGINS", async () => {
        await expect(
          loadEnvWith({ ...base, CORS_ORIGINS: undefined }),
        ).rejects.toThrow("Invalid environment configuration");
      });

      it("fails to boot when CORS_ORIGINS is empty", async () => {
        await expect(
          loadEnvWith({ ...base, CORS_ORIGINS: "" }),
        ).rejects.toThrow("Invalid environment configuration");
      });
    });
  }

  it("stays permissive in test env: portal vars may be unset", async () => {
    const loaded = await loadEnvWith({
      ...VALID_DEPLOY_ENV,
      NODE_ENV: "test",
      PORTAL_PUBLIC_BASE_URL: undefined,
      PORTAL_CODE_SECRET: undefined,
      CORS_ORIGINS: undefined,
    });
    expect(loaded.PORTAL_PUBLIC_BASE_URL).toBeUndefined();
    expect(loaded.PORTAL_CODE_SECRET).toBeUndefined();
    expect(loaded.CORS_ORIGINS).toBeUndefined();
  });
});
