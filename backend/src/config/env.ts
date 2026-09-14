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
  RESEND_FROM_EMAIL: z.string().trim().min(1).default("Aera <onboarding@resend.dev>"),
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