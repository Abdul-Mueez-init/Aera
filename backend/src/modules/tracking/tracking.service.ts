import { AppError } from "../../common/errors.js";
import type { AuthContext } from "../../common/auth/auth.types.js";
import { prisma } from "../../db/prisma.js";
import { distanceKm } from "../companies/osm-geo.service.js";

const STALE_AFTER_MS = 2 * 60 * 1000;
// Phase 8.2 — ETA is distance × a fixed urban-speed factor, labeled
// approximate everywhere it is shown. ~30 km/h including typical stops.
const ETA_KM_PER_HOUR = 30;

function assertCoordinates(latitude: number, longitude: number): void {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new AppError(
      "VALIDATION_FAILED",
      "Invalid location coordinates",
      422,
    );
  }
}

export async function updateJobLocation(
  context: AuthContext,
  jobId: string,
  input: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    consent?: boolean;
  },
) {
  assertCoordinates(input.latitude, input.longitude);
  if (
    input.accuracy !== undefined &&
    (!Number.isFinite(input.accuracy) || input.accuracy < 0)
  ) {
    throw new AppError("VALIDATION_FAILED", "Invalid location accuracy", 422);
  }

  // The status/assignment check and the tracking-state write run in one
  // transaction with the job row locked FOR UPDATE. Job transitions that
  // clear tracking update the same job row, so they serialize against
  // this write — a location update cannot slip in after arrival wiped
  // the tracking state.
  const state = await prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT id FROM jobs WHERE id = ${jobId}::uuid AND "companyId" = ${context.companyId}::uuid FOR UPDATE`;
    const job = await transaction.job.findFirst({
      where: {
        id: jobId,
        companyId: context.companyId,
        assignedTechnicianId: context.userId,
      },
      select: {
        id: true,
        status: true,
        serviceAddress: { select: { lat: true, lng: true } },
      },
    });
    if (!job) throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);
    if (job.status !== "EN_ROUTE") {
      throw new AppError(
        "TRACKING_NOT_ACTIVE",
        "Tracking is only available while the job is en route",
        409,
      );
    }

    const existing = await transaction.jobTrackingState.findUnique({
      where: { jobId },
      select: { consentAt: true },
    });
    // Location sharing requires an explicit, recorded consent action —
    // the first update must carry consent:true; later updates reuse the
    // stored consentAt.
    const hasConsent = input.consent === true || existing?.consentAt != null;
    if (!hasConsent) {
      throw new AppError(
        "TRACKING_CONSENT_REQUIRED",
        "Location sharing consent is required before tracking can start",
        422,
      );
    }
    // Approximate ETA: straight-line distance to the job's service
    // address at a fixed urban speed. Null when the address has no
    // coordinates.
    const destLat = job.serviceAddress?.lat;
    const destLng = job.serviceAddress?.lng;
    const etaMinutes =
      destLat != null && destLng != null
        ? Math.max(
            1,
            Math.round(
              (distanceKm(
                input.latitude,
                input.longitude,
                Number(destLat),
                Number(destLng),
              ) /
                ETA_KM_PER_HOUR) *
                60,
            ),
          )
        : null;

    const state = await transaction.jobTrackingState.upsert({
      where: { jobId },
      create: {
        companyId: context.companyId,
        jobId,
        lastLat: input.latitude,
        lastLng: input.longitude,
        accuracy: input.accuracy,
        etaMinutes,
        sharingActive: true,
        consentAt: new Date(),
      },
      update: {
        lastLat: input.latitude,
        lastLng: input.longitude,
        accuracy: input.accuracy,
        etaMinutes,
        sharingActive: true,
        ...(existing?.consentAt == null && input.consent === true
          ? { consentAt: new Date() }
          : {}),
      },
      select: {
        lastLat: true,
        lastLng: true,
        accuracy: true,
        updatedAt: true,
        etaMinutes: true,
        sharingActive: true,
      },
    });
    return state;
  });

  await prisma.portalAuditEvent.create({
    data: {
      companyId: context.companyId,
      jobId,
      actorUserId: context.userId,
      action: "JOB_LOCATION_UPDATED",
      resourceType: "JobTrackingState",
      resourceId: jobId,
      metadata: { accuracy: input.accuracy ?? null },
    },
  });
  return state;
}

export async function getJobTracking(
  companyId: string,
  customerId: string,
  jobId: string,
) {
  const job = await prisma.job.findFirst({
    where: { id: jobId, companyId, customerId },
    select: { id: true, status: true },
  });
  if (!job) throw new AppError("RESOURCE_NOT_FOUND", "Job not found", 404);

  const state = await prisma.jobTrackingState.findFirst({
    where: { jobId, companyId, sharingActive: true },
    select: {
      lastLat: true,
      lastLng: true,
      accuracy: true,
      updatedAt: true,
      etaMinutes: true,
    },
  });
  if (!state) return { status: job.status, sharingActive: false };

  const stale = Date.now() - state.updatedAt.getTime() > STALE_AFTER_MS;
  await prisma.portalAuditEvent.create({
    data: {
      companyId,
      customerId,
      jobId,
      action: "JOB_TRACKING_VIEWED",
      resourceType: "JobTrackingState",
      resourceId: jobId,
      metadata: { stale },
    },
  });
  if (stale) return { status: job.status, sharingActive: true, stale: true };
  return { status: job.status, sharingActive: true, stale: false, ...state };
}

export async function clearJobTracking(jobId: string, companyId: string) {
  await prisma.jobTrackingState.deleteMany({ where: { jobId, companyId } });
}
