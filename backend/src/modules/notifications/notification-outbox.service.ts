import { randomUUID } from "node:crypto";
import { logger } from "../../common/logger.js";
import { prisma } from "../../db/prisma.js";
import { env } from "../../config/env.js";
import { captureBackgroundError } from "../../common/observability.js";
import { inProcessQueue } from "../../queue/in-process-queue.adapter.js";
import { buildNotificationEmail } from "./email-templates.js";
import { resendEmailAdapter } from "./resend-email.adapter.js";
import { buildPushMessage } from "./push-messages.js";
import { fcmPushAdapter, PushTokenInvalidError } from "./fcm-push.adapter.js";
import { buildSmsMessage } from "./sms-messages.js";
import { textbeeSmsAdapter } from "./textbee-sms.adapter.js";
import {
  removeInvalidToken,
  listTokensForUsers,
} from "./device-token.service.js";
import { generateToken, hashToken } from "../portal/portal.tokens.js";
import { portalLinkEmail, portalLinkSms } from "../portal/portal-messages.js";

const OUTBOX_JOB_TYPE = "notification.outbox";
// Phase 8.1 — portal link deliveries ride the same durable outbox. The
// payload stores the grant reference only; the single-use link token is
// minted here at send time and never persisted.
const PORTAL_LINK_TEMPLATE = "PORTAL_LINK";

async function processPortalLinkOutbox(row: {
  id: string;
  companyId: string;
  channel: string;
  payload: unknown;
}): Promise<void> {
  const payload = (row.payload ?? {}) as Record<string, string>;
  const grantId = payload.grantId;
  const destination = payload.destination;
  if (!grantId || !destination) {
    throw new Error("Portal link outbox payload missing grantId/destination");
  }

  const grant = await prisma.portalAccessGrant.findFirst({
    where: { id: grantId, companyId: row.companyId, status: "ACTIVE" },
    select: { id: true, linkExpiresAt: true },
  });
  if (!grant || grant.linkExpiresAt <= new Date()) {
    throw new Error("Portal grant is no longer active for link delivery");
  }

  // Mint the single-use delivery token now — plaintext lives only in
  // this function's memory and inside the outgoing message.
  const token = generateToken();
  await prisma.portalDeliveryToken.create({
    data: {
      grantId: grant.id,
      tokenHash: hashToken(token),
      expiresAt: grant.linkExpiresAt,
    },
  });
  const link = `${env.PORTAL_PUBLIC_BASE_URL}/open#t=${token}`;

  const messageInput = {
    link,
    companyName: payload.companyName ?? "",
    customerFirstName: payload.customerFirstName ?? "",
    jobNumber: payload.jobNumber ? Number(payload.jobNumber) : undefined,
  };
  if (row.channel === "SMS") {
    await textbeeSmsAdapter.send({
      to: destination,
      body: portalLinkSms(messageInput),
    });
  } else {
    const message = portalLinkEmail(messageInput);
    await resendEmailAdapter.send({
      to: destination,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }

  await prisma.portalAuditEvent.create({
    data: {
      companyId: row.companyId,
      jobId: payload.jobId || null,
      customerId: payload.customerId || null,
      grantId: grant.id,
      action: "PORTAL_LINK_SENT",
      metadata: { channel: row.channel, status: "SENT", via: "outbox" },
    },
  });
}

export async function enqueueNotificationOutbox(input: {
  companyId: string;
  recipientUserId?: string;
  channel: "IN_APP" | "EMAIL" | "SMS" | "PUSH";
  template: string;
  payload: Record<string, string>;
  dedupeKey: string;
}): Promise<void> {
  await prisma.notificationOutbox.create({
    data: {
      companyId: input.companyId,
      recipientUserId: input.recipientUserId ?? null,
      channel: input.channel,
      template: input.template,
      payload: input.payload,
      dedupeKey: input.dedupeKey,
    },
  });
}

async function processOutbox(): Promise<void> {
  const now = new Date();
  const rows = await prisma.notificationOutbox.findMany({
    where: {
      status: { in: ["QUEUED", "FAILED", "PROVIDER_ACCEPTED"] },
      nextAttemptAt: { lte: now },
    },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: {
      id: true,
      companyId: true,
      recipientUserId: true,
      channel: true,
      template: true,
      payload: true,
      attempts: true,
      status: true,
      updatedAt: true,
    },
  });

  for (const row of rows) {
    if (
      row.status === "PROVIDER_ACCEPTED" &&
      now.getTime() - row.updatedAt.getTime() < 5 * 60_000
    ) {
      continue;
    }
    const claimed = await prisma.notificationOutbox.updateMany({
      where: {
        id: row.id,
        status: row.status,
        attempts: row.attempts,
      },
      data: { status: "PROVIDER_ACCEPTED", attempts: { increment: 1 } },
    });
    if (claimed.count !== 1) continue;

    try {
      if (row.template === PORTAL_LINK_TEMPLATE) {
        await processPortalLinkOutbox(row);
      } else {
        if (!row.recipientUserId)
          throw new Error("Outbox recipient no longer exists");
        const event = {
          type: row.template as
            | "JOB_SCHEDULED"
            | "JOB_RESCHEDULED"
            | "JOB_ASSIGNED"
            | "QUOTE_SENT"
            | "QUOTE_APPROVED"
            | "QUOTE_DECLINED"
            | "INVOICE_ISSUED"
            | "INVOICE_PAYMENT_REMINDER"
            | "REQUEST_SUBMITTED"
            | "REQUEST_INFO_PROVIDED"
            | "REQUEST_STATUS_CHANGED"
            | "JOB_CHANGE_REQUEST_SUBMITTED"
            | "JOB_REVIEW_CHANGES_REQUESTED",
          companyId: row.companyId,
          ...(typeof row.payload === "object" && row.payload !== null
            ? row.payload
            : {}),
        } as {
          type: Parameters<typeof buildNotificationEmail>[0]["type"];
          companyId: string;
          jobId?: string;
          quoteId?: string;
          invoiceId?: string;
          requestId?: string;
        };

        const recipient = row.recipientUserId
          ? await prisma.companyMember.findFirst({
              where: {
                companyId: row.companyId,
                userId: row.recipientUserId,
                status: "ACTIVE",
              },
              select: {
                user: {
                  select: {
                    id: true,
                    email: true,
                    phone: true,
                    firstName: true,
                  },
                },
              },
            })
          : null;
        if (!recipient) throw new Error("Outbox recipient is no longer active");

        if (row.channel === "IN_APP") {
          await prisma.notification.create({
            data: {
              companyId: row.companyId,
              recipientUserId: recipient.user.id,
              type: event.type,
              payload: row.payload ?? {},
            },
          });
        } else if (row.channel === "EMAIL" && recipient.user.email) {
          const message = await buildNotificationEmail(event, {
            email: recipient.user.email,
            firstName: recipient.user.firstName,
          });
          if (message) await resendEmailAdapter.send(message);
        } else if (row.channel === "SMS" && recipient.user.phone) {
          if (!/^\+[1-9]\d{6,14}$/.test(recipient.user.phone)) {
            throw new Error(
              "Outbox recipient phone is not a valid E.164 number",
            );
          }
          const message = await buildSmsMessage(event);
          if (message)
            await textbeeSmsAdapter.send({
              to: recipient.user.phone,
              body: message.body,
            });
        } else if (row.channel === "PUSH") {
          const message = await buildPushMessage(event);
          if (message) {
            const tokens = await listTokensForUsers([recipient.user.id]);
            for (const { token } of tokens) {
              try {
                await fcmPushAdapter.send({ ...message, token });
              } catch (error) {
                if (error instanceof PushTokenInvalidError) {
                  await removeInvalidToken(token);
                  continue;
                }
                throw error;
              }
            }
          }
        }
      }
      await prisma.notificationOutbox.update({
        where: { id: row.id },
        data: {
          status: "DELIVERED",
          providerMessageId: randomUUID(),
          lastError: null,
        },
      });
    } catch (error) {
      const attempts = row.attempts + 1;
      const dead = attempts >= env.NOTIFICATION_OUTBOX_MAX_ATTEMPTS;
      await prisma.notificationOutbox.update({
        where: { id: row.id },
        data: {
          status: dead ? "DEAD" : "FAILED",
          nextAttemptAt: new Date(
            Date.now() + Math.min(60 * 60_000, 2 ** attempts * 1000),
          ),
          lastError:
            error instanceof Error
              ? error.message.slice(0, 500)
              : "Unknown outbox error",
        },
      });
      if (dead)
        captureBackgroundError(error, "notification-outbox", {
          outboxId: row.id,
        });
    }
  }
}

inProcessQueue.registerHandler(OUTBOX_JOB_TYPE, async () => processOutbox());

export function startNotificationOutboxScheduler(): () => void {
  const run = () => {
    void inProcessQueue.enqueue(OUTBOX_JOB_TYPE, {}).catch((error: unknown) => {
      logger.warn({ err: error }, "Notification outbox sweep enqueue failed");
    });
  };
  run();
  const timer = setInterval(
    run,
    env.NOTIFICATION_OUTBOX_SWEEP_MINUTES * 60_000,
  );
  timer.unref();
  return () => clearInterval(timer);
}
