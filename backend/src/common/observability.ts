import * as Sentry from "@sentry/node";
import type { Event, NodeOptions } from "@sentry/node";
import type { AuthContext } from "./auth/auth.types.js";

/**
 * Error/crash reporting helpers (Phase 12 hardening).
 *
 * Sentry is initialised in src/instrument.ts, which must be loaded with
 * `--import` before the app. Everything in this file is safe to call when
 * Sentry was never initialised (tests, local dev without a DSN): the SDK
 * turns every call into a no-op, so callers never need an "is enabled" guard.
 *
 * Privacy rule: Aera stores customer PII, so we never send user emails,
 * request bodies, cookies or Authorization headers, and we redact
 * capability tokens that live in URLs (portal and shared-quote links).
 */

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-goog-api-key",
]);

// Public capability tokens travel in the URL path, so the path itself is
// sensitive: anyone holding /portal/<token> can view that customer's data.
const TOKEN_PATH =
  /(\/api\/v1\/portal\/|\/api\/v1\/quotes\/shared\/)[^/?#\s]+/g;
const SENSITIVE_QUERY =
  /([?&](?:key|token|api_key|apikey|access_token)=)[^&#\s]*/gi;

export function redactUrl(url: string): string {
  return url
    .replace(TOKEN_PATH, "$1[redacted]")
    .replace(SENSITIVE_QUERY, "$1[redacted]");
}

/**
 * Removes anything sensitive from an outgoing Sentry event. Used for both
 * error events (beforeSend) and performance transactions
 * (beforeSendTransaction). Pure and synchronous so it can be unit tested.
 */
export function scrubSentryEvent<T extends Event>(event: T): T {
  const request = event.request;
  if (request) {
    if (request.headers) {
      const cleaned: Record<string, string> = {};
      for (const [name, value] of Object.entries(request.headers)) {
        if (!SENSITIVE_HEADERS.has(name.toLowerCase())) {
          cleaned[name] = value;
        }
      }
      request.headers = cleaned;
    }
    delete request.cookies;
    delete request.data;
    if (typeof request.url === "string") {
      request.url = redactUrl(request.url);
    }
    if (typeof request.query_string === "string") {
      request.query_string = redactUrl(`?${request.query_string}`).slice(1);
    }
  }

  if (event.breadcrumbs) {
    for (const breadcrumb of event.breadcrumbs) {
      const url = breadcrumb.data?.url;
      if (breadcrumb.data && typeof url === "string") {
        breadcrumb.data.url = redactUrl(url);
      }
    }
  }

  // Never attach anything beyond the opaque user id, even if a future change
  // calls setUser with more.
  if (event.user) {
    event.user = event.user.id === undefined ? {} : { id: event.user.id };
  }

  return event;
}

// @sentry/node does not export the streamed span type by name, so derive it
// from the beforeSendSpan option it is passed to.
export type StreamedSpan = Parameters<
  NonNullable<NodeOptions["beforeSendSpan"]>
>[0];

const URL_ATTRIBUTE_KEYS = new Set([
  "url.full",
  "url.path",
  "url.query",
  "http.url",
  "http.target",
]);

/**
 * Span counterpart of scrubSentryEvent. Sentry SDK v11 streams spans by
 * default, so performance data never passes through beforeSendTransaction;
 * this is what keeps capability tokens out of traces.
 */
export function scrubSentrySpan(span: StreamedSpan): StreamedSpan {
  span.name = redactUrl(span.name);
  for (const [key, attribute] of Object.entries(span.attributes)) {
    if (!URL_ATTRIBUTE_KEYS.has(key)) continue;
    if (typeof attribute === "string") {
      span.attributes[key] = redactUrl(attribute);
    } else if (
      typeof attribute === "object" &&
      attribute !== null &&
      "value" in attribute &&
      typeof attribute.value === "string"
    ) {
      attribute.value = redactUrl(attribute.value);
    }
  }
  return span;
}

function readStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const candidate = error as { statusCode?: unknown; status?: unknown };
  const raw = candidate.statusCode ?? candidate.status;
  const numeric = typeof raw === "string" ? Number(raw) : raw;
  return typeof numeric === "number" && Number.isFinite(numeric)
    ? numeric
    : undefined;
}

/**
 * Decides which errors are worth a Sentry issue. Expected client errors
 * (validation, 401/403/404/409, and every AppError below 500) are normal
 * control flow and already appear in structured logs, so reporting them would
 * burn the free-plan quota and bury real bugs. Anything without a status,
 * and every 5xx, is reported.
 */
export function shouldReportError(error: unknown): boolean {
  const status = readStatus(error);
  return status === undefined || status >= 500;
}

/** Makes every event in the current request searchable by the API's request id. */
export function tagRequestId(requestId: string): void {
  Sentry.getIsolationScope().setTag("request_id", requestId);
}

/**
 * Attaches the authenticated principal to the current request's events.
 * Only opaque identifiers are sent: no email, name or phone number.
 */
export function attachPrincipalToScope(auth: AuthContext): void {
  const scope = Sentry.getIsolationScope();
  scope.setUser({ id: auth.userId });
  scope.setTag("company_id", auth.companyId);
  scope.setTag("role", auth.role);
}

/**
 * For failures that never pass through Express (queue jobs, schedulers,
 * provider adapters). `context` carries small non-sensitive identifiers such
 * as a job type or attempt number.
 */
export function captureBackgroundError(
  error: unknown,
  source: string,
  context: Record<string, string | number | boolean | undefined> = {},
): void {
  Sentry.withScope((scope) => {
    scope.setTag("source", source);
    scope.setContext("background", context);
    Sentry.captureException(error);
  });
}
