import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./common/logger.js";
import { startInvoiceReminderScheduler } from "./modules/invoices/invoice-reminder.service.js";

const SHUTDOWN_TIMEOUT_MS = 10_000;

const app = buildApp();

let stopInvoiceReminders: (() => void) | undefined;

const server = app.listen(env.PORT, env.HOST, () => {
  logger.info(
    { host: env.HOST, port: env.PORT, environment: env.NODE_ENV },
    "Aera API server started",
  );

  // Started here, not in buildApp(), so tests never spin up timers.
  if (env.INVOICE_REMINDERS_ENABLED) {
    stopInvoiceReminders = startInvoiceReminderScheduler();
  }
});

// Fail loudly if the port is taken / not bindable instead of hanging silently.
server.on("error", (error) => {
  logger.fatal({ err: error }, "HTTP server failed to start");
  process.exit(1);
});

let shuttingDown = false;

// Graceful shutdown: stop accepting new connections, drain, flush Sentry, exit.
const shutdown = async (signal: string): Promise<void> => {
  // A second SIGINT/SIGTERM must not start a second shutdown.
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info({ signal }, "Shutdown signal received");

  // The watchdog starts HERE, when shutdown begins. (It used to be armed at
  // module load, which force-killed a healthy server 10s after every start.)
  const forceExitTimer = setTimeout(() => {
    logger.warn("Forced shutdown after timeout");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExitTimer.unref();

  stopInvoiceReminders?.();

  // Stop accepting new connections. server.close() only resolves once every
  // connection ends, and idle keep-alive sockets would otherwise hold it open
  // until the watchdog fires, so drop those immediately.
  await new Promise<void>((resolve) => {
    server.close((error) => {
      if (error) {
        logger.warn({ err: error }, "HTTP server close reported an error");
      } else {
        logger.info("HTTP server closed");
      }
      resolve();
    });
    server.closeIdleConnections();
  });

  // Flush pending Sentry events (2 second timeout)
  try {
    const Sentry = await import("@sentry/node");
    await Sentry.close(2000);
    logger.info("Sentry flushed");
  } catch (error) {
    // Sentry might not be initialized (no DSN) - that's fine
    logger.debug({ err: error }, "Sentry flush skipped or failed");
  }

  logger.info("Shutdown complete");
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
