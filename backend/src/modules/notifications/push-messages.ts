import { prisma } from "../../db/prisma.js";
import { logger } from "../../common/logger.js";
import type { PushMessage } from "./push.port.js";
// Type-only import: erased at compile time, so this does not create a
// runtime circular dependency with notification.port.ts (which imports
// this module's `buildPushMessage`).
import type { NotificationEvent } from "./notification.port.js";

function formatMoney(minor: bigint, currency: string): string {
  return `${(Number(minor) / 100).toFixed(2)} ${currency}`;
}

/**
 * Builds the push payload (title/body/deep-link data) for one notification
 * event, or returns null when there's nothing worth sending — the
 * referenced record is gone/cross-tenant, or the event type has no push
 * template yet. Callers should treat null as "skip", not as an error.
 * Deliberately shorter copy than email-templates.ts: this is a lock-screen
 * notification, not a transactional email.
 */
export async function buildPushMessage(
  event: NotificationEvent,
): Promise<Omit<PushMessage, "token"> | null> {
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
        title: `Job #${job.jobNumber} ${verb}`,
        body: `${job.serviceType} for ${job.customer.firstName} ${job.customer.lastName}`,
        data: { type: event.type, jobId: event.jobId },
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
        title: `Quote ${verb}`,
        body: `${quote.customer.firstName} ${quote.customer.lastName} — ${formatMoney(quote.totalMinor, quote.currency)}`,
        data: { type: event.type, quoteId: event.quoteId },
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
        title: `Invoice ${invoice.invoiceNumber} issued`,
        body: `${invoice.customer.firstName} ${invoice.customer.lastName} — ${formatMoney(invoice.totalMinor, invoice.currency)} due`,
        data: { type: event.type, invoiceId: event.invoiceId },
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
          customer: { select: { firstName: true, lastName: true } },
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
        title: `Invoice ${invoice.invoiceNumber} is overdue`,
        body: `${invoice.customer.firstName} ${invoice.customer.lastName} — ${formatMoney(invoice.balanceDueMinor, invoice.currency)} outstanding`,
        data: { type: event.type, invoiceId: event.invoiceId },
      };
    }

    default:
      // Safety net for a future NotificationEventType (e.g. an eventual
      // INVOICE_PAYMENT_REMINDER) added to the union without a template
      // yet — skip rather than throw, so a queue retry loop can't get stuck.
      logger.warn(
        { eventType: event.type },
        "No push template for this notification event type; skipping",
      );
      return null;
  }
}