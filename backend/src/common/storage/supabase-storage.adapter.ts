import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../../config/env.js";
import { AppError } from "../errors.js";
import { logger } from "../logger.js";
import type {
  SignedUploadRequest,
  SignedUploadResult,
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
};
