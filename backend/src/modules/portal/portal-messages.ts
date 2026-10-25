import { escapeHtml } from "../notifications/email-templates.js";

/**
 * Portal message templates (handoff 5.10). Kept separate from the staff
 * notification builders on purpose: portal messages go to customers and
 * carry the single-use link / handshake code. Every interpolated name is
 * HTML-escaped in the HTML variant; ids, links and codes only — never any
 * other customer data.
 */

/** E.164: leading +, non-zero first digit, 8–15 digits total. */
export const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export function isValidE164(phone: string | null | undefined): boolean {
  return typeof phone === "string" && E164_PATTERN.test(phone);
}

export interface PortalLinkMessageInput {
  companyName: string;
  jobNumber: number;
  link: string;
}

export interface PortalLinkEmailInput extends PortalLinkMessageInput {
  customerFirstName: string;
}

export interface HandshakeCodeMessageInput {
  companyName: string;
  technicianFirstName: string;
  code: string;
}

export interface HandshakeCodeEmailInput extends HandshakeCodeMessageInput {
  customerFirstName: string;
}

export interface EmailMessage {
  subject: string;
  text: string;
  html: string;
}

export function portalLinkSms(input: PortalLinkMessageInput): string {
  return `${input.companyName}: open your service portal for job #${input.jobNumber}: ${input.link} — use this phone. The link works once.`;
}

export function portalLinkEmail(input: PortalLinkEmailInput): EmailMessage {
  const subject = `${input.companyName}: Your service portal for job #${input.jobNumber}`;
  const text = [
    `Hello ${input.customerFirstName},`,
    "",
    `${input.companyName}: open your service portal for job #${input.jobNumber}: ${input.link}`,
    "",
    "Use this phone or device — the link works once.",
    "",
    `- ${input.companyName}`,
  ].join("\n");
  const html = [
    `<p>Hello ${escapeHtml(input.customerFirstName)},</p>`,
    `<p>${escapeHtml(input.companyName)}: open your service portal for job #${input.jobNumber}: <a href="${escapeHtml(input.link)}">${escapeHtml(input.link)}</a></p>`,
    `<p>Use this phone or device — the link works once.</p>`,
    `<p>- ${escapeHtml(input.companyName)}</p>`,
  ].join("\n");
  return { subject, text, html };
}

export function handshakeCodeSms(input: HandshakeCodeMessageInput): string {
  return `${input.companyName}: ${input.technicianFirstName} is on the way. Your code is ${input.code}. Give it only to the technician at your door.`;
}

export function handshakeCodeEmail(
  input: HandshakeCodeEmailInput,
): EmailMessage {
  const subject = `${input.companyName}: Your verification code`;
  const text = [
    `Hello ${input.customerFirstName},`,
    "",
    `${input.technicianFirstName} is on the way. Your code is ${input.code}. Give it only to the technician at your door.`,
    "",
    `- ${input.companyName}`,
  ].join("\n");
  const html = [
    `<p>Hello ${escapeHtml(input.customerFirstName)},</p>`,
    `<p>${escapeHtml(input.technicianFirstName)} is on the way. <strong>Your code is ${escapeHtml(input.code)}</strong>. Give it only to the technician at your door.</p>`,
    `<p>- ${escapeHtml(input.companyName)}</p>`,
  ].join("\n");
  return { subject, text, html };
}
