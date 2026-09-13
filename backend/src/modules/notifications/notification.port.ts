import { prisma } from "../../db/prisma.js";
import { logger } from "../../common/logger.js";
import { inProcessQueue } from "../../queue/in-process-queue.adapter.js";

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

// The job type this module owns on the shared queue (queue/queue.port.ts).
// Kept private: other modules talk to notifications through
// `notificationPublisher.publish`, never by enqueueing this type directly.
const NOTIFICATION_JOB_TYPE = "notification.dispatch";

async function dispatchNotification(event: NotificationEvent): Promise<void> {
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
}

// Registered once, at module load. Any failure thrown here is retried with
// backoff and then logged/dropped by the queue adapter (in-process-queue
// adapter.ts) rather than surfacing back to whichever service called
// `publish` for it — that separation of concerns (business logic here,
// resilience in the adapter) is the point of going through the queue.
inProcessQueue.registerHandler<NotificationEvent>(
  NOTIFICATION_JOB_TYPE,
  dispatchNotification,
);

export const notificationPublisher: NotificationPublisher = {
  async publish(event: NotificationEvent): Promise<void> {
    // Notification delivery must never break the primary business
    // transaction that triggered it (architecture.md ADR-009). Enqueuing
    // keeps this off the request path; the queue adapter owns retries and
    // swallows/logs any handler failure so it can never propagate here.
    try {
      await inProcessQueue.enqueue<NotificationEvent>(
        NOTIFICATION_JOB_TYPE,
        event,
      );
    } catch (error) {
      logger.warn(
        { err: error, eventType: event.type, companyId: event.companyId },
        "Failed to enqueue notification",
      );
    }
  },
};