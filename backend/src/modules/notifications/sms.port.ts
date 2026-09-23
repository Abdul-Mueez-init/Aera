/**
 * Minimal SMS-sending abstraction (plan.md Phase 10 Slice F). Callers only
 * ever depend on this interface — never on the concrete adapter — so that
 * swapping providers later is a single-file change with no ripple into
 * notification.port.ts or its handlers. Mirrors email.port.ts / push.port.ts.
 */

export interface SmsMessage {
  /** Recipient phone number in E.164 format, e.g. "+923001234567". */
  to: string;
  body: string;
}

export interface SmsPort {
  /**
   * Sends one SMS. Implementations should throw on failure so the caller
   * (the queue) can retry with backoff — never swallow errors here.
   */
  send(message: SmsMessage): Promise<void>;
}
