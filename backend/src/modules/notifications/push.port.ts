/**
 * Minimal push-notification abstraction (plan.md Phase 10 Slice E). Callers
 * only ever depend on this interface — never on the concrete adapter — so
 * swapping providers later is a single-file change with no ripple into
 * notification.port.ts or its handlers. Mirrors email.port.ts.
 */

export interface PushMessage {
  /** FCM device registration token — one message targets one device. */
  token: string;
  title: string;
  body: string;
  /**
   * FCM data payloads must be flat string maps. Used for client-side deep
   * linking (e.g. { jobId } so the app can open the right screen).
   */
  data?: Record<string, string>;
}

export interface PushPort {
  /**
   * Sends one push message to one device token. Implementations should
   * throw on failure so the caller (the queue / dispatch handler) can
   * react — in particular, throwing `PushTokenInvalidError` for a
   * token FCM no longer recognizes lets the caller prune it from storage.
   */
  send(message: PushMessage): Promise<void>;
}