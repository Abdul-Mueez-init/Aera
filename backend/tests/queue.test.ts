import { describe, expect, it } from "vitest";
import { InProcessQueue } from "../src/queue/in-process-queue.adapter.js";

describe("InProcessQueue", () => {
  it("invokes the registered handler with the enqueued payload", async () => {
    const queue = new InProcessQueue();
    const received: unknown[] = [];
    queue.registerHandler<{ value: string }>("test.echo", async (payload) => {
      received.push(payload);
    });

    await queue.enqueue("test.echo", { value: "hello" });
    await queue.onIdle();

    expect(received).toEqual([{ value: "hello" }]);
  });

  it("does not throw when no handler is registered for the job type", async () => {
    const queue = new InProcessQueue();
    await expect(
      queue.enqueue("unregistered.type", { any: true }),
    ).resolves.toBeUndefined();
  });

  it("resolves enqueue before the handler has finished running", async () => {
    const queue = new InProcessQueue();
    let handlerFinished = false;
    queue.registerHandler("test.slow", async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      handlerFinished = true;
    });

    await queue.enqueue("test.slow", {});
    expect(handlerFinished).toBe(false);

    await queue.onIdle();
    expect(handlerFinished).toBe(true);
  });

  it("retries a failing handler up to maxAttempts, then drops the job without throwing", async () => {
    const queue = new InProcessQueue();
    let calls = 0;
    queue.registerHandler("test.flaky", async () => {
      calls += 1;
      throw new Error("simulated failure");
    });

    await queue.enqueue("test.flaky", {}, { maxAttempts: 2 });
    await queue.onIdle();

    expect(calls).toBe(2);
  });

  it("succeeds without exhausting attempts if the handler recovers", async () => {
    const queue = new InProcessQueue();
    let calls = 0;
    queue.registerHandler("test.recovers", async () => {
      calls += 1;
      if (calls < 2) {
        throw new Error("first attempt fails");
      }
    });

    await queue.enqueue("test.recovers", {}, { maxAttempts: 3 });
    await queue.onIdle();

    expect(calls).toBe(2);
  });

  it("processes jobs of the same type in FIFO order", async () => {
    const queue = new InProcessQueue();
    const order: number[] = [];
    queue.registerHandler<number>("test.order", async (n) => {
      order.push(n);
    });

    await queue.enqueue("test.order", 1);
    await queue.enqueue("test.order", 2);
    await queue.enqueue("test.order", 3);
    await queue.onIdle();

    expect(order).toEqual([1, 2, 3]);
  });
});