import { randomUUID } from "node:crypto";
import { AppError } from "../../common/errors.js";
import type { AuthContext } from "../../common/auth/auth.types.js";
import type { PortalRequest } from "../portal/portal.middleware.js";
import { prisma } from "../../db/prisma.js";
import {
  createRequestMediaReadUrl,
  createRequestMediaUploadUrl,
  deleteRequestMediaObjects,
  verifyRequestMediaUpload,
} from "../../common/storage/supabase-storage.adapter.js";
import { logger } from "../../common/logger.js";
import { malwareScanner } from "./malware-scan.js";

const maxFilesPerRequest = 20;
// Per-session presign abuse cap: a stolen portal session cannot mint
// unlimited upload authorizations even though each file is still capped.
const maxPresignsPerSessionPerHour = 30;
// Unconfirmed presigns are swept once they are this far past expiry —
// long enough that an in-flight slow upload is never reaped mid-PUT.
const unconfirmedUploadGraceMs = 24 * 60 * 60 * 1000;
const maxBytesByMime: Record<string, number> = {
  "image/jpeg": 10_000_000,
  "image/png": 10_000_000,
  "image/heic": 10_000_000,
  "image/webp": 10_000_000,
  "video/mp4": 50_000_000,
  "video/quicktime": 50_000_000,
};

const mediaTypes = Object.keys(maxBytesByMime) as [string, ...string[]];

export function isRequestMediaType(
  value: string,
): value is keyof typeof maxBytesByMime {
  return value in maxBytesByMime;
}

function attachmentKind(mimeType: string) {
  return mimeType.startsWith("video/")
    ? ("VIDEO" as const)
    : mimeType.startsWith("image/")
      ? ("PHOTO" as const)
      : ("DOCUMENT" as const);
}

function portalContext(request: PortalRequest) {
  const context = request.portal;
  if (!context || context.scope !== "WORKSPACE") {
    throw new AppError("RESOURCE_NOT_FOUND", "Portal resource not found", 404);
  }
  return context;
}

async function assertRequestForStaff(context: AuthContext, requestId: string) {
  const request = await prisma.serviceRequest.findFirst({
    where: { id: requestId, companyId: context.companyId },
    select: { id: true },
  });
  if (!request)
    throw new AppError("RESOURCE_NOT_FOUND", "Service request not found", 404);
}

async function assertRequestForPortal(
  request: PortalRequest,
  requestId: string,
) {
  const context = portalContext(request);
  const serviceRequest = await prisma.serviceRequest.findFirst({
    where: {
      id: requestId,
      companyId: context.companyId,
      customerId: context.customerId,
    },
    select: { id: true },
  });
  if (!serviceRequest)
    throw new AppError("RESOURCE_NOT_FOUND", "Request not found", 404);
  return context;
}

async function presign(
  companyId: string,
  requestId: string,
  mimeType: string,
  uploader:
    | { uploaderType: "STAFF"; uploaderUserId: string }
    | { uploaderType: "PORTAL"; portalSessionId: string },
) {
  if (!isRequestMediaType(mimeType)) {
    throw new AppError(
      "VALIDATION_FAILED",
      "Unsupported request media type",
      422,
    );
  }
  const count = await prisma.serviceRequestAttachment.count({
    where: { companyId, requestId },
  });
  if (count >= maxFilesPerRequest) {
    throw new AppError(
      "UPLOAD_LIMIT_REACHED",
      "This request already has the maximum number of files",
      422,
    );
  }
  if (uploader.uploaderType === "PORTAL") {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const sessionPresigns = await prisma.serviceRequestUpload.count({
      where: {
        companyId,
        portalSessionId: uploader.portalSessionId,
        createdAt: { gte: hourAgo },
      },
    });
    if (sessionPresigns >= maxPresignsPerSessionPerHour) {
      throw new AppError(
        "RATE_LIMITED",
        "Too many upload authorizations — please try again later",
        429,
      );
    }
  }
  const result = await createRequestMediaUploadUrl(
    companyId,
    requestId,
    mimeType,
  );
  await prisma.serviceRequestUpload.create({
    data: {
      id: randomUUID(),
      companyId,
      requestId,
      mimeType,
      objectKey: result.objectKey,
      expiresAt: new Date(result.expiresAt),
      uploaderType: uploader.uploaderType,
      uploaderUserId:
        uploader.uploaderType === "STAFF" ? uploader.uploaderUserId : undefined,
      portalSessionId:
        uploader.uploaderType === "PORTAL"
          ? uploader.portalSessionId
          : undefined,
    },
  });
  return result;
}

export async function presignRequestMedia(
  context: AuthContext,
  requestId: string,
  mimeType: string,
) {
  await assertRequestForStaff(context, requestId);
  return presign(context.companyId, requestId, mimeType, {
    uploaderType: "STAFF",
    uploaderUserId: context.userId,
  });
}

export async function presignPortalRequestMedia(
  request: PortalRequest,
  requestId: string,
  mimeType: string,
) {
  const context = await assertRequestForPortal(request, requestId);
  return presign(context.companyId, requestId, mimeType, {
    uploaderType: "PORTAL",
    portalSessionId: context.sessionId,
  });
}

async function confirm(
  companyId: string,
  requestId: string,
  objectKey: string,
  mimeType: string,
  caption: string | undefined,
  uploader:
    | { uploaderType: "STAFF"; uploaderUserId: string }
    | { uploaderType: "PORTAL"; portalSessionId: string },
) {
  const upload = await prisma.serviceRequestUpload.findUnique({
    where: { objectKey },
  });
  if (
    !upload ||
    upload.companyId !== companyId ||
    upload.requestId !== requestId ||
    upload.uploaderType !== uploader.uploaderType ||
    (uploader.uploaderType === "STAFF" &&
      upload.uploaderUserId !== uploader.uploaderUserId) ||
    (uploader.uploaderType === "PORTAL" &&
      upload.portalSessionId !== uploader.portalSessionId)
  ) {
    throw new AppError(
      "INVALID_UPLOAD",
      "This upload does not belong to the current request",
      403,
    );
  }
  if (upload.confirmedAt) {
    throw new AppError(
      "UPLOAD_ALREADY_CONFIRMED",
      "This upload has already been confirmed",
      409,
    );
  }
  if (upload.expiresAt < new Date()) {
    throw new AppError(
      "UPLOAD_EXPIRED",
      "This upload authorization has expired",
      410,
    );
  }
  if (mimeType !== upload.mimeType) {
    throw new AppError(
      "MIME_TYPE_MISMATCH",
      "The uploaded file type does not match the authorization",
      422,
    );
  }
  const maxBytes = maxBytesByMime[upload.mimeType];
  const verification = await verifyRequestMediaUpload(
    objectKey,
    upload.mimeType,
    maxBytes,
  );
  if (!verification.exists)
    throw new AppError(
      "UPLOAD_NOT_FOUND",
      "The uploaded file was not found",
      404,
    );
  if (verification.mimeType !== upload.mimeType) {
    throw new AppError(
      "MIME_TYPE_MISMATCH",
      "The uploaded file's content type does not match",
      422,
    );
  }
  if (
    !Number.isFinite(verification.sizeBytes) ||
    verification.sizeBytes <= 0 ||
    verification.sizeBytes > maxBytes
  ) {
    throw new AppError(
      "UPLOAD_INVALID",
      "The uploaded file size is not allowed",
      422,
    );
  }
  const verdict = await malwareScanner().scan(objectKey);
  if (verdict === "INFECTED") {
    throw new AppError(
      "UPLOAD_REJECTED",
      "The uploaded file was rejected by security scanning",
      422,
    );
  }
  const attachment = await prisma.$transaction(async (transaction) => {
    const claimed = await transaction.serviceRequestUpload.updateMany({
      where: { objectKey, confirmedAt: null },
      data: { confirmedAt: new Date() },
    });
    if (claimed.count !== 1)
      throw new AppError(
        "UPLOAD_ALREADY_CONFIRMED",
        "This upload has already been confirmed",
        409,
      );
    return transaction.serviceRequestAttachment.create({
      data: {
        companyId,
        requestId,
        uploaderType: upload.uploaderType,
        uploaderUserId: upload.uploaderUserId,
        portalSessionId: upload.portalSessionId,
        objectKey,
        mimeType: upload.mimeType,
        sizeBytes: BigInt(verification.sizeBytes),
        kind: attachmentKind(upload.mimeType),
        caption: caption ?? null,
      },
    });
  });
  return JSON.parse(
    JSON.stringify(attachment, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  );
}

export async function confirmRequestMedia(
  context: AuthContext,
  requestId: string,
  objectKey: string,
  mimeType: string,
  caption?: string,
) {
  await assertRequestForStaff(context, requestId);
  return confirm(context.companyId, requestId, objectKey, mimeType, caption, {
    uploaderType: "STAFF",
    uploaderUserId: context.userId,
  });
}

export async function confirmPortalRequestMedia(
  request: PortalRequest,
  requestId: string,
  objectKey: string,
  mimeType: string,
  caption?: string,
) {
  const context = await assertRequestForPortal(request, requestId);
  return confirm(context.companyId, requestId, objectKey, mimeType, caption, {
    uploaderType: "PORTAL",
    portalSessionId: context.sessionId,
  });
}

export async function listRequestMedia(
  context: AuthContext,
  requestId: string,
) {
  await assertRequestForStaff(context, requestId);
  const attachments = await prisma.serviceRequestAttachment.findMany({
    where: { companyId: context.companyId, requestId },
    orderBy: { createdAt: "desc" },
    take: maxFilesPerRequest,
  });
  return Promise.all(
    attachments.map(async (attachment) => ({
      ...attachment,
      sizeBytes: attachment.sizeBytes.toString(),
      signedReadUrl: await createRequestMediaReadUrl(attachment.objectKey),
    })),
  );
}

export async function listPortalRequestMedia(
  request: PortalRequest,
  requestId: string,
) {
  const context = await assertRequestForPortal(request, requestId);
  const attachments = await prisma.serviceRequestAttachment.findMany({
    where: { companyId: context.companyId, requestId },
    orderBy: { createdAt: "desc" },
    take: maxFilesPerRequest,
  });
  return Promise.all(
    attachments.map(async (attachment) => ({
      id: attachment.id,
      mimeType: attachment.mimeType,
      kind: attachment.kind,
      caption: attachment.caption,
      sizeBytes: attachment.sizeBytes.toString(),
      createdAt: attachment.createdAt,
      signedReadUrl: await createRequestMediaReadUrl(attachment.objectKey),
    })),
  );
}

export { mediaTypes };

/**
 * Sweep expired, never-confirmed request-media presigns (Phase 3.2).
 * Runs inside the portal maintenance sweep. Deletes the DB row only when
 * no attachment references the object; the storage object is removed
 * best-effort so a transient storage failure cannot block the row cleanup.
 * Returns the number of uploads swept.
 */
export async function sweepExpiredRequestUploads(now = new Date()) {
  const cutoff = new Date(now.getTime() - unconfirmedUploadGraceMs);
  const expired = await prisma.serviceRequestUpload.findMany({
    where: {
      confirmedAt: null,
      expiresAt: { lt: cutoff },
    },
    select: { id: true, objectKey: true },
    take: 200,
  });
  if (expired.length === 0) return 0;
  const attachments = await prisma.serviceRequestAttachment.findMany({
    where: { objectKey: { in: expired.map((u) => u.objectKey) } },
    select: { objectKey: true },
  });
  const referenced = new Set(attachments.map((a) => a.objectKey));
  const deletable = expired.filter((u) => !referenced.has(u.objectKey));
  if (deletable.length === 0) return 0;
  const objectKeys = deletable.map((u) => u.objectKey);
  await deleteRequestMediaObjects(objectKeys).catch((error) => {
    logger.warn(
      { err: error, count: objectKeys.length },
      "request media sweep: storage delete failed",
    );
  });
  const deleted = await prisma.serviceRequestUpload.deleteMany({
    where: { id: { in: deletable.map((u) => u.id) }, confirmedAt: null },
  });
  return deleted.count;
}
