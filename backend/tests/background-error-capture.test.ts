import { describe, expect, it } from "vitest";
import { captureBackgroundError } from "../src/common/observability.js";

describe("captureBackgroundError", () => {
  it("does not throw when Sentry is not initialized", () => {
    // Should not throw even if Sentry is not initialized
    expect(() => {
      captureBackgroundError(new Error("test error"), "test-source", {
        jobId: "job-123",
        attempt: 3,
      });
    }).not.toThrow();
  });

  it("handles various context value types", () => {
    expect(() => {
      captureBackgroundError(new Error("test error"), "test-source", {
        jobId: "job-123",
        attempt: 3,
        success: false,
        optional: undefined,
      });
    }).not.toThrow();
  });
});
