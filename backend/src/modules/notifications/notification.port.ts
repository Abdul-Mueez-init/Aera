import { prisma } from "../../db/prisma.js";
import { logger } from "../../common/logger.js";
import { inProcessQueue } from "../../queue/in-process-queue.adapter.js";
import { resendEmailAdapter } from "./resend-email.adapter.js";
import { buildNotificationEmail } from "./email-templates.js";
import { fcmPushAdapter, PushTokenInvalidError } from "./fcm-push.adapter.js";
import { buildPushMessage } from "./push-messages.js";
import { textbeeSmsAdapter } from "./textbee-sms.adapter.js";
import { buildSmsMessage } from "./sms-messages.js";
import { listTokensForUsers, removeInvalidToken } from "./device-token.service.js";

export type NotificationEventType =
  | "JOB_SCHEDULED"
  | "JOB_RESCHEDULED"
  | "JOB_ASSIGNED"
  | "QUOTE_SENT"
  | "QUOTE_APPROVED"
  | "QUOTE_DECLINED"
  | "INVOICE_ISSUED"
  | "INVOICE_PAYMENT_REMINDER";

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

interface RecipientContact {
  userId: string;
  email: string | null;
  phone: string | null;
  firstName: string;
}

// Shared by the in-app (DB), email, and SMS dispatch handlers so the "who
// gets notified" rule lives in exactly one place. Returns email/phone
// alongside userId so those handlers don't need a second round-trip per
// event.
async function resolveRecipients(event: NotificationEvent): Promise<RecipientContact[]> {
  if (event.recipientUserId) {
    const user = await prisma.user.findUnique({
      where: { id: event.recipientUserId },
      select: { id: true, email: true, phone: true, firstName: true },
    });
    return user
      ? [{ userId: user.id, email: user.email, phone: user.phone, firstName: user.firstName }]
      : [];
  }

  const members = await prisma.companyMember.findMany({
    where: {
      companyId: event.companyId,
      role: { in: [...COMPANY_EVENT_ROLES] },
      status: "ACTIVE",
    },
    select: { user: { select: { id: true, email: true, phone: true, firstName: true } } },
  });
  return members.map((member) => ({
    userId: member.user.id,
    email: member.user.email,
    phone: member.user.phone,
    firstName: member.user.firstName,
  }));
}

// Recipient phone numbers are free-text at the schema level (schema.md
// `users.phone`), but Twilio requires E.164. Validate here rather than at
// the adapter so a malformed number is a silent skip (like a missing email)
// instead of a wasted/failed API call.
const E164_PATTERN = /^\+[1-9]\d{6,14}$/;

// The four job types this module owns on the shared queue (queue/queue.port.ts).
// Kept private: other modules talk to notifications through
// `notificationPublisher.publish`, never by enqueueing these types directly.
const NOTIFICATION_DB_JOB_TYPE = "notification.dispatch";
const NOTIFICATION_EMAIL_JOB_TYPE = "notification.email";
const NOTIFICATION_PUSH_JOB_TYPE = "notification.push";
const NOTIFICATION_SMS_JOB_TYPE = "notification.sms";

async function dispatchNotification(event: NotificationEvent): Promise<void> {
  const recipients = await resolveRecipients(event);
  if (recipients.length === 0) {
    return;
  }

  const payload = buildPayload(event);
  await prisma.notification.createMany({
    data: recipients.map((recipient) => ({
      companyId: event.companyId,
      recipientUserId: recipient.userId,
      type: event.type,
      payload,
    })),
  });
}

async function dispatchEmailNotification(event: NotificationEvent): Promise<void> {
  const recipients = await resolveRecipients(event);

  for (const recipient of recipients) {
    if (!recipient.email) continue;

    try {
      const message = await buildNotificationEmail(event, {
        email: recipient.email,
        firstName: recipient.firstName,
      });
      if (!message) continue;
      await resendEmailAdapter.send(message);
    } catch (error) {
      // Per-recipient isolation, deliberately not rethrown: the queue's
      // retry unit is the whole job (see in-process-queue.adapter.ts), so
      // letting one recipient's failure throw here would cause recipients
      // who already got their email in this pass to be re-sent to on
      // retry. Logging and continuing trades "guaranteed retry for this
      // one recipient" for "no duplicate sends to the others" — the right
      // call until per-recipient job granularity exists.
      logger.warn(
        { err: error, eventType: event.type, recipientUserId: recipient.userId },
        "Failed to send notification email to recipient",
      );
    }
  }
}

async function dispatchPushNotification(event: NotificationEvent): Promise<void> {
  const recipients = await resolveRecipients(event);
  if (recipients.length === 0) {
    return;
  }

  // Built once per event, not once per device: the title/body/data are the
  // same for every recipient device — only the per-token send call differs.
  const message = await buildPushMessage(event);
  if (!message) return;

  const tokens = await listTokensForUsers(recipients.map((recipient) => recipient.userId));
  if (tokens.length === 0) return;

  for (const { token } of tokens) {
    try {
      await fcmPushAdapter.send({ ...message, token });
    } catch (error) {
      if (error instanceof PushTokenInvalidError) {
        // Expected/terminal, not a delivery failure worth a warning: the
        // device unregistered (app uninstalled, token rotated) — prune it
        // so future events stop paying for a doomed send.
        await removeInvalidToken(token);
        continue;
      }
      // Per-token isolation, deliberately not rethrown — same reasoning as
      // dispatchEmailNotification: the queue retries the whole job, so
      // letting one token's failure throw here would cause tokens that
      // already got their push in this pass to be re-sent to on retry.
      logger.warn(
        { err: error, eventType: event.type },
        "Failed to send push notification to a device token",
      );
    }
  }
}

async function dispatchSmsNotification(event: NotificationEvent): Promise<void> {
  const recipients = await resolveRecipients(event);
  const withPhone = recipients.filter(
    (recipient): recipient is RecipientContact & { phone: string } =>
      Boolean(recipient.phone) && E164_PATTERN.test(recipient.phone!),
  );
  if (withPhone.length === 0) {
    return;
  }

  // Built once per event, not once per recipient: the message text is the
  // same for everyone — only the destination number differs. Mirrors
  // dispatchPushNotification.
  const message = await buildSmsMessage(event);
  if (!message) return;

  for (const recipient of withPhone) {
    try {
      await textbeeSmsAdapter.send({ to: recipient.phone, body: message.body });
    } catch (error) {
      // Per-recipient isolation, deliberately not rethrown — same reasoning
      // as dispatchEmailNotification/dispatchPushNotification: the queue's
      // retry unit is the whole job, so letting one recipient's failure
      // throw here would cause recipients who already got their SMS in
      // this pass to be re-sent to on retry.
      logger.warn(
        { err: error, eventType: event.type, recipientUserId: recipient.userId },
        "Failed to send notification SMS to recipient",
      );
    }
  }
}

// Registered once, at module load. Any failure thrown from a handler is
// retried with backoff and then logged/dropped by the queue adapter
// (in-process-queue.adapter.ts) rather than surfacing back to whichever
// service called `publish` for it — that separation of concerns (business
// logic here, resilience in the adapter) is the point of going through the
// queue.
inProcessQueue.registerHandler<NotificationEvent>(
  NOTIFICATION_DB_JOB_TYPE,
  dispatchNotification,
);
inProcessQueue.registerHandler<NotificationEvent>(
  NOTIFICATION_EMAIL_JOB_TYPE,
  dispatchEmailNotification,
);
inProcessQueue.registerHandler<NotificationEvent>(
  NOTIFICATION_PUSH_JOB_TYPE,
  dispatchPushNotification,
);
inProcessQueue.registerHandler<NotificationEvent>(
  NOTIFICATION_SMS_JOB_TYPE,
  dispatchSmsNotification,
);

export const notificationPublisher: NotificationPublisher = {
  async publish(event: NotificationEvent): Promise<void> {
    // Notification delivery must never break the primary business
    // transaction that triggered it (architecture.md ADR-009). Enqueuing
    // keeps this off the request path; the queue adapter owns retries and
    // swallows/logs any handler failure so it can never propagate here.
    // The four enqueues are independent: a failure enqueuing one (e.g. the
    // queue rejecting for an unrelated reason) must not block the others.
    try {
      await inProcessQueue.enqueue<NotificationEvent>(
        NOTIFICATION_DB_JOB_TYPE,
        event,
      );
    } catch (error) {
      logger.warn(
        { err: error, eventType: event.type, companyId: event.companyId },
        "Failed to enqueue in-app notification",
      );
    }

    try {
      await inProcessQueue.enqueue<NotificationEvent>(
        NOTIFICATION_EMAIL_JOB_TYPE,
        event,
      );
    } catch (error) {
      logger.warn(
        { err: error, eventType: event.type, companyId: event.companyId },
        "Failed to enqueue notification email",
      );
    }

    try {
      await inProcessQueue.enqueue<NotificationEvent>(
        NOTIFICATION_PUSH_JOB_TYPE,
        event,
      );
    } catch (error) {
      logger.warn(
        { err: error, eventType: event.type, companyId: event.companyId },
        "Failed to enqueue push notification",
      );
    }

    try {
      await inProcessQueue.enqueue<NotificationEvent>(
        NOTIFICATION_SMS_JOB_TYPE,
        event,
      );
    } catch (error) {
      logger.warn(
        { err: error, eventType: event.type, companyId: event.companyId },
        "Failed to enqueue notification SMS",
      );
    }
  },
};