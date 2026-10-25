import { prisma } from "../../db/prisma.js";
import { AppError } from "../../common/errors.js";
import { logger } from "../../common/logger.js";
import { inProcessQueue } from "../../queue/in-process-queue.adapter.js";
import type { QueueJob } from "../../queue/queue.port.js";
import { resendEmailAdapter } from "../notifications/resend-email.adapter.js";
import { textbeeSmsAdapter } from "../notifications/textbee-sms.adapter.js";
import {
  handshakeCodeEmail,
  handshakeCodeSms,
  isValidE164,
  portalLinkEmail,
  portalLinkSms,
} from "./portal-messages.js";

/**
 * Portal delivery (handoff 5.10).
 *
 * Link delivery is QUEUED: sendPortalLink validates destinations, audits
 * skips immediately, and enqueues one in-process-queue job per deliverable
 * channel (the queue supplies retries). The route reports QUEUED /
 * SKIPPED_NO_CONTACT as soon as the jobs are accepted — delivery itself
 * happens in the worker, is audited per channel (PORTAL_LINK_SENT /
 * PORTAL_LINK_SEND_FAILED), and can never fail issuance or reissue.
 *
 * Audit metadata holds ids/channel/status only — never the link, the
 * handshake code, or full phone numbers.
 */
export type DeliveryChannel = "SMS" | "EMAIL";

export interface LinkDeliveryResult {
  channel: DeliveryChannel;
  status: "QUEUED" | "SKIPPED_NO_CONTACT" | "FAILED";
}

export interface CodeDeliveryResult {
  channel: DeliveryChannel;
  status: "SENT" | "SKIPPED_NO_CONTACT" | "FAILED";
  error?: string;
}

const LINK_DELIVERY_JOB_TYPE = "portal.link-delivery";
const LINK_DELIVERY_MAX_ATTEMPTS = 3;

interface PortalLinkDeliveryJob {
  companyId: string;
  customerId: string;
  jobId: string;
  grantId: string;
  jobNumber: number;
  channel: DeliveryChannel;
  /** Plaintext link — memory only (the queue is in-process and payloads
   * are never logged); needed so retries send the same single-use link. */
  link: string;
  companyName: string;
  customerFirstName: string;
  destination: string;
}

async function writeDeliveryAudit(input: {
  companyId: string;
  jobId: string;
  customerId: string;
  grantId?: string;
  action: "PORTAL_LINK_SENT" | "PORTAL_LINK_SEND_FAILED";
  channel: DeliveryChannel;
  status: string;
}): Promise<void> {
  try {
    await prisma.portalAuditEvent.create({
      data: {
        companyId: input.companyId,
        jobId: input.jobId,
        customerId: input.customerId,
        grantId: input.grantId,
        action: input.action,
        metadata: { channel: input.channel, status: input.status },
      },
    });
  } catch (error) {
    // The send itself is the side effect that matters; a failed audit
    // write must not trigger a duplicate delivery via queue retry.
    logger.warn(
      { err: error, action: input.action, channel: input.channel },
      "Portal delivery audit write failed",
    );
  }
}

async function processPortalLinkDelivery(
  payload: PortalLinkDeliveryJob,
  job: QueueJob<PortalLinkDeliveryJob>,
): Promise<void> {
  try {
    if (payload.channel === "SMS") {
      await textbeeSmsAdapter.send({
        to: payload.destination,
        body: portalLinkSms(payload),
      });
    } else {
      const message = portalLinkEmail(payload);
      await resendEmailAdapter.send({
        to: payload.destination,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    }
  } catch (error) {
    if (job.attempts >= LINK_DELIVERY_MAX_ATTEMPTS) {
      await writeDeliveryAudit({
        companyId: payload.companyId,
        jobId: payload.jobId,
        customerId: payload.customerId,
        grantId: payload.grantId,
        action: "PORTAL_LINK_SEND_FAILED",
        channel: payload.channel,
        status: "FAILED",
      });
      return;
    }
    // Not the final attempt: let the queue retry with backoff.
    throw error;
  }

  await writeDeliveryAudit({
    companyId: payload.companyId,
    jobId: payload.jobId,
    customerId: payload.customerId,
    grantId: payload.grantId,
    action: "PORTAL_LINK_SENT",
    channel: payload.channel,
    status: "SENT",
  });
}

inProcessQueue.registerHandler<PortalLinkDeliveryJob>(
  LINK_DELIVERY_JOB_TYPE,
  processPortalLinkDelivery,
);

export interface SendPortalLinkInput {
  companyId: string;
  customerId: string;
  jobId: string;
  grantId: string;
  jobNumber: number;
  link: string;
  channels: DeliveryChannel[];
}

/**
 * Queue portal-link delivery for the selected channels.
 * Resolves with one result per requested channel once jobs are accepted;
 * never throws for delivery problems (only for unknown customer/company).
 */
export async function sendPortalLink(
  input: SendPortalLinkInput,
): Promise<LinkDeliveryResult[]> {
  const customer = await prisma.customer.findFirst({
    where: { id: input.customerId, companyId: input.companyId },
    select: { firstName: true, phone: true, email: true },
  });

  if (!customer) {
    throw new AppError("RESOURCE_NOT_FOUND", "Customer not found", 404);
  }

  const company = await prisma.company.findFirst({
    where: { id: input.companyId },
    select: { name: true },
  });

  if (!company) {
    throw new AppError("RESOURCE_NOT_FOUND", "Company not found", 404);
  }

  const results: LinkDeliveryResult[] = [];

  for (const channel of input.channels) {
    const destination =
      channel === "SMS"
        ? isValidE164(customer.phone)
          ? customer.phone
          : null
        : customer.email || null;

    if (!destination) {
      // Missing or undeliverable contact (e.g. phone is not E.164):
      // skip the channel and audit the skip.
      await writeDeliveryAudit({
        companyId: input.companyId,
        jobId: input.jobId,
        customerId: input.customerId,
        grantId: input.grantId,
        action: "PORTAL_LINK_SEND_FAILED",
        channel,
        status: "SKIPPED_NO_CONTACT",
      });
      results.push({ channel, status: "SKIPPED_NO_CONTACT" });
      continue;
    }

    try {
      await inProcessQueue.enqueue<PortalLinkDeliveryJob>(
        LINK_DELIVERY_JOB_TYPE,
        {
          companyId: input.companyId,
          customerId: input.customerId,
          jobId: input.jobId,
          grantId: input.grantId,
          jobNumber: input.jobNumber,
          channel,
          link: input.link,
          companyName: company.name,
          customerFirstName: customer.firstName,
          destination,
        },
        { maxAttempts: LINK_DELIVERY_MAX_ATTEMPTS },
      );
      results.push({ channel, status: "QUEUED" });
    } catch (error) {
      // Enqueue itself failed (e.g. queue at capacity): audit and report,
      // but issuance/reissue must still succeed.
      logger.warn(
        { err: error, channel, jobId: input.jobId },
        "Portal link delivery enqueue failed",
      );
      await writeDeliveryAudit({
        companyId: input.companyId,
        jobId: input.jobId,
        customerId: input.customerId,
        grantId: input.grantId,
        action: "PORTAL_LINK_SEND_FAILED",
        channel,
        status: "FAILED",
      });
      results.push({ channel, status: "FAILED" });
    }
  }

  return results;
}

/**
 * Send handshake code via SMS and/or Email.
 * Called from the handshake delivery worker (already queued by
 * handshake.service); sends inline and reports per-channel results for
 * the caller's HANDSHAKE_CODE_SENT audit. Never throws for adapter
 * errors — they are reported as FAILED results.
 */
export async function sendHandshakeCode(
  companyId: string,
  customerId: string,
  technicianFirstName: string,
  code: string,
  channels: DeliveryChannel[],
): Promise<CodeDeliveryResult[]> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, companyId },
    select: { firstName: true, phone: true, email: true },
  });

  if (!customer) {
    throw new AppError("RESOURCE_NOT_FOUND", "Customer not found", 404);
  }

  const company = await prisma.company.findFirst({
    where: { id: companyId },
    select: { name: true },
  });

  if (!company) {
    throw new AppError("RESOURCE_NOT_FOUND", "Company not found", 404);
  }

  const results: CodeDeliveryResult[] = [];

  if (channels.includes("SMS")) {
    if (!isValidE164(customer.phone)) {
      results.push({ channel: "SMS", status: "SKIPPED_NO_CONTACT" });
    } else {
      try {
        await textbeeSmsAdapter.send({
          to: customer.phone as string,
          body: handshakeCodeSms({
            companyName: company.name,
            technicianFirstName,
            code,
          }),
        });
        results.push({ channel: "SMS", status: "SENT" });
      } catch (error) {
        results.push({
          channel: "SMS",
          status: "FAILED",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  }

  if (channels.includes("EMAIL")) {
    if (!customer.email) {
      results.push({ channel: "EMAIL", status: "SKIPPED_NO_CONTACT" });
    } else {
      const message = handshakeCodeEmail({
        companyName: company.name,
        technicianFirstName,
        customerFirstName: customer.firstName,
        code,
      });
      try {
        await resendEmailAdapter.send({
          to: customer.email,
          subject: message.subject,
          text: message.text,
          html: message.html,
        });
        results.push({ channel: "EMAIL", status: "SENT" });
      } catch (error) {
        results.push({
          channel: "EMAIL",
          status: "FAILED",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  }

  return results;
}
