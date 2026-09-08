import { Router } from "express";
import { z } from "zod";
import { getPublicPortal, submitPublicReview } from "./portal.service.js";

const router = Router();

router.get("/:token", async (request, response) => {
  const token = Array.isArray(request.params.token)
    ? request.params.token[0]
    : request.params.token;
  response.status(200).json({ data: await getPublicPortal(token) });
});

router.post("/:token/reviews", async (request, response) => {
  const parsed = z
    .object({
      jobId: z.string().uuid(),
      rating: z.number().int().min(1).max(5),
      comment: z.string().trim().max(2000).optional(),
    })
    .safeParse(request.body);
  if (!parsed.success) {
    response.status(422).json({
      error: {
        code: "VALIDATION_FAILED",
        message: parsed.error.issues.map((issue) => issue.message).join(", "),
      },
    });
    return;
  }
  const token = Array.isArray(request.params.token)
    ? request.params.token[0]
    : request.params.token;
  response.status(201).json({
    data: await submitPublicReview(
      token,
      parsed.data.jobId,
      parsed.data.rating,
      parsed.data.comment,
    ),
  });
});

export { router as portalRouter };
