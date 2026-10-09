import { randomUUID } from "node:crypto";
import { logger } from "../common/logger.js";
import { captureBackgroundError } from "../common/observability.js";
import { env } from "../config/env.js";
import type {
  EnqueueOptions,
  QueueHandler,
  QueueJob,
  QueuePort,
} from "./queue.port.js";

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_MAX_QUEUE_SIZE = 1000; // Bounded capacity to prevent unbounded memory growth

// Short, fixed backoff steps. There is no external rate limit to respect
// here (jobs today are local DB writes), so these only need to be long
// enough to ride out a transient blip, not to protect a third-party API —
// that consideration belongs to whichever adapter (email/SMS/push) ends up
// calling an external provider in Phase 10 Slice D.
const RETRY_DELAYS_MS = [50, 250, 1000];

interface InternalJob extends QueueJob {
  maxAttempts: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * In-process, in-memory queue with bounded capacity and backpressure.
 * Jobs are processed one at a time in FIFO order, so a burst of enqueues
 * can never open more concurrent database connections than the request path
 * itself would.
 *
 * The queue has a maximum size to prevent unbounded memory growth. When the
 * queue is full, new jobs are rejected with backpressure logging.
 *
 * There is no persistence: jobs still in flight when the process exits are
 * lost. That is an accepted limitation for the non-critical side effects
 * this currently carries (notifications, per ADR-009). For production,
 * this should be replaced with a durable queue (Redis/BullMQ) which would
 * provide persistence, cluster-wide coordination, and true backpressure.
 */
export class InProcessQueue implements QueuePort {
  private readonly handlers = new Map<string, QueueHandler>();
  private readonly jobs: InternalJob[] = [];
  private draining = false;
  private readonly maxQueueSize: number;

  constructor() {
    // Allow overriding max queue size via env, default to 1000
    this.maxQueueSize = env.QUEUE_MAX_SIZE ?? DEFAULT_MAX_QUEUE_SIZE;
  }

  registerHandler<TPayload = unknown>(
    type: string,
    handler: QueueHandler<TPayload>,
  ): void {
    this.handlers.set(type, handler as QueueHandler);
  }

  async enqueue<TPayload = unknown>(
    type: string,
    payload: TPayload,
    options: EnqueueOptions = {},
  ): Promise<void> {
    if (!this.handlers.has(type)) {
      logger.warn(
        { jobType: type },
        "Queue: no handler registered for job type; dropping job",
      );
      return;
    }

    // Apply backpressure: reject if queue is at capacity
    if (this.jobs.length >= this.maxQueueSize) {
      logger.error(
        { jobType: type, queueSize: this.jobs.length, maxQueueSize: this.maxQueueSize },
        "Queue: at capacity; rejecting job (backpressure)",
      );
      captureBackgroundError(
        new Error("Queue at capacity"),
        "queue-backpressure",
        { jobType: type, queueSize: this.jobs.length },
      );
      throw new Error("Queue at capacity - job rejected");
    }

    this.jobs.push({
      id: randomUUID(),
      type,
      payload,
      attempts: 0,
      enqueuedAt: new Date().toISOString(),
      maxAttempts: options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    });

    void this.drain();
  }

  /**
   * Test-only convenience: resolves once every job currently queued (and
   * anything its processing enqueues) has settled. Production code should
   * never need this — the whole point of the queue is not waiting.
   */
  async onIdle(): Promise<void> {
    while (this.draining || this.jobs.length > 0) {
      await delay(10);
    }
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      let job: InternalJob | undefined;
      while ((job = this.jobs.shift())) {
        await this.runWithRetry(job);
      }
    } finally {
      this.draining = false;
    }
  }

  private async runWithRetry(job: InternalJob): Promise<void> {
    const handler = this.handlers.get(job.type);
    if (!handler) {
      logger.warn(
        { jobType: job.type, jobId: job.id },
        "Queue: handler removed before processing; dropping job",
      );
      return;
    }

    let attempts = job.attempts;
    while (attempts < job.maxAttempts) {
      attempts += 1;
      try {
        await handler(job.payload, { ...job, attempts });
        return;
      } catch (error) {
        const willRetry = attempts < job.maxAttempts;
        logger.warn(
          {
            err: error,
            jobType: job.type,
            jobId: job.id,
            attempt: attempts,
            maxAttempts: job.maxAttempts,
            willRetry,
          },
          willRetry
            ? "Queue job failed; retrying"
            : "Queue job failed after all attempts; dropping",
        );
        if (!willRetry) {
          captureBackgroundError(error, "queue", {
            jobType: job.type,
            jobId: job.id,
            attempts,
            maxAttempts: job.maxAttempts,
          });
        }
        if (willRetry) {
          await delay(
            RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)],
          );
        }
      }
    }
  }
}

export const inProcessQueue: InProcessQueue = new InProcessQueue();
