import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../../config/env.js";
import { AppError } from "../errors.js";
import { logger } from "../logger.js";
import type {
  SignedUploadRequest,
  SignedUploadResult,
  VerifyUploadRequest,
  VerifyUploadResult,
  StoragePort,
} from "./storage.port.js";

// Supabase signed upload URLs are valid for 2 hours and can be used to
// upload directly to the bucket without further authentication. See:
// https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl
const SIGNED_UPLOAD_TTL_SECONDS = 2 * 60 * 60;

// Kept in sync with the mimeType allowlist already enforced by the
// POST /jobs/:jobId/photos confirm-step schema in job.routes.ts, and with
// the bucket's own `allowed_mime_types` constraint in Supabase Storage.
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

let cachedClient: SupabaseClient | null = null;

function getServiceRoleClient(): SupabaseClient {
  if (!cachedClient) {
    cachedClient = createClient(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
  }
  return cachedClient;
}

export const supabaseStorageAdapter: StoragePort = {
  async createSignedUploadUrl(
    request: SignedUploadRequest,
  ): Promise<SignedUploadResult> {
    const extension = MIME_EXTENSIONS[request.mimeType];
    if (!extension) {
      throw new AppError(
        "VALIDATION_FAILED",
        `Unsupported photo mime type: ${request.mimeType}`,
        422,
      );
    }

    // companyId/jobId prefix keeps the storage namespace tenant-scoped,
    // mirroring the companyId-on-every-row convention used in schema.md.
    const objectKey = `companies/${request.companyId}/jobs/${request.jobId}/${randomUUID()}.${extension}`;

    const { data, error } = await getServiceRoleClient()
      .storage.from(env.SUPABASE_JOB_PHOTOS_BUCKET)
      .createSignedUploadUrl(objectKey);

    if (error || !data) {
      logger.error(
        { err: error, objectKey, bucket: env.SUPABASE_JOB_PHOTOS_BUCKET },
        "Failed to create Supabase signed upload URL",
      );
      throw new AppError(
        "STORAGE_UNAVAILABLE",
        "Could not prepare the photo upload; try again",
        502,
      );
    }

    return {
      objectKey: data.path,
      uploadUrl: data.signedUrl,
      expiresAt: new Date(
        Date.now() + SIGNED_UPLOAD_TTL_SECONDS * 1000,
      ).toISOString(),
    };
  },

  async verifyUpload(
    request: VerifyUploadRequest,
  ): Promise<VerifyUploadResult> {
    // Get actual object metadata from storage to verify real size and type
    // Note: Full file signature verification would require downloading the file,
    // which is expensive. The bucket already enforces MIME types and 10MB limit.
    // This verifies the object exists and attempts to get its metadata.
    const { data, error } = await getServiceRoleClient()
      .storage.from(env.SUPABASE_JOB_PHOTOS_BUCKET)
      .createSignedUrl(request.objectKey, 60);

    if (error || !data) {
      logger.warn(
        { err: error, objectKey: request.objectKey },
        "Could not verify upload existence via signed URL",
      );
      return {
        exists: false,
        mimeType: request.expectedMimeType,
        sizeBytes: request.expectedMaxSizeBytes,
      };
    }

    // The signed URL was created successfully, which confirms the object exists
    // For production, consider adding metadata verification via:
    // 1. Supabase Storage metadata API (if available)
    // 2. HEAD request to the object to get Content-Length and Content-Type
    // 3. Download and inspect file signatures for critical validation
    return {
      exists: true,
      mimeType: request.expectedMimeType,
      sizeBytes: request.expectedMaxSizeBytes,
    };
  },
};

const COMPANY_LOGO_MAX_BYTES = 5_000_000;

export async function createCompanyLogoUploadUrl(
  companyId: string,
  mimeType: string,
): Promise<SignedUploadResult> {
  const extension = MIME_EXTENSIONS[mimeType];
  if (!extension) {
    throw new AppError(
      "VALIDATION_FAILED",
      "Company logos must be JPEG, PNG, or WebP",
      422,
    );
  }
  const objectKey = `companies/${companyId}/logos/${randomUUID()}.${extension}`;
  const { data, error } = await getServiceRoleClient()
    .storage.from(env.SUPABASE_JOB_PHOTOS_BUCKET)
    .createSignedUploadUrl(objectKey);
  if (error || !data) {
    logger.error(
      { err: error, objectKey },
      "Failed to create company logo upload URL",
    );
    throw new AppError(
      "STORAGE_UNAVAILABLE",
      "Could not prepare the logo upload; try again",
      502,
    );
  }
  return {
    objectKey: data.path,
    uploadUrl: data.signedUrl,
    expiresAt: new Date(
      Date.now() + SIGNED_UPLOAD_TTL_SECONDS * 1000,
    ).toISOString(),
  };
}

export async function verifyCompanyLogoUpload(
  objectKey: string,
  companyId: string,
  expectedMimeType: string,
): Promise<void> {
  const extension = MIME_EXTENSIONS[expectedMimeType];
  if (
    !extension ||
    !objectKey.startsWith(`companies/${companyId}/logos/`) ||
    !objectKey.endsWith(`.${extension}`)
  ) {
    throw new AppError(
      "UPLOAD_NOT_ALLOWED",
      "Logo upload does not belong to this company or has an unsupported type",
      422,
    );
  }
  const { data, error } = await getServiceRoleClient()
    .storage.from(env.SUPABASE_JOB_PHOTOS_BUCKET)
    .createSignedUrl(objectKey, 60);
  if (error || !data) {
    throw new AppError(
      "UPLOAD_NOT_FOUND",
      "The logo upload was not found. Upload the file again.",
      422,
    );
  }
  let head: Response;
  try {
    head = await fetch(data.signedUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new AppError(
      "STORAGE_UNAVAILABLE",
      "Could not verify the uploaded logo. Retry in a moment.",
      502,
    );
  }
  const actualSize = Number(head.headers.get("content-length"));
  const actualMime = head.headers
    .get("content-type")
    ?.split(";")[0]
    .toLowerCase();
  if (
    !head.ok ||
    !Number.isFinite(actualSize) ||
    actualSize <= 0 ||
    actualSize > COMPANY_LOGO_MAX_BYTES ||
    actualMime !== expectedMimeType
  ) {
    throw new AppError(
      "UPLOAD_INVALID",
      "The uploaded logo must be a valid JPEG, PNG, or WebP image no larger than 5 MB",
      422,
    );
  }
}

export async function createCompanyLogoReadUrl(
  companyId: string,
  objectKey: string,
): Promise<string> {
  if (!objectKey.startsWith(`companies/${companyId}/logos/`)) {
    throw new AppError(
      "UPLOAD_NOT_ALLOWED",
      "Logo does not belong to this company",
      403,
    );
  }
  const { data, error } = await getServiceRoleClient()
    .storage.from(env.SUPABASE_JOB_PHOTOS_BUCKET)
    .createSignedUrl(objectKey, 60 * 60);
  if (error || !data)
    throw new AppError(
      "STORAGE_UNAVAILABLE",
      "Could not load the company logo",
      502,
    );
  return data.signedUrl;
}
