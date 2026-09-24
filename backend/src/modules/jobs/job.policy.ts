import type { AuthContext } from "../../common/auth/auth.types.js";
import { AppError } from "../../common/errors.js";

export type JobStatusValue =
  | "NEW"
  | "QUOTING"
  | "SCHEDULED"
  | "EN_ROUTE"
  | "IN_PROGRESS"
  | "WAITING_PARTS"
  | "COMPLETED"
  | "CANCELLED";

export type NoteVisibilityValue = "INTERNAL" | "CUSTOMER";

export interface JobAuthorizationTarget {
  id: string;
  companyId: string;
  assignedTechnicianId?: string | null;
  status?: JobStatusValue;
}

const technicianFieldTransitions: Record<
  JobStatusValue,
  readonly JobStatusValue[]
> = {
  NEW: [],
  QUOTING: [],
  SCHEDULED: ["EN_ROUTE"],
  EN_ROUTE: ["IN_PROGRESS"],
  IN_PROGRESS: ["WAITING_PARTS"],
  WAITING_PARTS: ["IN_PROGRESS"],
  COMPLETED: [],
  CANCELLED: [],
};

export function assertCanViewJob(
  auth: AuthContext,
  job: JobAuthorizationTarget,
): void {
  if (job.companyId !== auth.companyId) {
    throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  }

  if (auth.role === "TECHNICIAN" && job.assignedTechnicianId !== auth.userId) {
    throw new AppError(
      "AUTH_FORBIDDEN",
      "Technician is not assigned to this job",
      403,
    );
  }
}

export function assertCanTransitionJob(
  auth: AuthContext,
  job: JobAuthorizationTarget,
  toStatus: JobStatusValue,
): void {
  if (job.companyId !== auth.companyId) {
    throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  }

  if (auth.role === "TECHNICIAN") {
    if (job.assignedTechnicianId !== auth.userId) {
      throw new AppError(
        "AUTH_FORBIDDEN",
        "Technician is not assigned to this job",
        403,
      );
    }

    if (toStatus === "CANCELLED") {
      throw new AppError(
        "AUTH_FORBIDDEN",
        "Technicians are not authorized to cancel jobs",
        403,
      );
    }

    const currentStatus = job.status ?? "NEW";
    const allowed = technicianFieldTransitions[currentStatus];
    if (!allowed || !allowed.includes(toStatus)) {
      throw new AppError(
        "AUTH_FORBIDDEN",
        `Technicians cannot transition job from ${currentStatus} to ${toStatus}`,
        403,
      );
    }
  }
}

export function assertCanExecuteJobWork(
  auth: AuthContext,
  job: JobAuthorizationTarget,
): void {
  if (job.companyId !== auth.companyId) {
    throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  }

  if (auth.role === "TECHNICIAN" && job.assignedTechnicianId !== auth.userId) {
    throw new AppError(
      "AUTH_FORBIDDEN",
      "Technician is not assigned to this job",
      403,
    );
  }
}

export function assertCanAddJobNote(
  auth: AuthContext,
  job: JobAuthorizationTarget,
  visibility: NoteVisibilityValue,
): void {
  if (job.companyId !== auth.companyId) {
    throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  }

  if (auth.role === "TECHNICIAN") {
    if (job.assignedTechnicianId !== auth.userId) {
      throw new AppError(
        "AUTH_FORBIDDEN",
        "Technician is not assigned to this job",
        403,
      );
    }

    if (visibility === "CUSTOMER") {
      throw new AppError(
        "AUTH_FORBIDDEN",
        "Technicians cannot create customer-visible notes",
        403,
      );
    }
  }
}

export function assertCanViewJobHistory(
  auth: AuthContext,
  job: JobAuthorizationTarget,
): void {
  if (job.companyId !== auth.companyId) {
    throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
  }

  if (auth.role === "TECHNICIAN" && job.assignedTechnicianId !== auth.userId) {
    throw new AppError(
      "AUTH_FORBIDDEN",
      "Technician is not assigned to this job",
      403,
    );
  }
}
