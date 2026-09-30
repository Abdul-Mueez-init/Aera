import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./common/logger.js";
import { startInvoiceReminderScheduler } from "./modules/invoices/invoice-reminder.service.js";

const app = buildApp();

const server = app.listen(env.PORT, env.HOST, () => {
  logger.info(
    { host: env.HOST, port: env.PORT, environment: env.NODE_ENV },
    "Aera API server started",
  );

  // Started here, not in buildApp(), so tests never spin up timers.
  if (env.INVOICE_REMINDERS_ENABLED) {
    startInvoiceReminderScheduler();
  }
});

// Graceful shutdown: stop accepting new connections, flush Sentry, then exit
const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, "Shutdown signal received");

  // Stop accepting new connections
  await new Promise<void>((resolve) => {
    server.close(() => {
      logger.info("HTTP server closed");
      resolve();
    });
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

// Force exit after 10 seconds if graceful shutdown hangs
const forceExitTimer = setTimeout(() => {
  logger.warn("Forced shutdown after timeout");
  process.exit(1);
}, 10000);
forceExitTimer.unref();

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
