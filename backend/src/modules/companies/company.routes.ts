import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../common/auth/auth.middleware.js";
import { AppError } from "../../common/errors.js";
import { prisma } from "../../db/prisma.js";

const router = Router();

const createCompanySchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(60).optional(),
  timezone: z.string().trim().min(1).max(80).default("UTC"),
  defaultCurrency: z.string().trim().length(3).toUpperCase().default("USD"),
});

function createSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

router.post(
  "/",
  requireAuth,
  requireRole("OWNER"),
  async (request, response) => {
    const parsed = createCompanySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(422).json({
        error: {
          code: "VALIDATION_FAILED",
          message: parsed.error.issues.map((issue) => issue.message).join(", "),
        },
      });
      return;
    }

    try {
      const result = await prisma.$transaction(async (transaction) => {
        const company = await transaction.company.create({
          data: {
            name: parsed.data.name,
            slug: createSlug(parsed.data.slug ?? parsed.data.name),
            timezone: parsed.data.timezone,
            defaultCurrency: parsed.data.defaultCurrency,
          },
        });
        await transaction.companyMember.create({
          data: {
            companyId: company.id,
            userId: request.auth!.userId,
            role: "OWNER",
            status: "ACTIVE",
          },
        });
        return company;
      });

      response.status(201).json({
        data: {
          id: result.id,
          name: result.name,
          slug: result.slug,
          timezone: result.timezone,
          defaultCurrency: result.defaultCurrency,
        },
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        throw new AppError(
          "COMPANY_ALREADY_EXISTS",
          "Company slug already exists",
          409,
        );
      }
      throw error;
    }
  },
);

router.get("/:companyId", requireAuth, async (request, response) => {
  const companyId = Array.isArray(request.params.companyId)
    ? request.params.companyId[0]
    : request.params.companyId;
  const company = await prisma.company.findFirst({
    where: {
      id: companyId,
      memberships: {
        some: {
          userId: request.auth!.userId,
          status: "ACTIVE",
        },
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
      timezone: true,
      defaultCurrency: true,
    },
  });

  if (!company) {
    throw new AppError("TENANT_ACCESS_DENIED", "Company access denied", 403);
  }

  response.status(200).json({ data: company });
});

export { router as companyRouter };
