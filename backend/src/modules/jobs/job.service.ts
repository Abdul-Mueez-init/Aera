import { AppError } from "../../common/errors.js";
import type { AuthContext } from "../../common/auth/auth.types.js";
import { prisma } from "../../db/prisma.js";
import { notificationPublisher } from "../notifications/notification.port.js";
import { supabaseStorageAdapter } from "../../common/storage/supabase-storage.adapter.js";
import type { SignedUploadResult } from "../../common/storage/storage.port.js";
import {
  assertCanAddJobNote,
  assertCanExecuteJobWork,
  assertCanTransitionJob,
  assertCanViewJob,
} from "./job.policy.js";
import { generateInvoiceFromJob } from "../invoices/invoice.service.js";
import { getNextJobNumber } from "../../common/counters/counter.service.js";

export type JobStatusValue =
  | "NEW"
  | "QUOTING"
  | "SCHEDULED"
  | "EN_ROUTE"
  | "IN_PROGRESS"
  | "WAITING_PARTS"
  | "COMPLETED"
  | "CANCELLED";
export type JobPriorityValue = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type NoteVisibilityValue = "INTERNAL" | "CUSTOMER";
export type JobPhotoKindValue = "BEFORE" | "AFTER" | "OTHER";

export interface JobInput {
  customerId: string;
  serviceAddressId: string;
  serviceType: string;
  problemDescription: string;
  priority?: JobPriorityValue;
}

export interface JobFilters {
  page: number;
  pageSize: number;
  status?: JobStatusValue;
  priority?: JobPriorityValue;
}

export interface JobPhotoInput {
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  kind: JobPhotoKindValue;
  caption?: string;
}

export interface JobPartInput {
  name: string;
  quantity: number;
  unitPriceMinor: number;
  currency: string;
}

const transitions: Record<JobStatusValue, readonly JobStatusValue[]> = {
  NEW: ["QUOTING", "SCHEDULED", "CANCELLED"],
  QUOTING: ["NEW", "SCHEDULED", "CANCELLED"],
  SCHEDULED: ["EN_ROUTE", "CANCELLED"],
  EN_ROUTE: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["WAITING_PARTS", "COMPLETED", "CANCELLED"],
  WAITING_PARTS: ["IN_PROGRESS", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

function jsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, nestedValue: unknown) =>
      typeof nestedValue === "bigint" ? nestedValue.toString() : nestedValue,
    ),
  ) as T;
}

function jobAccessWhere(context: AuthContext) {
  return {
    companyId: context.companyId,
    ...(context.role === "TECHNICIAN"
      ? { assignedTechnicianId: context.userId }
      : {}),
  };
}

function jobSelect() {
  return {
    id: true,
    companyId: true,
    jobNumber: true,
    serviceType: true,
    problemDescription: true,
    priority: true,
    status: true,
    scheduledStart: true,
    scheduledEnd: true,
    startedAt: true,
    completedAt: true,
    completionSummary: true,
    createdAt: true,
    updatedAt: true,
    customer: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
      },
    },
    serviceAddress: {
      select: {
        id: true,
        label: true,
        line1: true,
        line2: true,
        city: true,
        region: true,
        postalCode: true,
        countryCode: true,
      },
    },
    assignedTechnician: {
      select: { id: true, firstName: true, lastName: true, email: true },
    },
  } as const;
}

async function assertJobReferences(companyId: string, input: JobInput) {
  const address = await prisma.serviceAddress.findFirst({
    where: {
      id: input.serviceAddressId,
      companyId,
      customerId: input.customerId,
      customer: { status: "ACTIVE" },
    },
    select: { id: true },
  });

  if (!address) {
    throw new AppError(
      "JOB_INVALID_REFERENCES",
      "Customer and service address must belong to the company",
      422,
    );
  }
}

export async function listJobs(context: AuthContext, filters: JobFilters) {
  const where = {
    ...jobAccessWhere(context),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
  };
  const skip = (filters.page - 1) * filters.pageSize;
  const [items, total] = await prisma.$transaction([
    prisma.job.findMany({
      where,
      select: jobSelect(),
      orderBy: [{ scheduledStart: "asc" }, { createdAt: "desc" }],
      skip,
      take: filters.pageSize,
    }),
    prisma.job.count({ where }),
  ]);

  return {
    items,
    meta: {
      page: filters.page,
      pageSize: filters.pageSize,
      total,
      pageCount: Math.ceil(total / filters.pageSize),
    },
  };
}

export async function createJob(context: AuthContext, input: JobInput) {
  await assertJobReferences(context.companyId, input);

  return prisma.$transaction(async (transaction) => {
    const jobNumber = await getNextJobNumber(context.companyId, transaction);
    const job = await transaction.job.create({
      data: {
        companyId: context.companyId,
        customerId: input.customerId,
        serviceAddressId: input.serviceAddressId,
        jobNumber,
        serviceType: input.serviceType.trim(),
        problemDescription: input.problemDescription.trim(),
        priority: input.priority ?? "NORMAL",
      },
      select: jobSelect(),
    });
    await transaction.jobStatusHistory.create({
      data: {
        companyId: context.companyId,
        jobId: job.id,
        actorUserId: context.userId,
        toStatus: "NEW",
      },
    });
    return job;
  });
}

export async function getJob(context: AuthContext, jobId: string) {
  const jobMeta = await prisma.job.findFirst({
    where: { id: jobId, companyId: context.companyId },
    select: { id: true, companyId: true, assignedTechnicianId: true },
  });

  if (!jobMeta) {
    throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  }

  assertCanViewJob(context, jobMeta);

  const job = await prisma.job.findFirst({
    where: { id: jobId, companyId: context.companyId },
    select: {
      ...jobSelect(),
      statusHistory: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          reason: true,
          createdAt: true,
          actor: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      notes: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          body: true,
          visibility: true,
          createdAt: true,
          updatedAt: true,
          author: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      photos: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          objectKey: true,
          mimeType: true,
          sizeBytes: true,
          kind: true,
          caption: true,
          createdAt: true,
          uploader: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      parts: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          quantity: true,
          unitPriceMinor: true,
          currency: true,
          createdAt: true,
        },
      },
      invoices: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          subtotalMinor: true,
          discountMinor: true,
          taxMinor: true,
          totalMinor: true,
          amountPaidMinor: true,
          balanceDueMinor: true,
          currency: true,
          createdAt: true,
        },
      },
    },
  });

  if (!job) {
    throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  }

  return jsonSafe(job);
}

export async function updateJob(
  context: AuthContext,
  jobId: string,
  input: Partial<JobInput>,
) {
  const current = await prisma.job.findFirst({
    where: { id: jobId, companyId: context.companyId },
    select: { status: true, customerId: true, serviceAddressId: true },
  });
  if (!current) {
    throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  }
  if (current.status === "COMPLETED" || current.status === "CANCELLED") {
    throw new AppError(
      "JOB_IMMUTABLE",
      "Completed or cancelled jobs cannot be edited",
      409,
    );
  }

  const customerId = input.customerId ?? current.customerId;
  const serviceAddressId = input.serviceAddressId ?? current.serviceAddressId;
  if (input.customerId || input.serviceAddressId) {
    await assertJobReferences(context.companyId, {
      customerId,
      serviceAddressId,
      serviceType: input.serviceType ?? "existing",
      problemDescription: input.problemDescription ?? "existing",
    });
  }

  const result = await prisma.job.updateMany({
    where: { id: jobId, companyId: context.companyId },
    data: {
      ...(input.customerId ? { customerId } : {}),
      ...(input.serviceAddressId ? { serviceAddressId } : {}),
      ...(input.serviceType ? { serviceType: input.serviceType.trim() } : {}),
      ...(input.problemDescription
        ? { problemDescription: input.problemDescription.trim() }
        : {}),
      ...(input.priority ? { priority: input.priority } : {}),
    },
  });
  if (result.count !== 1) {
    throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  }
  return getJob(context, jobId);
}

export async function assignJob(
  context: AuthContext,
  jobId: string,
  technicianId: string | null,
) {
  return prisma.$transaction(async (transaction) => {
    const job = await transaction.job.findFirst({
      where: { id: jobId, companyId: context.companyId },
      select: {
        id: true,
        status: true,
        scheduledStart: true,
        scheduledEnd: true,
      },
    });
    if (!job) {
      throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
    }
    if (job.status === "COMPLETED" || job.status === "CANCELLED") {
      throw new AppError("JOB_IMMUTABLE", "Final jobs cannot be assigned", 409);
    }

    if (technicianId) {
      const technician = await transaction.companyMember.findFirst({
        where: {
          companyId: context.companyId,
          userId: technicianId,
          role: "TECHNICIAN",
          status: "ACTIVE",
        },
      });
      if (!technician) {
        throw new AppError(
          "JOB_INVALID_ASSIGNEE",
          "Active technician not found",
          422,
        );
      }
    }

    const conflicts =
      technicianId && job.scheduledStart && job.scheduledEnd
        ? await transaction.job.findMany({
            where: {
              companyId: context.companyId,
              id: { not: jobId },
              assignedTechnicianId: technicianId,
              scheduledStart: { lt: job.scheduledEnd },
              scheduledEnd: { gt: job.scheduledStart },
              status: { notIn: ["CANCELLED", "COMPLETED"] },
            },
            select: { id: true, jobNumber: true },
          })
        : [];

    await transaction.job.update({
      where: { id: jobId },
      data: { assignedTechnicianId: technicianId },
    });

    return {
      job,
      conflicts,
      technicianId,
    };
  }).then(async ({ job, conflicts, technicianId }) => {
    void notificationPublisher.publish({
      type: "JOB_ASSIGNED",
      companyId: context.companyId,
      jobId,
      recipientUserId: technicianId ?? undefined,
    });
    return {
      job: await getJob(context, jobId),
      warnings: conflicts.map((conflict) => ({
        code: "TECHNICIAN_SCHEDULE_CONFLICT",
        jobId: conflict.id,
        jobNumber: conflict.jobNumber,
      })),
    };
  });
}

export async function transitionJob(
  context: AuthContext,
  jobId: string,
  toStatus: JobStatusValue,
  reason?: string,
) {
  const job = await prisma.job.findFirst({
    where: { id: jobId, companyId: context.companyId },
    select: {
      id: true,
      companyId: true,
      status: true,
      assignedTechnicianId: true,
    },
  });
  if (!job) {
    throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  }
  assertCanTransitionJob(context, job, toStatus);
  if (toStatus === "COMPLETED") {
    throw new AppError(
      "JOB_COMPLETION_REQUIRED",
      "Complete a job with a completion summary",
      422,
    );
  }
  if (!transitions[job.status].includes(toStatus)) {
    throw new AppError(
      "JOB_INVALID_STATUS_TRANSITION",
      `Cannot transition job from ${job.status} to ${toStatus}`,
      422,
    );
  }

  const now = new Date();
  await prisma.$transaction(async (transaction) => {
    const result = await transaction.job.updateMany({
      where: { id: jobId, status: job.status },
      data: {
        status: toStatus,
        ...(toStatus === "IN_PROGRESS" ? { startedAt: now } : {}),
      },
    });
    if (result.count !== 1) {
      throw new AppError(
        "JOB_STATUS_CONFLICT",
        "Job status changed; retry the command",
        409,
      );
    }
    await transaction.jobStatusHistory.create({
      data: {
        companyId: context.companyId,
        jobId,
        actorUserId: context.userId,
        fromStatus: job.status,
        toStatus,
        reason: reason?.trim() || undefined,
      },
    });
  });

  return getJob(context, jobId);
}

export async function listTechnicianToday(context: AuthContext, date: string) {
  const start = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) {
    throw new AppError("VALIDATION_FAILED", "Invalid date", 422);
  }
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  const jobs = await prisma.job.findMany({
    where: {
      ...jobAccessWhere(context),
      scheduledStart: { gte: start, lt: end },
      status: { not: "CANCELLED" },
    },
    select: jobSelect(),
    orderBy: { scheduledStart: "asc" },
  });
  return { date, jobs };
}

async function assertExecutableJob(context: AuthContext, jobId: string) {
  const job = await prisma.job.findFirst({
    where: { id: jobId, companyId: context.companyId },
    select: {
      id: true,
      companyId: true,
      status: true,
      assignedTechnicianId: true,
    },
  });
  if (!job) {
    throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  }
  assertCanExecuteJobWork(context, job);
  if (["COMPLETED", "CANCELLED"].includes(job.status)) {
    throw new AppError("JOB_IMMUTABLE", "Final jobs cannot be changed", 409);
  }
  return job;
}

export async function presignJobPhoto(
  context: AuthContext,
  jobId: string,
  mimeType: string,
): Promise<SignedUploadResult> {
  await assertExecutableJob(context, jobId);
  return supabaseStorageAdapter.createSignedUploadUrl({
    companyId: context.companyId,
    jobId,
    mimeType,
  });
}

export async function addJobPhoto(
  context: AuthContext,
  jobId: string,
  input: JobPhotoInput,
) {
  await assertExecutableJob(context, jobId);
  const photo = await prisma.jobPhoto.create({
    data: {
      companyId: context.companyId,
      jobId,
      uploadedBy: context.userId,
      objectKey: input.objectKey.trim(),
      mimeType: input.mimeType,
      sizeBytes: BigInt(input.sizeBytes),
      kind: input.kind,
      caption: input.caption?.trim() || undefined,
    },
    select: {
      id: true,
      objectKey: true,
      mimeType: true,
      sizeBytes: true,
      kind: true,
      caption: true,
      createdAt: true,
    },
  });
  return jsonSafe(photo);
}

export async function addJobPart(
  context: AuthContext,
  jobId: string,
  input: JobPartInput,
) {
  await assertExecutableJob(context, jobId);
  const part = await prisma.jobPart.create({
    data: {
      companyId: context.companyId,
      jobId,
      name: input.name.trim(),
      quantity: input.quantity,
      unitPriceMinor: BigInt(input.unitPriceMinor),
      currency: input.currency.toUpperCase(),
    },
    select: {
      id: true,
      name: true,
      quantity: true,
      unitPriceMinor: true,
      currency: true,
      createdAt: true,
    },
  });
  return jsonSafe(part);
}

export interface CompleteJobOptions {
  autoInvoice?: boolean;
  allowZeroAmountInvoice?: boolean;
}

export async function completeJob(
  context: AuthContext,
  jobId: string,
  summary: string,
  options?: CompleteJobOptions,
) {
  const existingJob = await prisma.job.findFirst({
    where: { id: jobId, companyId: context.companyId },
    select: {
      id: true,
      companyId: true,
      status: true,
      assignedTechnicianId: true,
    },
  });
  if (!existingJob) {
    throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  }

  // Idempotent completion: if already completed, optionally ensure autoInvoice and return job
  if (existingJob.status === "COMPLETED") {
    if (options?.autoInvoice) {
      await generateInvoiceFromJob(context, jobId, {
        allowZeroAmount: options.allowZeroAmountInvoice,
      });
    }
    return getJob(context, jobId);
  }

  assertCanExecuteJobWork(context, existingJob);
  if (
    existingJob.status !== "IN_PROGRESS" &&
    existingJob.status !== "WAITING_PARTS"
  ) {
    throw new AppError(
      "JOB_INVALID_STATUS_TRANSITION",
      "Only an active job can be completed",
      422,
    );
  }

  const now = new Date();
  await prisma.$transaction(async (transaction) => {
    const result = await transaction.job.updateMany({
      where: {
        id: jobId,
        companyId: context.companyId,
        status: existingJob.status,
      },
      data: {
        status: "COMPLETED",
        completedAt: now,
        completionSummary: summary.trim(),
      },
    });
    if (result.count !== 1) {
      throw new AppError(
        "JOB_STATUS_CONFLICT",
        "Job status changed; retry the command",
        409,
      );
    }
    const reason = options?.autoInvoice
      ? "Technician completed field work; generated draft invoice"
      : "Technician completed field work";

    await transaction.jobStatusHistory.create({
      data: {
        companyId: context.companyId,
        jobId,
        actorUserId: context.userId,
        fromStatus: existingJob.status,
        toStatus: "COMPLETED",
        reason,
      },
    });

    if (options?.autoInvoice) {
      await generateInvoiceFromJob(
        context,
        jobId,
        { allowZeroAmount: options.allowZeroAmountInvoice },
        transaction,
      );
    }
  });
  return getJob(context, jobId);
}

export async function addJobNote(
  context: AuthContext,
  jobId: string,
  body: string,
  visibility: NoteVisibilityValue,
) {
  const job = await prisma.job.findFirst({
    where: { id: jobId, companyId: context.companyId },
    select: { id: true, companyId: true, assignedTechnicianId: true },
  });
  if (!job) {
    throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  }
  assertCanAddJobNote(context, job, visibility);

  return prisma.jobNote.create({
    data: {
      companyId: context.companyId,
      jobId,
      authorUserId: context.userId,
      body: body.trim(),
      visibility,
    },
    select: {
      id: true,
      body: true,
      visibility: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getJobHistory(context: AuthContext, jobId: string) {
  await getJob(context, jobId);
  return prisma.jobStatusHistory.findMany({
    where: { companyId: context.companyId, jobId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fromStatus: true,
      toStatus: true,
      reason: true,
      createdAt: true,
      actor: { select: { id: true, firstName: true, lastName: true } },
    },
  });
}
