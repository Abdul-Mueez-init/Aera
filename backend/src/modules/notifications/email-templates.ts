import { prisma } from "../../db/prisma.js";
import { logger } from "../../common/logger.js";
import type { EmailMessage } from "./email.port.js";
// Type-only import: erased at compile time, so this does not create a
// runtime circular dependency with notification.port.ts (which imports
// this module's `buildNotificationEmail`).
import type { NotificationEvent } from "./notification.port.js";

function formatMoney(minor: bigint, currency: string): string {
  return `${(Number(minor) / 100).toFixed(2)} ${currency}`;
}

function formatDate(date: Date | null): string {
  if (!date) return "to be scheduled";
  return date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

// Small, brand-consistent HTML shell (design.md colors: canvas/surface/ink/
// accent). Deliberately plain — no gradients, no decorative motion — this
// is transactional email, not marketing.
function renderShell(title: string, lines: string[]): Pick<EmailMessage, "html" | "text"> {
  const html = `<div style="font-family:-apple-system,Inter,Helvetica,Arial,sans-serif;background:#F6F5F1;padding:32px;">
  <div style="max-width:480px;margin:0 auto;background:#FFFFFF;border:1px solid #DCE0DB;border-radius:18px;padding:32px;">
    <p style="font-size:12px;font-weight:650;letter-spacing:0.05em;text-transform:uppercase;color:#1E5A58;margin:0 0 16px;">Aera</p>
    <h1 style="font-size:20px;font-weight:650;color:#151917;margin:0 0 16px;">${title}</h1>
    ${lines.map((line) => `<p style="font-size:15px;line-height:1.5;color:#343B37;margin:0 0 12px;">${line}</p>`).join("\n    ")}
  </div>
</div>`;
  const text = [title, "", ...lines].join("\n");
  return { html, text };
}

/**
 * Builds the email for one notification event, or returns null when there's
 * nothing worth sending (the referenced record is gone/cross-tenant, or the
 * event type has no email template). Callers should treat null as "skip",
 * not as an error.
 */
export async function buildNotificationEmail(
  event: NotificationEvent,
  recipient: { email: string; firstName: string },
): Promise<EmailMessage | null> {
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
          scheduledStart: true,
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
      const subject = `Job #${job.jobNumber} ${verb}`;
      const { html, text } = renderShell(subject, [
        `${job.serviceType} for ${job.customer.firstName} ${job.customer.lastName}.`,
        `Scheduled: ${formatDate(job.scheduledStart)}.`,
      ]);
      return { to: recipient.email, subject, html, text };
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
      const subject = `Quote ${verb}`;
      const { html, text } = renderShell(`${subject} — ${formatMoney(quote.totalMinor, quote.currency)}`, [
        `Customer: ${quote.customer.firstName} ${quote.customer.lastName}.`,
        `Total: ${formatMoney(quote.totalMinor, quote.currency)}.`,
      ]);
      return { to: recipient.email, subject, html, text };
    }

    case "INVOICE_ISSUED": {
      if (!event.invoiceId) return null;
      const invoice = await prisma.invoice.findFirst({
        where: { id: event.invoiceId, companyId: event.companyId },
        select: {
          invoiceNumber: true,
          totalMinor: true,
          currency: true,
          dueAt: true,
          customer: { select: { firstName: true, lastName: true } },
        },
      });
      if (!invoice) return null;

      const subject = `Invoice ${invoice.invoiceNumber} issued`;
      const { html, text } = renderShell(subject, [
        `Customer: ${invoice.customer.firstName} ${invoice.customer.lastName}.`,
        `Amount due: ${formatMoney(invoice.totalMinor, invoice.currency)}.`,
        `Due: ${formatDate(invoice.dueAt)}.`,
      ]);
      return { to: recipient.email, subject, html, text };
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
          dueAt: true,
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

      const subject = `Payment overdue: invoice ${invoice.invoiceNumber}`;
      const { html, text } = renderShell(subject, [
        `Customer: ${invoice.customer.firstName} ${invoice.customer.lastName}.`,
        `Balance due: ${formatMoney(invoice.balanceDueMinor, invoice.currency)}.`,
        `Was due: ${formatDate(invoice.dueAt)}.`,
      ]);
      return { to: recipient.email, subject, html, text };
    }

    default:
      // Safety net for a future NotificationEventType (e.g. an eventual
      // INVOICE_PAYMENT_REMINDER) added to the union without a template yet
      // — skip rather than throw, so a queue retry loop can't get stuck.
      logger.warn(
        { eventType: event.type },
        "No email template for this notification event type; skipping",
      );
      return null;
  }
}