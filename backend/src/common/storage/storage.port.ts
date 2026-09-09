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
 
export interface StoragePort {
  createSignedUploadUrl(
    request: SignedUploadRequest,
  ): Promise<SignedUploadResult>;
}
 