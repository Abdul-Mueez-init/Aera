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
import {
  getNextCounter,
  getNextJobNumber,
} from "../../common/counters/counter.service.js";
import {
  prepareHandshakeOnEnRoute,
  queueHandshakeCodeDelivery,
} from "./handshake.service.js";
import { closePortalIfDone } from "../portal/portal.grants.js";
import { createRequestMediaReadUrl } from "../../common/storage/supabase-storage.adapter.js";
import { env } from "../../config/env.js";
import {
  dayBoundsInTimezone,
  getCompanyTimezone,
} from "../ai/tools/timezone.util.js";
import { clearJobTracking } from "../tracking/tracking.service.js";

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
  serviceRequestId?: string;
  type?: "DIAGNOSTIC" | "REPAIR" | "INSTALLATION" | "MAINTENANCE" | "OTHER";
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
    type: true,
    reviewState: true,
    reviewedAt: true,
    reviewNote: true,
    handshakeVerifiedAt: true,
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
    // Phase 6.1 — the approved quote is the billable scope the technician
    // is executing against; expose its line items (no customer PII).
    quotes: {
      where: { status: "APPROVED" },
      orderBy: { createdAt: "desc" as const },
      take: 1,
      select: {
        id: true,
        status: true,
        items: {
          orderBy: { sortOrder: "asc" as const },
          select: {
            description: true,
            quantity: true,
            unitPriceMinor: true,
            totalMinor: true,
          },
        },
      },
    },
    serviceRequest: {
      select: {
        id: true,
        title: true,
        description: true,
        serviceCategory: true,
        attachments: {
          orderBy: { createdAt: "desc" as const },
          take: 20,
          select: {
            id: true,
            objectKey: true,
            mimeType: true,
            kind: true,
            sizeBytes: true,
            caption: true,
            createdAt: true,
          },
        },
      },
    },
  } as const;
}

// Role-specific select for technicians: redacts customer contact details and invoice financial data
// Technicians need customer name and service address to perform the job, but not email/phone or billing data
function technicianJobSelect() {
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
    type: true,
    reviewState: true,
    reviewedAt: true,
    reviewNote: true,
    handshakeVerifiedAt: true,
    createdAt: true,
    updatedAt: true,
    customer: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        // Redacted: email, phone - technicians don't need customer contact details
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
    // Same approved-scope exposure as the staff select (Phase 6.1).
    quotes: {
      where: { status: "APPROVED" },
      orderBy: { createdAt: "desc" as const },
      take: 1,
      select: {
        id: true,
        status: true,
        items: {
          orderBy: { sortOrder: "asc" as const },
          select: {
            description: true,
            quantity: true,
            unitPriceMinor: true,
            totalMinor: true,
          },
        },
      },
    },
    serviceRequest: {
      select: {
        id: true,
        title: true,
        description: true,
        serviceCategory: true,
        attachments: {
          orderBy: { createdAt: "desc" as const },
          take: 20,
          select: {
            id: true,
            objectKey: true,
            mimeType: true,
            kind: true,
            sizeBytes: true,
            caption: true,
            createdAt: true,
          },
        },
      },
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
  // Use role-specific select: technicians get redacted customer data
  const baseSelect =
    context.role === "TECHNICIAN" ? technicianJobSelect() : jobSelect();
  const [items, total] = await prisma.$transaction([
    prisma.job.findMany({
      where,
      select: baseSelect,
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
    let serviceRequestId = input.serviceRequestId;
    if (env.REQUESTS_ENABLED) {
      if (serviceRequestId) {
        const existingRequest = await transaction.serviceRequest.findFirst({
          where: {
            id: serviceRequestId,
            companyId: context.companyId,
            customerId: input.customerId,
            serviceAddressId: input.serviceAddressId,
          },
          select: { id: true },
        });
        if (!existingRequest) {
          throw new AppError(
            "JOB_INVALID_SERVICE_REQUEST",
            "Service request must belong to the customer and address",
            422,
          );
        }
      } else {
        const requestNumber = await getNextCounter(
          context.companyId,
          "SERVICE_REQUEST",
          transaction,
        );
        const serviceRequest = await transaction.serviceRequest.create({
          data: {
            companyId: context.companyId,
            customerId: input.customerId,
            serviceAddressId: input.serviceAddressId,
            requestNumber,
            title: input.serviceType.trim(),
            description: input.problemDescription.trim(),
            serviceCategory: input.serviceType.trim(),
            priority: input.priority ?? "NORMAL",
            status: "ACCEPTED",
            source: "STAFF_DIRECT",
          },
          select: { id: true },
        });
        serviceRequestId = serviceRequest.id;
        await transaction.serviceRequestEvent.create({
          data: {
            companyId: context.companyId,
            requestId: serviceRequest.id,
            actorUserId: context.userId,
            type: "CREATED",
            toStatus: "ACCEPTED",
          },
        });
      }
    }
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
        serviceRequestId,
        type: input.type ?? "OTHER",
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
    select: {
      id: true,
      companyId: true,
      assignedTechnicianId: true,
      status: true,
      handshakeVerifiedAt: true,
      handshakeLockedUntil: true,
    },
  });

  if (!jobMeta) {
    throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  }

  assertCanViewJob(context, jobMeta);

  // Use role-specific select: technicians get redacted customer data and no invoice financials
  const baseSelect =
    context.role === "TECHNICIAN" ? technicianJobSelect() : jobSelect();

  const job = await prisma.job.findFirst({
    where: { id: jobId, companyId: context.companyId },
    select: {
      ...baseSelect,
      statusHistory: {
        orderBy: { createdAt: "desc" },
        take: 50, // Limit history to prevent unbounded loading
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
        take: 100, // Limit notes to prevent unbounded loading
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
        take: 100, // Limit photos to prevent unbounded loading
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
        take: 100, // Limit parts to prevent unbounded loading
        select: {
          id: true,
          name: true,
          quantity: true,
          unitPriceMinor: true,
          currency: true,
          createdAt: true,
        },
      },
      // Technicians only see invoice existence and status, not financial data
      invoices: {
        orderBy: { createdAt: "desc" },
        take: 10, // Limit invoices to prevent unbounded loading
        select:
          context.role === "TECHNICIAN"
            ? {
                id: true,
                invoiceNumber: true,
                status: true,
                createdAt: true,
              }
            : {
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

  const requestContext = job.serviceRequest
    ? {
        id: job.serviceRequest.id,
        title: job.serviceRequest.title,
        description: job.serviceRequest.description,
        serviceCategory: job.serviceRequest.serviceCategory,
        attachments: await Promise.all(
          job.serviceRequest.attachments.map(async (attachment) => ({
            id: attachment.id,
            mimeType: attachment.mimeType,
            kind: attachment.kind,
            sizeBytes: attachment.sizeBytes,
            caption: attachment.caption,
            createdAt: attachment.createdAt,
            signedReadUrl: await createRequestMediaReadUrl(
              attachment.objectKey,
            ),
          })),
        ),
      }
    : null;

  // Handshake exposure rule (handoff 5.7): staff/technician responses
  // carry only the handshake STATE, never the code, the derived version,
  // or the failed-attempt counters.
  const now = new Date();
  const isLocked =
    jobMeta.status === "EN_ROUTE" &&
    !jobMeta.handshakeVerifiedAt &&
    jobMeta.handshakeLockedUntil !== null &&
    jobMeta.handshakeLockedUntil > now;
  const handshakeState = jobMeta.handshakeVerifiedAt
    ? "VERIFIED"
    : jobMeta.status !== "EN_ROUTE"
      ? "NONE"
      : isLocked
        ? "LOCKED"
        : "AWAITING_CODE";

  return jsonSafe({
    ...job,
    requestContext,
    arrivedVerifiedAt: job.handshakeVerifiedAt,
    handshake: {
      state: handshakeState,
      lockedUntil: isLocked ? jobMeta.handshakeLockedUntil : null,
    },
  });
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

  // Changing the customer once financial/portal records exist would
  // orphan them: quotes, the invoice and portal grants all carry their
  // own customerId and point at the original customer.
  if (input.customerId && input.customerId !== current.customerId) {
    const [quoteCount, invoiceCount, grantCount] = await Promise.all([
      prisma.quote.count({ where: { jobId, companyId: context.companyId } }),
      prisma.invoice.count({ where: { jobId, companyId: context.companyId } }),
      prisma.portalAccessGrant.count({
        where: { jobId, companyId: context.companyId },
      }),
    ]);
    if (quoteCount > 0 || invoiceCount > 0 || grantCount > 0) {
      throw new AppError(
        "JOB_CUSTOMER_LOCKED",
        "This job already has quotes, an invoice or portal access linked to its customer and cannot be moved to another customer",
        409,
      );
    }
  }

  // Guard with the status validated above: a concurrent complete/cancel
  // between the read and this write must win, not be overwritten.
  const result = await prisma.job.updateMany({
    where: { id: jobId, companyId: context.companyId, status: current.status },
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
    throw new AppError(
      "JOB_STATE_CHANGED",
      "Job changed while it was being edited; please retry",
      409,
    );
  }
  return getJob(context, jobId);
}

export async function assignJob(
  context: AuthContext,
  jobId: string,
  technicianId: string | null,
) {
  return prisma
    .$transaction(async (transaction) => {
      const job = await transaction.job.findFirst({
        where: { id: jobId, companyId: context.companyId },
        select: {
          id: true,
          status: true,
          assignedTechnicianId: true,
          type: true,
          reviewState: true,
          scheduledStart: true,
          scheduledEnd: true,
          handshakeVersion: true,
        },
      });
      if (!job) {
        throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
      }
      if (job.status === "COMPLETED" || job.status === "CANCELLED") {
        throw new AppError(
          "JOB_IMMUTABLE",
          "Final jobs cannot be assigned",
          409,
        );
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

      // Reassignment while EN_ROUTE invalidates the previous handshake
      // code: bump the version and reset the handshake state inside the
      // same transaction; the new code is delivered after commit.
      const handshakeChanged =
        job.status === "EN_ROUTE" && technicianId !== job.assignedTechnicianId;
      if (handshakeChanged) {
        await prepareHandshakeOnEnRoute(transaction, job);
      }

      return {
        conflicts,
        technicianId,
        handshakeChanged,
        handshakeVersion: handshakeChanged
          ? job.handshakeVersion + 1
          : undefined,
      };
    })
    .then(
      async ({
        conflicts,
        technicianId,
        handshakeChanged,
        handshakeVersion,
      }) => {
        if (handshakeChanged) {
          queueHandshakeCodeDelivery(jobId, handshakeVersion!);
        }
        await clearJobTracking(jobId, context.companyId);
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
      },
    );
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
      type: true,
      reviewState: true,
      startedAt: true,
      handshakeVersion: true,
    },
  });
  if (!job) {
    throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  }

  // EN_ROUTE → IN_PROGRESS is closed to the generic status command for
  // every role (handoff 5.7). The only paths are POST /jobs/:jobId/start
  // with the customer handshake code, or the audited staff override.
  // This check runs before the role policy so the answer is the same
  // 422 HANDSHAKE_REQUIRED for technicians and office staff alike.
  if (job.status === "EN_ROUTE" && toStatus === "IN_PROGRESS") {
    throw new AppError(
      "HANDSHAKE_REQUIRED",
      "Starting an en route job requires the customer handshake code",
      422,
    );
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

  // Require technician assignment for active job states
  if (
    (toStatus === "EN_ROUTE" ||
      toStatus === "IN_PROGRESS" ||
      toStatus === "WAITING_PARTS") &&
    !job.assignedTechnicianId
  ) {
    throw new AppError(
      "JOB_REQUIRES_TECHNICIAN",
      "A technician must be assigned before transitioning to this status",
      422,
    );
  }

  const now = new Date();
  await prisma.$transaction(async (transaction) => {
    const result = await transaction.job.updateMany({
      where: { id: jobId, status: job.status },
      data: {
        status: toStatus,
        // startedAt records the FIRST start only: a WAITING_PARTS ->
        // IN_PROGRESS return must not rewrite the original start time.
        ...(toStatus === "IN_PROGRESS" && !job.startedAt
          ? { startedAt: now }
          : {}),
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

    // Entering EN_ROUTE issues a fresh handshake code (version bump +
    // attempts/lock/verified reset) inside the same transaction.
    if (toStatus === "EN_ROUTE") {
      await prepareHandshakeOnEnRoute(transaction, job);
    }

    // Close portal if job is cancelled
    if (toStatus === "CANCELLED") {
      await closePortalIfDone(jobId, transaction);
    }
  });

  // Deliver the new handshake code to the customer after commit.
  // Fire-and-forget: delivery failure never fails the transition.
  if (toStatus === "EN_ROUTE") {
    queueHandshakeCodeDelivery(jobId, job.handshakeVersion + 1);
  }
  if (toStatus === "IN_PROGRESS" || toStatus === "CANCELLED") {
    await clearJobTracking(jobId, context.companyId);
  }

  return getJob(context, jobId);
}

export async function listTechnicianToday(context: AuthContext, date: string) {
  // Company-local day bounds (same convention as dashboard/AI): the old
  // UTC-midnight window hid early-morning local jobs from "today".
  let start: Date;
  let end: Date;
  try {
    ({ start, end } = dayBoundsInTimezone(
      date,
      await getCompanyTimezone(context.companyId),
    ));
  } catch {
    throw new AppError("VALIDATION_FAILED", "Invalid date", 422);
  }

  const jobs = await prisma.job.findMany({
    where: {
      ...jobAccessWhere(context),
      scheduledStart: { gte: start, lt: end },
      status: { not: "CANCELLED" },
    },
    // Technicians get the redacted select here too (customer email/phone
    // withheld), matching listJobs/getJob — /today used the full select.
    select: context.role === "TECHNICIAN" ? technicianJobSelect() : jobSelect(),
    orderBy: { scheduledStart: "asc" },
  });
  return { date, jobs };
}

async function assertExecutableJob(
  context: AuthContext,
  jobId: string,
  allowReviewChanges = false,
) {
  const job = await prisma.job.findFirst({
    where: { id: jobId, companyId: context.companyId },
    select: {
      id: true,
      companyId: true,
      status: true,
      assignedTechnicianId: true,
      reviewState: true,
    },
  });
  if (!job) {
    throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  }
  assertCanExecuteJobWork(context, job);
  if (
    ["COMPLETED", "CANCELLED"].includes(job.status) &&
    !(
      allowReviewChanges &&
      job.status === "COMPLETED" &&
      job.reviewState === "CHANGES_REQUESTED"
    )
  ) {
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

  const result = await supabaseStorageAdapter.createSignedUploadUrl({
    companyId: context.companyId,
    jobId,
    mimeType,
  });

  // Store presigned upload record for later validation
  const expiresAt = new Date(result.expiresAt);
  await prisma.presignedUpload.create({
    data: {
      companyId: context.companyId,
      jobId,
      userId: context.userId,
      objectKey: result.objectKey,
      mimeType,
      expiresAt,
    },
  });

  return result;
}

export async function addJobPhoto(
  context: AuthContext,
  jobId: string,
  input: JobPhotoInput,
) {
  await assertExecutableJob(context, jobId, true);

  // Validate against presigned upload record
  const presignedUpload = await prisma.presignedUpload.findUnique({
    where: { objectKey: input.objectKey.trim() },
  });

  if (!presignedUpload) {
    throw new AppError(
      "INVALID_UPLOAD",
      "This upload was not authorized through the proper presigned upload process",
      403,
    );
  }

  // Verify the presigned upload belongs to the correct company, job, and user
  if (
    presignedUpload.companyId !== context.companyId ||
    presignedUpload.jobId !== jobId ||
    presignedUpload.userId !== context.userId
  ) {
    throw new AppError(
      "INVALID_UPLOAD",
      "This upload does not belong to the current context",
      403,
    );
  }

  // Check if the presigned upload has expired
  if (new Date() > presignedUpload.expiresAt) {
    throw new AppError(
      "UPLOAD_EXPIRED",
      "This upload authorization has expired",
      410,
    );
  }

  // Verify the ACTUAL uploaded object before the transaction. The
  // client-supplied sizeBytes is only a claim: verification HEADs the
  // object and returns its real size and content type, and those
  // measured values are what get enforced and stored.
  const verification = await supabaseStorageAdapter.verifyUpload({
    objectKey: input.objectKey.trim(),
    expectedMimeType: presignedUpload.mimeType,
    expectedMaxSizeBytes: 10_000_000,
  });

  if (!verification.exists) {
    throw new AppError(
      "UPLOAD_NOT_FOUND",
      "The uploaded object was not found in storage",
      404,
    );
  }

  // Verify client-supplied MIME type matches what was presigned
  if (input.mimeType !== presignedUpload.mimeType) {
    throw new AppError(
      "MIME_TYPE_MISMATCH",
      "The uploaded file type does not match the authorized type",
      422,
    );
  }

  // The bytes in storage must be the type that was presigned: a client
  // can PUT any content to the signed URL, so the claim checks above
  // are not enough on their own.
  if (verification.mimeType !== presignedUpload.mimeType) {
    throw new AppError(
      "MIME_TYPE_MISMATCH",
      "The uploaded file's actual type does not match the authorized type",
      422,
    );
  }

  // Enforce the size limit on the measured size, never the claim.
  if (verification.sizeBytes <= 0) {
    throw new AppError(
      "UPLOAD_INVALID",
      "The uploaded file is empty or its size could not be verified",
      422,
    );
  }
  if (verification.sizeBytes > 10_000_000) {
    throw new AppError(
      "FILE_TOO_LARGE",
      "Photo size exceeds the 10MB limit",
      413,
    );
  }

  // Create the photo record and mark upload as confirmed in a single transaction
  // This makes the confirmation atomic and prevents duplicate confirmations
  const photo = await prisma.$transaction(async (tx) => {
    // Atomically claim the upload by updating confirmedAt only if null
    const claimed = await tx.presignedUpload.updateMany({
      where: {
        id: presignedUpload.id,
        confirmedAt: null,
      },
      data: {
        confirmedAt: new Date(),
      },
    });

    if (claimed.count === 0) {
      throw new AppError(
        "UPLOAD_ALREADY_CONFIRMED",
        "This upload has already been confirmed and cannot be reused",
        409,
      );
    }

    // Create the photo record with the MEASURED mime type and size.
    return await tx.jobPhoto.create({
      data: {
        companyId: context.companyId,
        jobId,
        uploadedBy: context.userId,
        objectKey: input.objectKey.trim(),
        mimeType: verification.mimeType,
        sizeBytes: BigInt(verification.sizeBytes),
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

export interface JobFindingInput {
  summary: string;
  recommendedWork?: string;
  equipmentInfo?: unknown;
  likelyParts?: unknown;
  estimatedLaborMinutes?: number;
  customerVisible?: boolean;
}

export async function addJobFinding(
  context: AuthContext,
  jobId: string,
  input: JobFindingInput,
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
  if (!job) throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  assertCanExecuteJobWork(context, job);
  if (!["IN_PROGRESS", "WAITING_PARTS", "COMPLETED"].includes(job.status)) {
    throw new AppError(
      "JOB_FINDING_NOT_ALLOWED",
      "Findings can only be recorded during or after field work",
      422,
    );
  }
  if (job.status === "COMPLETED") {
    const review = await prisma.job.findUnique({
      where: { id: jobId },
      select: { reviewState: true },
    });
    if (review?.reviewState !== "CHANGES_REQUESTED") {
      throw new AppError("JOB_IMMUTABLE", "Final jobs cannot be changed", 409);
    }
  }
  const finding = await prisma.jobFinding.create({
    data: {
      companyId: context.companyId,
      jobId,
      authorUserId: context.userId,
      summary: input.summary.trim(),
      recommendedWork: input.recommendedWork?.trim() || undefined,
      equipmentInfo: input.equipmentInfo as object | undefined,
      likelyParts: input.likelyParts as object | undefined,
      estimatedLaborMinutes: input.estimatedLaborMinutes,
      customerVisible: input.customerVisible ?? false,
    },
  });
  return jsonSafe(finding);
}

export async function listJobFindings(
  context: AuthContext,
  jobId: string,
  customerVisibleOnly = false,
) {
  const job = await prisma.job.findFirst({
    where: { id: jobId, companyId: context.companyId },
    select: { id: true, companyId: true, assignedTechnicianId: true },
  });
  if (!job) throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  assertCanViewJob(context, job);
  const findings = await prisma.jobFinding.findMany({
    where: {
      companyId: context.companyId,
      jobId,
      ...(customerVisibleOnly ? { customerVisible: true } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      summary: true,
      recommendedWork: true,
      equipmentInfo: true,
      likelyParts: true,
      estimatedLaborMinutes: true,
      customerVisible: true,
      createdAt: true,
      author: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  return jsonSafe(findings);
}

export async function reviewCompletedJob(
  context: AuthContext,
  jobId: string,
  decision: "APPROVED" | "CHANGES_REQUESTED",
  note?: string,
) {
  if (context.role !== "OWNER" && context.role !== "DISPATCHER") {
    throw new AppError(
      "AUTH_FORBIDDEN",
      "Only staff can review completions",
      403,
    );
  }
  const current = await prisma.job.findFirst({
    where: { id: jobId, companyId: context.companyId },
    select: {
      id: true,
      status: true,
      reviewState: true,
      assignedTechnicianId: true,
    },
  });
  if (!current) throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  if (current.status !== "COMPLETED" || current.reviewState !== "PENDING") {
    throw new AppError(
      "JOB_REVIEW_NOT_PENDING",
      "This job does not have a pending completion review",
      409,
    );
  }
  const updated = await prisma.job.update({
    where: { id: jobId },
    data: {
      reviewState: decision,
      reviewedBy: context.userId,
      reviewedAt: new Date(),
      reviewNote: note?.trim() || null,
    },
  });
  // Phase 6.4 — CHANGES_REQUESTED notifies the assigned technician with
  // the review note so they know what to correct.
  if (decision === "CHANGES_REQUESTED" && current.assignedTechnicianId) {
    void notificationPublisher.publish({
      type: "JOB_REVIEW_CHANGES_REQUESTED",
      companyId: context.companyId,
      jobId,
      recipientUserId: current.assignedTechnicianId,
    });
  }
  return getJob(context, updated.id);
}

export async function createJobChangeRequest(
  context: AuthContext,
  jobId: string,
  input: {
    reason: string;
    description: string;
    estimatedPriceMinor: number;
    currency: string;
    evidencePhotoIds?: string[];
  },
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
  if (!job) throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  assertCanExecuteJobWork(context, job);
  if (!["IN_PROGRESS", "WAITING_PARTS"].includes(job.status)) {
    throw new AppError(
      "CHANGE_REQUEST_NOT_ALLOWED",
      "Change requests require an active job",
      422,
    );
  }
  if (input.estimatedPriceMinor < 0) {
    throw new AppError(
      "VALIDATION_FAILED",
      "Estimated price cannot be negative",
      422,
    );
  }
  if (input.evidencePhotoIds?.length) {
    const evidenceCount = await prisma.jobPhoto.count({
      where: {
        id: { in: input.evidencePhotoIds },
        companyId: context.companyId,
        jobId,
      },
    });
    if (evidenceCount !== input.evidencePhotoIds.length) {
      throw new AppError(
        "INVALID_CHANGE_REQUEST_EVIDENCE",
        "Every evidence photo must belong to this job",
        422,
      );
    }
  }
  const changeRequest = await prisma.jobChangeRequest.create({
    data: {
      companyId: context.companyId,
      jobId,
      technicianId: context.userId,
      reason: input.reason.trim(),
      description: input.description.trim(),
      estimatedPriceMinor: BigInt(input.estimatedPriceMinor),
      currency: input.currency.toUpperCase(),
      evidencePhotoIds: input.evidencePhotoIds,
    },
  });
  // Phase 6.5 — staff (OWNER/DISPATCHER) are notified; no recipientUserId
  // means the company-event role fan-out applies.
  void notificationPublisher.publish({
    type: "JOB_CHANGE_REQUEST_SUBMITTED",
    companyId: context.companyId,
    jobId,
  });
  return jsonSafe(changeRequest);
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
      type: true,
      reviewState: true,
    },
  });
  if (!existingJob) {
    throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  }

  // Authorization FIRST: the already-COMPLETED branch below can create an
  // invoice (a manager-only financial side effect). Running it before
  // this check let any unassigned technician trigger invoice creation on
  // a completed job by re-"completing" it with autoInvoice set.
  assertCanExecuteJobWork(context, existingJob);

  // Idempotent completion: if already completed, optionally ensure autoInvoice and return job
  if (existingJob.status === "COMPLETED") {
    if (options?.autoInvoice) {
      await generateInvoiceFromJob(context, jobId, {
        allowZeroAmount: options.allowZeroAmountInvoice,
      });
    }
    return getJob(context, jobId);
  }
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

  const [findingCount, company] = await prisma.$transaction([
    prisma.jobFinding.count({ where: { companyId: context.companyId, jobId } }),
    prisma.company.findUnique({
      where: { id: context.companyId },
      select: { requireCompletionReview: true },
    }),
  ]);
  // Phase 6 ships dark: the diagnostic finding requirement only applies
  // when COMPLETION_REVIEW_ENABLED is on.
  if (
    env.COMPLETION_REVIEW_ENABLED &&
    existingJob.type === "DIAGNOSTIC" &&
    findingCount < 1
  ) {
    throw new AppError(
      "JOB_FINDING_REQUIRED",
      "Diagnostic jobs require at least one finding before completion",
      422,
    );
  }
  const reviewRequired =
    env.COMPLETION_REVIEW_ENABLED && company?.requireCompletionReview === true;

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
        reviewState: reviewRequired ? "PENDING" : "NOT_REQUIRED",
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

    if (options?.autoInvoice && !reviewRequired) {
      await generateInvoiceFromJob(
        context,
        jobId,
        { allowZeroAmount: options.allowZeroAmountInvoice },
        transaction,
      );
    }

    // Attempt to close portal if job is done
    // This is a no-op if conditions aren't met
    await closePortalIfDone(jobId, transaction);
  });
  await clearJobTracking(jobId, context.companyId);
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
    select: {
      id: true,
      companyId: true,
      assignedTechnicianId: true,
      status: true,
      reviewState: true,
    },
  });
  if (!job) {
    throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  }
  assertCanAddJobNote(context, job, visibility);
  // Notes are part of the job record: final jobs are immutable (photos
  // and parts already enforce this via assertExecutableJob). The single
  // exception mirrors photos: while reviewState is CHANGES_REQUESTED the
  // technician may still append evidence notes for the rework.
  if (
    (job.status === "COMPLETED" || job.status === "CANCELLED") &&
    !(job.status === "COMPLETED" && job.reviewState === "CHANGES_REQUESTED")
  ) {
    throw new AppError(
      "JOB_IMMUTABLE",
      "Notes cannot be added to a completed or cancelled job",
      409,
    );
  }

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

// --- Phase 6.5: change-request workflow ----------------------------------

async function getChangeRequestJob(
  context: AuthContext,
  jobId: string,
  changeRequestId: string,
) {
  const job = await prisma.job.findFirst({
    where: { id: jobId, companyId: context.companyId },
    select: { id: true, customerId: true, assignedTechnicianId: true },
  });
  if (!job) throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  const changeRequest = await prisma.jobChangeRequest.findFirst({
    where: { id: changeRequestId, companyId: context.companyId, jobId },
  });
  if (!changeRequest) {
    throw new AppError("RESOURCE_NOT_FOUND", "Change request not found", 404);
  }
  return { job, changeRequest };
}

const changeRequestSelect = {
  id: true,
  jobId: true,
  technicianId: true,
  reason: true,
  description: true,
  estimatedPriceMinor: true,
  currency: true,
  status: true,
  evidencePhotoIds: true,
  authorizationReason: true,
  authorizedBy: true,
  authorizedAt: true,
  createdAt: true,
  technician: { select: { firstName: true, lastName: true } },
} as const;

export async function listJobChangeRequests(
  context: AuthContext,
  jobId: string,
) {
  const job = await prisma.job.findFirst({
    where: { id: jobId, companyId: context.companyId },
    select: { id: true, assignedTechnicianId: true },
  });
  if (!job) throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  // Technicians see change requests only on jobs assigned to them.
  if (
    context.role === "TECHNICIAN" &&
    job.assignedTechnicianId !== context.userId
  ) {
    throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  }
  const requests = await prisma.jobChangeRequest.findMany({
    where: { companyId: context.companyId, jobId },
    orderBy: { createdAt: "desc" },
    select: changeRequestSelect,
  });
  return jsonSafe(requests);
}

/** Staff create a prefilled CHANGE_ORDER quote from an OPEN request. */
export async function quoteJobChangeRequest(
  context: AuthContext,
  jobId: string,
  changeRequestId: string,
) {
  if (context.role !== "OWNER" && context.role !== "DISPATCHER") {
    throw new AppError("AUTH_FORBIDDEN", "Only staff can quote change requests", 403);
  }
  const { job, changeRequest } = await getChangeRequestJob(
    context,
    jobId,
    changeRequestId,
  );
  if (changeRequest.status !== "OPEN") {
    throw new AppError(
      "CHANGE_REQUEST_NOT_OPEN",
      "Only open change requests can be quoted",
      409,
    );
  }
  const { createQuote } = await import("../quotes/quote.service.js");
  const quote = await createQuote(context, {
    customerId: job.customerId,
    jobId,
    kind: "CHANGE_ORDER",
    currency: changeRequest.currency,
    items: [
      {
        description: `${changeRequest.reason}: ${changeRequest.description}`,
        quantity: "1",
        unitPriceMinor: Number(changeRequest.estimatedPriceMinor),
      },
    ],
  });
  await prisma.jobChangeRequest.update({
    where: { id: changeRequest.id },
    data: { status: "QUOTED" },
  });
  return jsonSafe(quote);
}

/** Staff record an emergency authorization instead of customer acceptance. */
export async function authorizeJobChangeRequest(
  context: AuthContext,
  jobId: string,
  changeRequestId: string,
  reason: string,
) {
  if (context.role !== "OWNER" && context.role !== "DISPATCHER") {
    throw new AppError("AUTH_FORBIDDEN", "Only staff can authorize change requests", 403);
  }
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: context.companyId },
    select: { emergencyAuthorizationAllowed: true },
  });
  if (!company.emergencyAuthorizationAllowed) {
    throw new AppError(
      "EMERGENCY_AUTH_NOT_ALLOWED",
      "Emergency authorization is disabled for this company",
      422,
    );
  }
  const { changeRequest } = await getChangeRequestJob(
    context,
    jobId,
    changeRequestId,
  );
  if (changeRequest.status !== "OPEN") {
    throw new AppError(
      "CHANGE_REQUEST_NOT_OPEN",
      "Only open change requests can be authorized",
      409,
    );
  }
  const updated = await prisma.jobChangeRequest.update({
    where: { id: changeRequest.id },
    data: {
      authorizationReason: reason.trim(),
      authorizedBy: context.userId,
      authorizedAt: new Date(),
    },
    select: changeRequestSelect,
  });
  return jsonSafe(updated);
}

export async function declineJobChangeRequest(
  context: AuthContext,
  jobId: string,
  changeRequestId: string,
) {
  if (context.role !== "OWNER" && context.role !== "DISPATCHER") {
    throw new AppError("AUTH_FORBIDDEN", "Only staff can decline change requests", 403);
  }
  const { changeRequest } = await getChangeRequestJob(
    context,
    jobId,
    changeRequestId,
  );
  if (changeRequest.status !== "OPEN" && changeRequest.status !== "QUOTED") {
    throw new AppError(
      "CHANGE_REQUEST_NOT_OPEN",
      "This change request can no longer be declined",
      409,
    );
  }
  const updated = await prisma.jobChangeRequest.update({
    where: { id: changeRequest.id },
    data: { status: "DECLINED" },
    select: changeRequestSelect,
  });
  return jsonSafe(updated);
}

/** Technician withdraws their own OPEN change request. */
export async function withdrawJobChangeRequest(
  context: AuthContext,
  jobId: string,
  changeRequestId: string,
) {
  const { changeRequest } = await getChangeRequestJob(
    context,
    jobId,
    changeRequestId,
  );
  if (changeRequest.technicianId !== context.userId) {
    throw new AppError("RESOURCE_NOT_FOUND", "Change request not found", 404);
  }
  if (changeRequest.status !== "OPEN") {
    throw new AppError(
      "CHANGE_REQUEST_NOT_OPEN",
      "Only open change requests can be withdrawn",
      409,
    );
  }
  const updated = await prisma.jobChangeRequest.update({
    where: { id: changeRequest.id },
    data: { status: "WITHDRAWN" },
    select: changeRequestSelect,
  });
  return jsonSafe(updated);
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
