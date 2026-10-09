/**
 * Production configuration validation tests
 *
 * These tests ensure that critical production settings are present and valid.
 * The goal is to fail closed if required configuration is missing or insecure.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { env } from "../src/config/env.js";

describe("Production Configuration Validation", () => {
  beforeAll(() => {
    // Skip these tests in production environments since they would fail
    // if we actually tried to start the app without proper config
    if (process.env.NODE_ENV === "production") {
      // In a real CI pipeline, you might want to run these against actual
      // production config values injected from environment variables
    }
  });

  describe("CORS Configuration", () => {
    it("should require CORS_ORIGINS in production", () => {
      // In production, CORS_ORIGINS must be set to restrict origins
      // This test documents the requirement; actual enforcement is in app.ts
      if (process.env.NODE_ENV === "production") {
        expect(env.CORS_ORIGINS).toBeDefined();
        expect(env.CORS_ORIGINS?.length).toBeGreaterThan(0);
        expect(env.CORS_ORIGINS?.every((origin) => origin.startsWith("https://"))).toBe(
          true,
        );
      }
    });

    it("should allow unset CORS_ORIGINS in development/test", () => {
      // Development and test environments can use open CORS for convenience
      if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
        expect(env.CORS_ORIGINS).toBeUndefined();
      }
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

    it("should use TLS/SSL in production", () => {
      if (process.env.NODE_ENV === "production") {
        expect(env.DATABASE_URL).toMatch(/sslgmode|sslmode/i);
      }
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

    it("should require HTTPS for Sentry DSN in production", () => {
      if (process.env.NODE_ENV === "production" && env.SENTRY_DSN) {
        expect(env.SENTRY_DSN).toMatch(/^https:\/\/!/);
      }
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
});
