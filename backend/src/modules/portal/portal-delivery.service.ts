import { prisma } from "../../db/prisma.js";
import { AppError } from "../../common/errors.js";
import { resendEmailAdapter } from "../notifications/resend-email.adapter.js";
import { textbeeSmsAdapter } from "../notifications/textbee-sms.adapter.js";
import { escapeHtml } from "../notifications/email-templates.js";

/**
 * Portal link delivery channels.
 */
export type DeliveryChannel = "SMS" | "EMAIL";

/**
 * Delivery result for a single channel.
 */
export interface DeliveryResult {
  channel: DeliveryChannel;
  status: "QUEUED" | "SKIPPED_NO_CONTACT" | "FAILED";
  error?: string;
}

/**
 * Send portal link via SMS and/or Email.
 * Uses the existing notification adapters and in-process queue.
 */
export async function sendPortalLink(
  companyId: string,
  customerId: string,
  link: string,
  channels: DeliveryChannel[],
): Promise<DeliveryResult[]> {
  // Get customer contact info
  const customer = await prisma.customer.findUnique({
    where: { id: customerId, companyId },
    select: {
      firstName: true,
      phone: true,
      email: true,
    },
  });

  if (!customer) {
    throw new AppError("RESOURCE_NOT_FOUND", "Customer not found", 404);
  }

  // Get company name for the message
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true },
  });

  if (!company) {
    throw new AppError("RESOURCE_NOT_FOUND", "Company not found", 404);
  }

  const results: DeliveryResult[] = [];

  // SMS delivery
  if (channels.includes("SMS")) {
    const smsResult = await sendSmsPortalLink(
      company.name,
      customer.firstName,
      customer.phone,
      link,
    );
    results.push(smsResult);
  }

  // Email delivery
  if (channels.includes("EMAIL")) {
    const emailResult = await sendEmailPortalLink(
      company.name,
      customer.firstName,
      customer.email,
      link,
    );
    results.push(emailResult);
  }

  return results;
}

/**
 * Send portal link via SMS.
 */
async function sendSmsPortalLink(
  companyName: string,
  customerFirstName: string,
  phone: string | null,
  link: string,
): Promise<DeliveryResult> {
  if (!phone) {
    return {
      channel: "SMS",
      status: "SKIPPED_NO_CONTACT",
    };
  }

  // Validate E.164 format (basic check)
  if (!phone.startsWith("+")) {
    return {
      channel: "SMS",
      status: "SKIPPED_NO_CONTACT",
    };
  }

  const message = `${companyName}: open your service portal: ${link} — use this phone. The link works once.`;

  try {
    await textbeeSmsAdapter.send({ to: phone, body: message });
    return {
      channel: "SMS",
      status: "QUEUED",
    };
  } catch (error) {
    return {
      channel: "SMS",
      status: "FAILED",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Send portal link via Email.
 */
async function sendEmailPortalLink(
  companyName: string,
  customerFirstName: string,
  email: string | null,
  link: string,
): Promise<DeliveryResult> {
  if (!email) {
    return {
      channel: "EMAIL",
      status: "SKIPPED_NO_CONTACT",
    };
  }

  const subject = `${companyName}: Your Service Portal`;
  const text = `Hello ${customerFirstName},\n\nOpen your service portal here: ${link}\n\nThe link works once on this device.\n\n- ${companyName}`;
  const html = `
    <p>Hello ${escapeHtml(customerFirstName)},</p>
    <p>Open your service portal here: <a href="${link}">${link}</a></p>
    <p>The link works once on this device.</p>
    <p>- ${escapeHtml(companyName)}</p>
  `;

  try {
    await resendEmailAdapter.send({
      to: email,
      subject,
      text,
      html,
    });
    return {
      channel: "EMAIL",
      status: "QUEUED",
    };
  } catch (error) {
    return {
      channel: "EMAIL",
      status: "FAILED",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Send handshake code via SMS and/or Email.
 * Called when job transitions to EN_ROUTE.
 */
export async function sendHandshakeCode(
  companyId: string,
  customerId: string,
  technicianFirstName: string,
  code: string,
  channels: DeliveryChannel[],
): Promise<DeliveryResult[]> {
  // Get customer contact info
  const customer = await prisma.customer.findUnique({
    where: { id: customerId, companyId },
    select: {
      firstName: true,
      phone: true,
      email: true,
    },
  });

  if (!customer) {
    throw new AppError("RESOURCE_NOT_FOUND", "Customer not found", 404);
  }

  // Get company name
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true },
  });

  if (!company) {
    throw new AppError("RESOURCE_NOT_FOUND", "Company not found", 404);
  }

  const results: DeliveryResult[] = [];

  // SMS delivery
  if (channels.includes("SMS")) {
    const smsResult = await sendSmsHandshakeCode(
      company.name,
      technicianFirstName,
      customer.phone,
      code,
    );
    results.push(smsResult);
  }

  // Email delivery
  if (channels.includes("EMAIL")) {
    const emailResult = await sendEmailHandshakeCode(
      company.name,
      technicianFirstName,
      customer.firstName,
      customer.email,
      code,
    );
    results.push(emailResult);
  }

  return results;
}

/**
 * Send handshake code via SMS.
 */
async function sendSmsHandshakeCode(
  companyName: string,
  technicianFirstName: string,
  phone: string | null,
  code: string,
): Promise<DeliveryResult> {
  if (!phone || !phone.startsWith("+")) {
    return {
      channel: "SMS",
      status: "SKIPPED_NO_CONTACT",
    };
  }

  const message = `${companyName}: ${technicianFirstName} is on the way. Your code is ${code}. Give it only to the technician at your door.`;

  try {
    await textbeeSmsAdapter.send({ to: phone, body: message });
    return {
      channel: "SMS",
      status: "QUEUED",
    };
  } catch (error) {
    return {
      channel: "SMS",
      status: "FAILED",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Send handshake code via Email.
 */
async function sendEmailHandshakeCode(
  companyName: string,
  technicianFirstName: string,
  customerFirstName: string,
  email: string | null,
  code: string,
): Promise<DeliveryResult> {
  if (!email) {
    return {
      channel: "EMAIL",
      status: "SKIPPED_NO_CONTACT",
    };
  }

  const subject = `${companyName}: Your Verification Code`;
  const text = `Hello ${customerFirstName},\n\n${technicianFirstName} is on the way.\n\nYour code is: ${code}\n\nGive this code only to the technician at your door. Do not share it by phone or message.\n\n- ${companyName}`;
  const html = `
    <p>Hello ${escapeHtml(customerFirstName)},</p>
    <p>${escapeHtml(technicianFirstName)} is on the way.</p>
    <p><strong>Your code is: ${code}</strong></p>
    <p>Give this code only to the technician at your door. Do not share it by phone or message.</p>
    <p>- ${escapeHtml(companyName)}</p>
  `;

  try {
    await resendEmailAdapter.send({
      to: email,
      subject,
      text,
      html,
    });
    return {
      channel: "EMAIL",
      status: "QUEUED",
    };
  } catch (error) {
    return {
      channel: "EMAIL",
      status: "FAILED",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
