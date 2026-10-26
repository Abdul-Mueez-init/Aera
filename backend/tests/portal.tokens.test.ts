import { describe, it, expect } from "vitest";
import {
  generateToken,
  hashToken,
  timingSafeCompare,
  deriveHandshakeCode,
} from "../src/modules/portal/portal.tokens.js";

describe("Portal Tokens", () => {
  describe("generateToken", () => {
    it("should generate a 43-character base64url token", () => {
      const token = generateToken();
      expect(token).toHaveLength(43);
      // base64url uses only URL-safe characters
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("should generate unique tokens", () => {
      const token1 = generateToken();
      const token2 = generateToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe("hashToken", () => {
    it("should generate a consistent SHA-256 hex hash", () => {
      const token = "test-token";
      const hash1 = hashToken(token);
      const hash2 = hashToken(token);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex = 64 chars
      expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    });

    it("should generate different hashes for different tokens", () => {
      const hash1 = hashToken("token1");
      const hash2 = hashToken("token2");
      expect(hash1).not.toBe(hash2);
    });

    it("should not produce the original token", () => {
      const token = "test-token";
      const hash = hashToken(token);
      expect(hash).not.toBe(token);
    });
  });

  describe("timingSafeCompare", () => {
    it("should return true for equal strings", () => {
      const result = timingSafeCompare("test", "test");
      expect(result).toBe(true);
    });

    it("should return false for different strings", () => {
      const result = timingSafeCompare("test", "test2");
      expect(result).toBe(false);
    });

    it("should return false for strings of different lengths", () => {
      const result = timingSafeCompare("test", "test12");
      expect(result).toBe(false);
    });

    it("should handle empty strings", () => {
      const result = timingSafeCompare("", "");
      expect(result).toBe(true);
    });
  });

  describe("deriveHandshakeCode", () => {
    const secret = "test-secret-for-handshake-code";

    it("should generate a 6-digit code", () => {
      const code = deriveHandshakeCode(secret, "company-1", "job-1", 1);
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^\d{6}$/);
    });

    it("should generate consistent codes for same inputs", () => {
      const code1 = deriveHandshakeCode(secret, "company-1", "job-1", 1);
      const code2 = deriveHandshakeCode(secret, "company-1", "job-1", 1);
      expect(code1).toBe(code2);
    });

    it("should generate different codes for different versions", () => {
      const code1 = deriveHandshakeCode(secret, "company-1", "job-1", 1);
      const code2 = deriveHandshakeCode(secret, "company-1", "job-1", 2);
      expect(code1).not.toBe(code2);
    });

    it("should generate different codes for different jobs", () => {
      const code1 = deriveHandshakeCode(secret, "company-1", "job-1", 1);
      const code2 = deriveHandshakeCode(secret, "company-1", "job-2", 1);
      expect(code1).not.toBe(code2);
    });

    it("should generate different codes for different companies", () => {
      const code1 = deriveHandshakeCode(secret, "company-1", "job-1", 1);
      const code2 = deriveHandshakeCode(secret, "company-2", "job-1", 1);
      expect(code1).not.toBe(code2);
    });

    it("should generate different codes for different secrets", () => {
      const code1 = deriveHandshakeCode(secret, "company-1", "job-1", 1);
      const code2 = deriveHandshakeCode(
        "different-secret",
        "company-1",
        "job-1",
        1,
      );
      expect(code1).not.toBe(code2);
    });
  });
});
