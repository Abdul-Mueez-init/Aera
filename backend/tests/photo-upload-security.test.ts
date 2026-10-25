import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VerifyUploadRequest } from "../src/common/storage/storage.port.js";

// The adapter under test talks to Supabase Storage. These tests mock the
// Supabase client and the HEAD request so they run fully offline and
// assert REAL verification behavior: verifyUpload must report the
// object's actual Content-Type / Content-Length measured via HEAD —
// the previous implementation echoed the caller's expected values back,
// and the previous tests asserted exactly that vacuous behavior (and
// failed against the fake test storage host besides).
const signedUrlBehavior = {
  error: null as unknown,
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        createSignedUrl: async () => {
          if (signedUrlBehavior.error) {
            return { data: null, error: signedUrlBehavior.error };
          }
          return {
            data: { signedUrl: "https://storage.test/signed-object" },
            error: null,
          };
        },
      }),
    },
  }),
}));

const { supabaseStorageAdapter } = await import(
  "../src/common/storage/supabase-storage.adapter.js"
);

function headResponse(init: {
  ok: boolean;
  status?: number;
  contentLength?: string;
  contentType?: string;
}) {
  return {
    ok: init.ok,
    status: init.status ?? (init.ok ? 200 : 404),
    headers: {
      get: (name: string) => {
        if (name === "content-length") return init.contentLength ?? null;
        if (name === "content-type") return init.contentType ?? null;
        return null;
      },
    },
  } as unknown as Response;
}

const request: VerifyUploadRequest = {
  objectKey: "companies/c1/jobs/j1/photo.jpg",
  expectedMimeType: "image/jpeg",
  expectedMaxSizeBytes: 10_000_000,
};

describe("photo upload security - verifyUpload measures the actual object", () => {
  beforeEach(() => {
    signedUrlBehavior.error = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports exists:false when no signed URL can be created (object missing)", async () => {
    signedUrlBehavior.error = new Error("Object not found");
    const result = await supabaseStorageAdapter.verifyUpload(request);
    expect(result.exists).toBe(false);
  });

  it("reports exists:false when the HEAD request is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => headResponse({ ok: false, status: 404 })),
    );
    const result = await supabaseStorageAdapter.verifyUpload(request);
    expect(result.exists).toBe(false);
  });

  it("reports exists:false when the HEAD request fails outright", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network unreachable");
      }),
    );
    const result = await supabaseStorageAdapter.verifyUpload(request);
    expect(result.exists).toBe(false);
  });

  it("returns the ACTUAL content type and size from the HEAD response, not the caller's expectations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        headResponse({
          ok: true,
          contentLength: "4321",
          contentType: "image/png",
        }),
      ),
    );
    const result = await supabaseStorageAdapter.verifyUpload(request);
    expect(result.exists).toBe(true);
    // The request "expected" image/jpeg and a 10MB cap: a verify that
    // echoes expectations would return those. The real HEAD says the
    // object is a 4321-byte PNG, and that is what must surface so the
    // caller can reject the presign/type mismatch.
    expect(result.mimeType).toBe("image/png");
    expect(result.sizeBytes).toBe(4321);
  });

  it("normalizes a content-type with parameters", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        headResponse({
          ok: true,
          contentLength: "100",
          contentType: "image/jpeg; charset=binary",
        }),
      ),
    );
    const result = await supabaseStorageAdapter.verifyUpload(request);
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.sizeBytes).toBe(100);
  });
});
