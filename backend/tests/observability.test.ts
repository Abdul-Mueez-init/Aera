import { describe, expect, it } from "vitest";
import type { Event } from "@sentry/node";
import {
  type StreamedSpan,
  redactUrl,
  scrubSentryEvent,
  scrubSentrySpan,
  shouldReportError,
} from "../src/common/observability.js";
import { AppError } from "../src/common/errors.js";

describe("shouldReportError", () => {
  it("ignores expected client errors", () => {
    expect(shouldReportError(new AppError("AUTH_FORBIDDEN", "no", 403))).toBe(
      false,
    );
    expect(shouldReportError(new AppError("NOT_FOUND", "no", 404))).toBe(false);
    expect(shouldReportError(new AppError("VALIDATION_FAILED", "no"))).toBe(
      false,
    );
  });

  it("reports server errors and errors without a status", () => {
    expect(shouldReportError(new AppError("BOOM", "boom", 500))).toBe(true);
    expect(shouldReportError(new AppError("DOWN", "down", 503))).toBe(true);
    expect(shouldReportError(new Error("unexpected"))).toBe(true);
    expect(shouldReportError({ status: "502" })).toBe(true);
    expect(shouldReportError({ status: "400" })).toBe(false);
    expect(shouldReportError("a thrown string")).toBe(true);
  });
});

describe("redactUrl", () => {
  it("redacts portal and shared-quote capability tokens", () => {
    expect(redactUrl("https://api.aera.app/api/v1/portal/abc123XYZ")).toBe(
      "https://api.aera.app/api/v1/portal/[redacted]",
    );
    expect(redactUrl("/api/v1/portal/abc123XYZ/reviews?page=1")).toBe(
      "/api/v1/portal/[redacted]/reviews?page=1",
    );
    expect(redactUrl("/api/v1/quotes/shared/tok_9/respond")).toBe(
      "/api/v1/quotes/shared/[redacted]/respond",
    );
  });

  it("redacts secret query parameters and leaves normal URLs alone", () => {
    expect(redactUrl("/x?key=SECRET&page=2")).toBe("/x?key=[redacted]&page=2");
    expect(redactUrl("/api/v1/jobs?page=1")).toBe("/api/v1/jobs?page=1");
  });
});

describe("scrubSentryEvent", () => {
  it("removes credentials, bodies and PII from events", () => {
    const event: Event = {
      request: {
        url: "https://api.aera.app/api/v1/portal/secret-token",
        headers: {
          Authorization: "Bearer abc",
          cookie: "sid=1",
          "User-Agent": "aera-mobile",
        },
        cookies: { sid: "1" },
        data: { email: "sarah@example.com", password: "hunter2" },
        query_string: "token=abc&page=1",
      },
      user: { id: "user-1", email: "sarah@example.com", ip_address: "1.2.3.4" },
      breadcrumbs: [
        {
          category: "http",
          data: { url: "https://x.test/api/v1/quotes/shared/tok" },
        },
      ],
    };

    const scrubbed = scrubSentryEvent(event);

    expect(scrubbed.request?.headers).toEqual({ "User-Agent": "aera-mobile" });
    expect(scrubbed.request?.cookies).toBeUndefined();
    expect(scrubbed.request?.data).toBeUndefined();
    expect(scrubbed.request?.url).toBe(
      "https://api.aera.app/api/v1/portal/[redacted]",
    );
    expect(scrubbed.request?.query_string).toBe("token=[redacted]&page=1");
    expect(scrubbed.user).toEqual({ id: "user-1" });
    expect(scrubbed.breadcrumbs?.[0]?.data?.url).toBe(
      "https://x.test/api/v1/quotes/shared/[redacted]",
    );
  });

  it("handles events with no request or user", () => {
    expect(scrubSentryEvent({ message: "hi" })).toEqual({ message: "hi" });
  });
});

describe("scrubSentrySpan", () => {
  it("redacts capability tokens in span names and URL attributes", () => {
    const span: StreamedSpan = {
      trace_id: "t",
      span_id: "s",
      name: "GET /api/v1/portal/secret-token",
      start_timestamp: 1,
      status: "ok",
      is_segment: false,
      attributes: {
        "url.full": "https://api.aera.app/api/v1/quotes/shared/tok/respond",
        "http.route": "/api/v1/portal/:token",
        "http.status_code": 200,
      },
    };

    const scrubbed = scrubSentrySpan(span);

    expect(scrubbed.name).toBe("GET /api/v1/portal/[redacted]");
    expect(scrubbed.attributes["url.full"]).toBe(
      "https://api.aera.app/api/v1/quotes/shared/[redacted]/respond",
    );
    expect(scrubbed.attributes["http.route"]).toBe("/api/v1/portal/:token");
    expect(scrubbed.attributes["http.status_code"]).toBe(200);
  });
});
