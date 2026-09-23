import { prisma } from "../../db/prisma.js";
import { logger } from "../../common/logger.js";
import type { SmsMessage } from "./sms.port.js";
// Type-only import: erased at compile time, so this does not create a
// runtime circular dependency with notification.port.ts (which imports
// this module's `buildSmsMessage`).
import type { NotificationEvent } from "./notification.port.js";

function formatMoney(minor: bigint, currency: string): string {
  return `${(Number(minor) / 100).toFixed(2)} ${currency}`;
}

/**
 * Builds the SMS body for one notification event, or returns null when
 * there's nothing worth sending — the referenced record is gone/cross-
 * tenant, or the event type has no SMS template yet. Callers should treat
 * null as "skip", not as an error. Deliberately shorter than the email
 * template and single-field (no subject/title) since this renders as one
 * text message. Mirrors push-messages.ts.
 */
export async function buildSmsMessage(
  event: NotificationEvent,
): Promise<Omit<SmsMessage, "to"> | null> {
  switch (event.type) {
    case "JOB_SCHEDULED":
    case "JOB_RESCHEDULED":
    case "JOB_ASSIGNED": {
      if (!event.jobId) return null;
      const job = await prisma.job.findFirst({
        where: { id: event.jobId, companyId: event.companyId },
        select: {
          jobNumber: true,
          serviceType: true,
          customer: { select: { firstName: true, lastName: true } },
        },
      });
      if (!job) return null;

      const verb =
        event.type === "JOB_ASSIGNED"
          ? "assigned to you"
          : event.type === "JOB_RESCHEDULED"
            ? "rescheduled"
            : "scheduled";
      return {
        body: `Aera: Job #${job.jobNumber} ${verb} — ${job.serviceType} for ${job.customer.firstName} ${job.customer.lastName}.`,
      };
    }

    case "QUOTE_SENT":
    case "QUOTE_APPROVED":
    case "QUOTE_DECLINED": {
      if (!event.quoteId) return null;
      const quote = await prisma.quote.findFirst({
        where: { id: event.quoteId, companyId: event.companyId },
        select: {
          totalMinor: true,
          currency: true,
          customer: { select: { firstName: true, lastName: true } },
        },
      });
      if (!quote) return null;

      const verb =
        event.type === "QUOTE_APPROVED"
          ? "approved"
          : event.type === "QUOTE_DECLINED"
            ? "declined"
            : "sent";
      return {
        body: `Aera: Quote ${verb} — ${quote.customer.firstName} ${quote.customer.lastName}, ${formatMoney(quote.totalMinor, quote.currency)}.`,
      };
    }

    case "INVOICE_ISSUED": {
      if (!event.invoiceId) return null;
      const invoice = await prisma.invoice.findFirst({
        where: { id: event.invoiceId, companyId: event.companyId },
        select: {
          invoiceNumber: true,
          totalMinor: true,
          currency: true,
          customer: { select: { firstName: true, lastName: true } },
        },
      });
      if (!invoice) return null;

      return {
        body: `Aera: Invoice ${invoice.invoiceNumber} issued — ${formatMoney(invoice.totalMinor, invoice.currency)} due.`,
      };
    }

    case "INVOICE_PAYMENT_REMINDER": {
      if (!event.invoiceId) return null;
      const invoice = await prisma.invoice.findFirst({
        where: { id: event.invoiceId, companyId: event.companyId },
        select: {
          invoiceNumber: true,
          status: true,
          balanceDueMinor: true,
          currency: true,
        },
      });
      if (!invoice) return null;
      if (
        invoice.balanceDueMinor <= BigInt(0) ||
        invoice.status === "PAID" ||
        invoice.status === "VOID"
      ) {
        return null;
      }

      return {
        body: `Aera: Invoice ${invoice.invoiceNumber} is overdue — ${formatMoney(invoice.balanceDueMinor, invoice.currency)} outstanding.`,
      };
    }

    default:
      // Safety net for a future NotificationEventType added to the union
      // without an SMS template yet — skip rather than throw, so a queue
      // retry loop can't get stuck.
      logger.warn(
        { eventType: event.type },
        "No SMS template for this notification event type; skipping",
      );
      return null;
  }
}
