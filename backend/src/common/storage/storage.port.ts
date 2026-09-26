export interface SignedUploadRequest {
  companyId: string;
  jobId: string;
  mimeType: string;
}

export interface SignedUploadResult {
  objectKey: string;
  uploadUrl: string;
  expiresAt: string;
}

export interface VerifyUploadRequest {
  objectKey: string;
  expectedMimeType: string;
  expectedMaxSizeBytes: number;
}

export interface VerifyUploadResult {
  exists: boolean;
  mimeType: string;
  sizeBytes: number;
}

export interface StoragePort {
  createSignedUploadUrl(
    request: SignedUploadRequest,
  ): Promise<SignedUploadResult>;
  verifyUpload(
    request: VerifyUploadRequest,
  ): Promise<VerifyUploadResult>;
}
