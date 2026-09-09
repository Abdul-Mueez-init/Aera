import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../common/auth/auth.middleware.js";
import { authRateLimiter, refreshRateLimiter } from "../../common/rateLimit.js";
import {
  acceptInvitationAndLogin,
  getCurrentUser,
  login,
  register,
  revokeRefreshSession,
  rotateRefreshSession,
} from "./auth.service.js";

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
  authRateLimiter,
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

router.post("/logout", async (request, response) => {
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