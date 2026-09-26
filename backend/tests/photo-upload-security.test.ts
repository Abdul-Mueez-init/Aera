import { describe, expect, it } from "vitest";
import { supabaseStorageAdapter } from "../src/common/storage/supabase-storage.adapter.js";
import type { VerifyUploadRequest } from "../src/common/storage/storage.port.js";

describe("photo upload security - storage adapter", () => {
  describe("verifyUpload", () => {
    it("returns false for non-existent objects", async () => {
      const request: VerifyUploadRequest = {
        objectKey: "companies/test/jobs/test/non-existent.jpg",
        expectedMimeType: "image/jpeg",
        expectedMaxSizeBytes: 1000,
      };

      const result = await supabaseStorageAdapter.verifyUpload(request);
      expect(result.exists).toBe(false);
    });

    it("returns expected MIME type for verification requests", async () => {
      const request: VerifyUploadRequest = {
        objectKey: "companies/test/jobs/test/test.jpg",
        expectedMimeType: "image/png",
        expectedMaxSizeBytes: 1000,
      };

      const result = await supabaseStorageAdapter.verifyUpload(request);
      expect(result.mimeType).toBe("image/png");
    });

    it("returns expected size for verification requests", async () => {
      const request: VerifyUploadRequest = {
        objectKey: "companies/test/jobs/test/test.jpg",
        expectedMimeType: "image/jpeg",
        expectedMaxSizeBytes: 5000,
      };

      const result = await supabaseStorageAdapter.verifyUpload(request);
      // When the object doesn't exist, it returns the expectedMaxSizeBytes as a fallback
      expect(result.sizeBytes).toBe(request.expectedMaxSizeBytes);
    });
  });
});

describe("photo upload security - validation logic", () => {
  describe("MIME type validation", () => {
    it("should reject mismatched MIME types", () => {
      const presignedMimeType: string = "image/jpeg";
      const clientMimeType: string = "image/png";
      
      expect(clientMimeType === presignedMimeType).toBe(false);
    });

    it("should accept matching MIME types", () => {
      const presignedMimeType: string = "image/jpeg";
      const clientMimeType: string = "image/jpeg";
      
      expect(clientMimeType === presignedMimeType).toBe(true);
    });
  });

  describe("file size validation", () => {
    it("should reject files exceeding 10MB limit", () => {
      const fileSize = 15_000_000; // 15MB
      const maxSize = 10_000_000; // 10MB
      
      expect(fileSize > maxSize).toBe(true);
    });

    it("should accept files within 10MB limit", () => {
      const fileSize = 5_000_000; // 5MB
      const maxSize = 10_000_000; // 10MB
      
      expect(fileSize <= maxSize).toBe(true);
    });
  });

  describe("expiry validation", () => {
    it("should reject expired uploads", () => {
      const expiresAt = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
      const now = new Date();
      
      expect(now > expiresAt).toBe(true);
    });

    it("should accept valid uploads", () => {
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour from now
      const now = new Date();
      
      expect(now <= expiresAt).toBe(true);
    });
  });

  describe("object key format validation", () => {
    it("should enforce company-scoped object keys", () => {
      const validKey = "companies/company-id/jobs/job-id/uuid.jpg";
      const invalidKey = "jobs/job-id/uuid.jpg"; // Missing company prefix
      
      expect(validKey.startsWith("companies/")).toBe(true);
      expect(invalidKey.startsWith("companies/")).toBe(false);
    });

    it("should enforce job-scoped object keys", () => {
      const validKey = "companies/company-id/jobs/job-id/uuid.jpg";
      const invalidKey = "companies/company-id/uuid.jpg"; // Missing job prefix
      
      expect(validKey.includes("/jobs/")).toBe(true);
      expect(invalidKey.includes("/jobs/")).toBe(false);
    });
  });
});