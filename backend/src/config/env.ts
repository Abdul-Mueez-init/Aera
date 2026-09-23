import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.string().default("info"),
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().default("aera-api"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  SUPABASE_JOB_PHOTOS_BUCKET: z.string().trim().min(1).default("job-photos"),
  // Phase 10 Slice D — email adapter (Resend: https://resend.com).
  // Left unset in local/dev/test: resend-email.adapter.ts skips sending and
  // logs a warning instead of failing, so no key is required to run the app
  // or test suite. Set it to send real email.
  RESEND_API_KEY: z.string().min(1).optional(),
  // Resend's shared sandbox sender works without domain verification; swap
  // to a verified sending domain before relying on this in production.
  RESEND_FROM_EMAIL: z
    .string()
    .trim()
    .min(1)
    .default("Aera <onboarding@resend.dev>"),
  // Phase 10 Slice E — push adapter (Firebase Cloud Messaging, HTTP v1 API).
  // All three come from one Firebase service-account JSON key. Left unset
  // in local/dev/test: fcm-push.adapter.ts skips sending and logs a warning
  // instead of failing, so no credentials are required to run the app or
  // test suite. Set them to send real push notifications.
  FIREBASE_PROJECT_ID: z.string().trim().min(1).optional(),
  FIREBASE_CLIENT_EMAIL: z.string().trim().min(1).optional(),
  // Keep the literal "\n" sequences from the downloaded JSON key when
  // pasting this into .env — fcm-push.adapter.ts restores real newlines
  // before using the key.
  FIREBASE_PRIVATE_KEY: z.string().min(1).optional(),
  // Phase 10 Slice F — SMS adapter (textbee.dev — Android SMS gateway).
  // Left unset in local/dev/test: textbee-sms.adapter.ts skips sending and
  // logs a warning instead of failing, so no key is required to run the app
  // or test suite. Set it to send real SMS. Requires a registered Android
  // gateway device (the textbee app) to be online — the free tier is
  // account-wide (one API key), not per-number.
  TEXTBEE_API_KEY: z.string().min(1).optional(),
  // Phase 10 Slice G — scheduled invoice reminders (in-process scheduler).
  INVOICE_REMINDERS_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  INVOICE_REMINDER_SWEEP_MINUTES: z.coerce
    .number()
    .int()
    .positive()
    .default(60),
  // Minimum gap between two reminders for the same invoice.
  INVOICE_REMINDER_INTERVAL_DAYS: z.coerce.number().int().positive().default(3),
  // Used only for invoices with no dueAt: due = issuedAt + this many days.
  INVOICE_PAYMENT_TERMS_DAYS: z.coerce.number().int().positive().default(14),
  // Phase 11 Slice D — AI gateway (Google Gemini, generativelanguage.googleapis.com).
  // Left unset in local/dev/test: gemini.client.ts skips the model call and
  // logs a warning instead of failing, so no key is required to run the app
  // or test suite (the user message still gets saved; assistantMessage is
  // null). Set it to get real AI replies.
  // Get a free key at https://aistudio.google.com/apikey — no credit card.
  GEMINI_API_KEY: z.string().min(1).optional(),
  // gemini-3.1-flash-lite has been the stable, free-tier-eligible Gemini 3
  // model since 7 May 2026 (the Gemini 2.5 line — flash, flash-lite, pro —
  // is scheduled for shutdown 16 October 2026, so it is deliberately not
  // the default here). Override for a different model without a code change.
  GEMINI_MODEL: z.string().trim().min(1).default("gemini-3.1-flash-lite"),
  // Hard cap on tool-call round trips within a single AI turn (rules.md:
  // "no endpoint returns unbounded collections" — this is the AI-turn
  // analogue). Reaching the cap degrades to an honest "couldn't finish"
  // message rather than looping forever against the model API.
  AI_MAX_TOOL_ITERATIONS: z.coerce.number().int().positive().max(10).default(4),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "Invalid environment configuration:",
    parsed.error.flatten().fieldErrors,
  );
  throw new Error("Invalid environment configuration");
}

export const env = parsed.data;
