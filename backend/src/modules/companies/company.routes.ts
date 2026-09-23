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

import {
  listMembers,
  inviteMember,
  updateMember,
  removeMember,
} from "./member.service.js";

const inviteSchema = z.object({
  email: z.string().trim().email(),
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  role: z.enum(["OWNER", "DISPATCHER", "TECHNICIAN"]),
});

const updateMemberSchema = z
  .object({
    role: z.enum(["OWNER", "DISPATCHER", "TECHNICIAN"]).optional(),
    status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
  })
  .refine((data) => data.role !== undefined || data.status !== undefined, {
    message: "Either role or status must be provided",
  });

router.get(
  "/current/members",
  requireAuth,
  requireRole("OWNER", "DISPATCHER"),
  async (request, response) => {
    const members = await listMembers(request.auth!);
    response.status(200).json({ data: members });
  },
);

router.post(
  "/current/invitations",
  requireAuth,
  requireRole("OWNER"),
  async (request, response) => {
    const parsed = inviteSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(422).json({
        error: {
          code: "VALIDATION_FAILED",
          message: parsed.error.issues.map((i) => i.message).join(", "),
        },
      });
      return;
    }
    const member = await inviteMember(request.auth!, parsed.data);
    response.status(201).json({ data: member });
  },
);

router.patch(
  "/current/members/:memberId",
  requireAuth,
  requireRole("OWNER"),
  async (request, response) => {
    const parsed = updateMemberSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(422).json({
        error: {
          code: "VALIDATION_FAILED",
          message: parsed.error.issues.map((i) => i.message).join(", "),
        },
      });
      return;
    }
    const memberId = Array.isArray(request.params.memberId)
      ? request.params.memberId[0]
      : request.params.memberId;
    const member = await updateMember(request.auth!, memberId, parsed.data);
    response.status(200).json({ data: member });
  },
);

router.delete(
  "/current/members/:memberId",
  requireAuth,
  requireRole("OWNER"),
  async (request, response) => {
    const memberId = Array.isArray(request.params.memberId)
      ? request.params.memberId[0]
      : request.params.memberId;
    const result = await removeMember(request.auth!, memberId);
    response.status(200).json({ data: result });
  },
);

router.get("/:companyId", requireAuth, async (request, response) => {
  const companyId = Array.isArray(request.params.companyId)
    ? request.params.companyId[0]
    : request.params.companyId;

  if (companyId !== request.auth!.companyId) {
    throw new AppError("TENANT_ACCESS_DENIED", "Company access denied", 403);
  }

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
