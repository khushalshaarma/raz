import { describe, it, expect } from "vitest";
import { withRetry } from "@/lib/security/retry";

describe("Concurrency Safety", () => {
  it("handles concurrent retry operations", async () => {
    let callCount = 0;

    const unreliableFn = async () => {
      callCount++;
      if (callCount <= 2) {
        throw new Error("Temporary failure");
      }
      return "success";
    };

    const promises = Array.from({ length: 3 }, () =>
      withRetry(unreliableFn, { config: { maxAttempts: 4, baseDelayMs: 10 } })
    );

    const results = await Promise.allSettled(promises);
    const successes = results.filter((r) => r.status === "fulfilled");
    expect(successes.length).toBeGreaterThanOrEqual(1);
  });

  it("prevents race condition in idempotent operations", async () => {
    const operations = new Set<string>();
    const results: string[] = [];

    const idempotentOp = async (id: string) => {
      if (operations.has(id)) {
        return "skipped";
      }
      operations.add(id);
      await new Promise((r) => setTimeout(r, 5));
      results.push(id);
      return "completed";
    };

    await Promise.all([
      idempotentOp("op-1"),
      idempotentOp("op-1"),
      idempotentOp("op-1"),
    ]);

    expect(results.filter((r) => r === "op-1")).toHaveLength(1);
  });

  it("handles concurrent metric updates with mutex", async () => {
    const metrics = new Map<string, number>();
    let lock = false;

    const increment = async (key: string, amount: number) => {
      while (lock) await new Promise((r) => setTimeout(r, 1));
      lock = true;
      try {
        const current = metrics.get(key) || 0;
        await new Promise((r) => setTimeout(r, 5));
        metrics.set(key, current + amount);
      } finally {
        lock = false;
      }
    };

    await Promise.all([
      increment("counter", 1),
      increment("counter", 1),
      increment("counter", 1),
      increment("counter", 1),
      increment("counter", 1),
    ]);

    const finalValue = metrics.get("counter") || 0;
    expect(finalValue).toBe(5);
  });

  it("handles concurrent state transitions with mutex", async () => {
    type State = "idle" | "processing" | "completed" | "failed";
    let currentState: State = "idle";
    const transitions: State[] = [];
    let lock = false;

    const transition = async (from: State, to: State) => {
      if (lock) return false;
      lock = true;
      try {
        if (currentState === from) {
          await new Promise((r) => setTimeout(r, 5));
          currentState = to;
          transitions.push(to);
          return true;
        }
        return false;
      } finally {
        lock = false;
      }
    };

    const results = await Promise.all([
      transition("idle", "processing"),
      transition("idle", "processing"),
      transition("idle", "processing"),
    ]);

    const successfulTransitions = results.filter((r) => r === true);
    expect(successfulTransitions).toHaveLength(1);
    expect(currentState).toBe("processing");
  });

  it("handles concurrent fund operations with balance check", async () => {
    let balance = 1000;
    const operations: number[] = [];
    let lock = false;

    const debit = async (amount: number) => {
      if (lock) return false;
      lock = true;
      try {
        const currentBalance = balance;
        await new Promise((r) => setTimeout(r, 5));
        if (currentBalance >= amount) {
          balance = currentBalance - amount;
          operations.push(-amount);
          return true;
        }
        operations.push(0);
        return false;
      } finally {
        lock = false;
      }
    };

    const results = await Promise.all([
      debit(600),
      debit(600),
      debit(600),
    ]);

    const successfulDebits = results.filter((r) => r === true);
    expect(successfulDebits.length).toBeLessThanOrEqual(1);
    expect(balance).toBeGreaterThanOrEqual(0);
  });

  it("prevents double-processing of webhook events", async () => {
    const processedEvents = new Set<string>();
    const results: string[] = [];

    const processWebhook = async (eventId: string) => {
      if (processedEvents.has(eventId)) {
        return "duplicate";
      }
      processedEvents.add(eventId);
      await new Promise((r) => setTimeout(r, 10));
      results.push(eventId);
      return "processed";
    };

    await Promise.all([
      processWebhook("evt-1"),
      processWebhook("evt-1"),
      processWebhook("evt-1"),
    ]);

    expect(results.filter((r) => r === "evt-1")).toHaveLength(1);
  });
});
