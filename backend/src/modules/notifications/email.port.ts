/**
 * Minimal email-sending abstraction (plan.md Phase 10 Slice D). Callers only
 * ever depend on this interface — never on the concrete adapter — so that
 * swapping providers (Resend today, something else later) is a single-file
 * change with no ripple into notification.port.ts or its handlers.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailPort {
  /**
   * Sends one email. Implementations should throw on failure so the caller
   * (the queue) can retry with backoff — never swallow errors here.
   */
  send(message: EmailMessage): Promise<void>;
}
