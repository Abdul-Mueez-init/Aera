import { env } from "../../config/env.js";
import { logger } from "../../common/logger.js";
import type { EmailMessage, EmailPort } from "./email.port.js";

// Plain REST call rather than the official `resend` SDK: Resend's send-email
// endpoint is a single POST with a stable JSON body, so a dependency isn't
// warranted (rules.md §11: "do not introduce a library for a problem that
// can be solved clearly with the existing stack"). Node's built-in fetch
// (global since Node 18) is all this needs.
// Docs: https://resend.com/docs/api-reference/emails/send-email
const RESEND_API_URL = "https://api.resend.com/emails";

// Local/dev/test environments intentionally run without a Resend API key.
// Warn once (not per-send) so logs stay readable when a burst of
// notifications fires with no key configured.
let warnedMissingKey = false;

export const resendEmailAdapter: EmailPort = {
  async send(message: EmailMessage): Promise<void> {
    if (!env.RESEND_API_KEY) {
      if (!warnedMissingKey) {
        logger.warn(
          "RESEND_API_KEY is not configured; skipping email send. This is expected in local/dev/test — set RESEND_API_KEY to send real email.",
        );
        warnedMissingKey = true;
      }
      return;
    }

    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    if (!response.ok) {
      // Never log the API key or full response body verbatim (rules.md §2,
      // §6: no secrets/sensitive data in logs); truncate defensively.
      const body = await response.text().catch(() => "");
      throw new Error(
        `Resend API request failed (${response.status}): ${body.slice(0, 300)}`,
      );
    }
  },
};
