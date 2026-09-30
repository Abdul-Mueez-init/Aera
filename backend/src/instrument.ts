/**
 * Sentry bootstrap. This file is loaded by Node's --import flag BEFORE any
 * application module (see the "start" script in package.json), which is what
 * lets Sentry instrument Express, http and the database driver. Do not import
 * it from app code, and do not add other imports here that pull in express,
 * pg or prisma.
 *
 * With SENTRY_DSN unset (local dev, tests, CI) nothing is initialised and the
 * whole SDK stays a no-op.
 */
import * as Sentry from "@sentry/node";
import { env } from "./config/env.js";
import {
  scrubSentryEvent,
  scrubSentrySpan,
  shouldReportError,
} from "./common/observability.js";

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    release: env.SENTRY_RELEASE,
    // Aera holds customer PII, so opt out of everything sensitive that the
    // SDK would otherwise collect. Each field below overrides an SDK default
    // that is "on" (SDK v11 replaced sendDefaultPii with dataCollection).
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: {
        request: { allow: ["user-agent", "content-type"] },
        response: false,
      },
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    // Free plans have small quotas: sample performance data lightly, but
    // capture every error.
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    integrations: [
      // Errors are captured where they are thrown, before our own error
      // middleware runs. Only 5xx / status-less errors become issues.
      Sentry.expressIntegration({ shouldHandleError: shouldReportError }),
    ],
    beforeSend: scrubSentryEvent,
    beforeSendSpan: scrubSentrySpan,
    // console.* output is free-form text that can carry URLs or customer
    // data; the API logs through pino, so these breadcrumbs add risk, not signal.
    beforeBreadcrumb: (breadcrumb) =>
      breadcrumb.category === "console" ? null : breadcrumb,
  });
}
