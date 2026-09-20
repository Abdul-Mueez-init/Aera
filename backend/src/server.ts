import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./common/logger.js";
import { startInvoiceReminderScheduler } from "./modules/invoices/invoice-reminder.service.js";

const app = buildApp();

app.listen(env.PORT, env.HOST, () => {
  logger.info(
    { host: env.HOST, port: env.PORT, environment: env.NODE_ENV },
    "Aera API server started",
  );

  // Started here, not in buildApp(), so tests never spin up timers.
  if (env.INVOICE_REMINDERS_ENABLED) {
    startInvoiceReminderScheduler();
  }
});
