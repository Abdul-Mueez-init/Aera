import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../common/auth/auth.middleware.js";
import { verifyAccessToken } from "../../common/auth/tokens.js";
import {
  authRateLimiter,
  invitationRateLimiter,
  passwordResetConfirmRateLimiter,
  passwordResetRequestRateLimiter,
  refreshRateLimiter,
} from "../../common/rateLimit.js";
import {
  acceptInvitationAndLogin,
  getCurrentUser,
  login,
  register,
  revokeRefreshSession,
  revokeSessionById,
  rotateRefreshSession,
} from "./auth.service.js";
import {
  requestPasswordReset,
  resetPassword,
} from "./password-reset.service.js";

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  companyName: z.string().trim().min(1).max(120),
  companySlug: z.string().trim().min(1).max(60).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const acceptInvitationSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(12),
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().email(),
});

const resetPasswordSchema = z.object({
  email: z.string().trim().email(),
  code: z.string().trim().min(1).max(64),
  password: z.string().min(12),
});

function validationError(error: z.ZodError) {
  return {
    error: {
      code: "VALIDATION_FAILED",
      message: error.issues.map((issue) => issue.message).join(", "),
    },
  };
}

router.post("/register", authRateLimiter, async (request, response) => {
  const parsed = registerSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(422).json(validationError(parsed.error));
    return;
  }

  const result = await register(parsed.data);
  response.status(201).json({ data: result });
});

router.post("/login", authRateLimiter, async (request, response) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(422).json(validationError(parsed.error));
    return;
  }

  const result = await login(parsed.data);
  response.status(200).json({ data: result });
});

router.post("/refresh", refreshRateLimiter, async (request, response) => {
  const parsed = refreshSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(422).json(validationError(parsed.error));
    return;
  }

  const result = await rotateRefreshSession(parsed.data.refreshToken);
  response.status(200).json({ data: result });
});

router.post(
  "/accept-invitation",
  invitationRateLimiter,
  async (request, response) => {
    const parsed = acceptInvitationSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(422).json(validationError(parsed.error));
      return;
    }

    const result = await acceptInvitationAndLogin(
      parsed.data.token,
      parsed.data.password,
    );
    response.status(200).json({ data: result });
  },
);

// Always answers 200 with the same body, whether or not the email has an
// account, so this cannot be used to discover who is registered.
router.post(
  "/forgot-password",
  passwordResetRequestRateLimiter,
  async (request, response) => {
    const parsed = forgotPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(422).json(validationError(parsed.error));
      return;
    }

    await requestPasswordReset(parsed.data.email);
    response.status(200).json({
      data: {
        message:
          "If an account exists for that email, a reset code is on its way.",
      },
    });
  },
);

router.post(
  "/reset-password",
  passwordResetConfirmRateLimiter,
  async (request, response) => {
    const parsed = resetPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(422).json(validationError(parsed.error));
      return;
    }

    await resetPassword(parsed.data);
    response.status(200).json({ data: { reset: true } });
  },
);

router.post("/logout", async (request, response) => {
  const authorization = request.header("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : undefined;
  if (token) {
    const auth = await verifyAccessToken(token);
    if (auth?.sessionId) {
      await revokeSessionById(auth.sessionId);
    }
  }

  const parsed = refreshSchema.safeParse(request.body);
  if (parsed.success) {
    await revokeRefreshSession(parsed.data.refreshToken);
  }
  response.status(204).send();
});

router.get("/me", requireAuth, async (request, response) => {
  const result = await getCurrentUser(request.auth!);
  response.status(200).json({ data: result });
});

export { router as authRouter };
