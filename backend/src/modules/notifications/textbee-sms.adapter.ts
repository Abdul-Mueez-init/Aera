import { env } from "../../config/env.js";
import { logger } from "../../common/logger.js";
import type { SmsMessage, SmsPort } from "./sms.port.js";

// Plain REST call rather than the official `@textbee/sdk` package: this is
// a single POST with one header and a small JSON body, so a dependency
// isn't warranted (rules.md §11: "do not introduce a library for a problem
// that can be solved clearly with the existing stack"). Node's built-in
// fetch (global since Node 18) is all this needs.
// Docs: https://textbee.dev/docs/sending-sms/sending-sms
const TEXTBEE_API_URL = "https://api.textbee.dev/api/v1/gateway/send-sms";

// Local/dev/test environments intentionally run without a textbee API key.
// Warn once (not per-send) so logs stay readable when a burst of
// notifications fires with no key configured.
let warnedMissingKey = false;

export const textbeeSmsAdapter: SmsPort = {
  async send(message: SmsMessage): Promise<void> {
    if (!env.TEXTBEE_API_KEY) {
      if (!warnedMissingKey) {
        logger.warn(
          "TEXTBEE_API_KEY is not configured; skipping SMS send. This is expected in local/dev/test — set TEXTBEE_API_KEY (and keep the gateway phone online) to send real SMS.",
        );
        warnedMissingKey = true;
      }
      return;
    }

    const response = await fetch(TEXTBEE_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": env.TEXTBEE_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipients: [message.to],
        message: message.body,
      }),
    });

    if (!response.ok) {
      // Never log the API key or full response body verbatim (rules.md §2,
      // §6: no secrets/sensitive data in logs); truncate defensively.
      const body = await response.text().catch(() => "");
      throw new Error(
        `textbee API request failed (${response.status}): ${body.slice(0, 300)}`,
      );
    }
  },
};
