/**
 * Minimal queue abstraction (architecture.md ADR-009 / plan.md Phase 10
 * Slice C): start with an in-process implementation, add Redis/BullMQ once
 * background load actually requires it. Callers only ever depend on this
 * interface — never on the concrete adapter — so that upgrade is a
 * single-file swap (see in-process-queue.adapter.ts) with no changes to
 * the modules that enqueue work.
 *
 * Intended job types: notification dispatch today; image processing,
 * email/SMS sending, AI summarization, and scheduled invoice reminders
 * per architecture.md §2 "Async jobs" as those adapters are built.
 */

export interface QueueJob<TPayload = unknown> {
  readonly id: string;
  readonly type: string;
  readonly payload: TPayload;
  readonly attempts: number;
  readonly enqueuedAt: string;
}

export interface EnqueueOptions {
  /** Total attempts (including the first) before the job is dropped. Defaults to 3. */
  maxAttempts?: number;
}

export type QueueHandler<TPayload = unknown> = (
  payload: TPayload,
  job: QueueJob<TPayload>,
) => Promise<void>;

export interface QueuePort {
  /**
   * Registers the handler invoked whenever a job of `type` is processed.
   * Only one handler per type is supported; a second registration for the
   * same type replaces the first.
   */
  registerHandler<TPayload = unknown>(
    type: string,
    handler: QueueHandler<TPayload>,
  ): void;

  /**
   * Enqueues a job. Resolves as soon as the job has been accepted onto the
   * queue, not once it has finished processing — this is what keeps the
   * primary request path non-blocking (architecture.md §2: "Do not make
   * the primary request wait for non-critical side effects"). Callers may
   * `await` it or fire-and-forget with `void`; either is safe.
   */
  enqueue<TPayload = unknown>(
    type: string,
    payload: TPayload,
    options?: EnqueueOptions,
  ): Promise<void>;
}