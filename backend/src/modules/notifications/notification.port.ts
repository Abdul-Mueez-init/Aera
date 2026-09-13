import { prisma } from "../../db/prisma.js";
import { logger } from "../../common/logger.js";

export type NotificationEventType =
  | "JOB_SCHEDULED"
  | "JOB_RESCHEDULED"
  | "JOB_ASSIGNED"
  | "QUOTE_SENT"
  | "QUOTE_APPROVED"
  | "QUOTE_DECLINED"
  | "INVOICE_ISSUED";

export interface NotificationEvent {
  type: NotificationEventType;
  companyId: string;
  jobId?: string;
  quoteId?: string;
  invoiceId?: string;
  recipientUserId?: string;
}

export interface NotificationPublisher {
  publish(event: NotificationEvent): Promise<void>;
}

// Roles notified for company-wide events that do not name a single recipient
// (e.g. a quote being sent, or an invoice being issued). Technicians are
// intentionally excluded: they only receive notifications about jobs they are
// directly assigned to, via an explicit recipientUserId on the event.
const COMPANY_EVENT_ROLES = ["OWNER", "DISPATCHER"] as const;

function buildPayload(event: NotificationEvent): Record<string, string> {
  const payload: Record<string, string> = {};
  if (event.jobId) payload.jobId = event.jobId;
  if (event.quoteId) payload.quoteId = event.quoteId;
  if (event.invoiceId) payload.invoiceId = event.invoiceId;
  return payload;
}

async function resolveRecipientIds(event: NotificationEvent): Promise<string[]> {
  if (event.recipientUserId) {
    return [event.recipientUserId];
  }

  const members = await prisma.companyMember.findMany({
    where: {
      companyId: event.companyId,
      role: { in: [...COMPANY_EVENT_ROLES] },
      status: "ACTIVE",
    },
    select: { userId: true },
  });
  return members.map((member) => member.userId);
}

export const notificationPublisher: NotificationPublisher = {
  async publish(event: NotificationEvent): Promise<void> {
    // Notification delivery must never break the primary business
    // transaction that triggered it (architecture.md ADR-009).
    try {
      const recipientIds = await resolveRecipientIds(event);
      if (recipientIds.length === 0) {
        return;
      }

      const payload = buildPayload(event);
      await prisma.notification.createMany({
        data: recipientIds.map((recipientUserId) => ({
          companyId: event.companyId,
          recipientUserId,
          type: event.type,
          payload,
        })),
      });
    } catch (error) {
      logger.warn(
        { err: error, eventType: event.type, companyId: event.companyId },
        "Failed to persist notification",
      );
    }
  },
};
