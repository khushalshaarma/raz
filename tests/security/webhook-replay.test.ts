import { describe, it, expect, beforeEach } from "vitest";
import {
  isReplayEvent,
  generateEventId,
  getReplayStats,
  clearReplayWindow,
} from "@/lib/security/webhook-replay";

describe("Webhook Replay Protection", () => {
  beforeEach(() => {
    clearReplayWindow("merchant-1");
  });

  it("allows first event", () => {
    const result = isReplayEvent("merchant-1", "evt-001");
    expect(result.isReplay).toBe(false);
  });

  it("detects duplicate event within window", () => {
    isReplayEvent("merchant-1", "evt-001");
    const result = isReplayEvent("merchant-1", "evt-001");
    expect(result.isReplay).toBe(true);
    expect(result.reason).toContain("evt-001");
  });

  it("allows same event after window expires", async () => {
    isReplayEvent("merchant-1", "evt-001", 100);
    await new Promise((r) => setTimeout(r, 150));
    const result = isReplayEvent("merchant-1", "evt-001", 100);
    expect(result.isReplay).toBe(false);
  });

  it("isolates merchants from each other", () => {
    isReplayEvent("merchant-1", "evt-001");
    const result = isReplayEvent("merchant-2", "evt-001");
    expect(result.isReplay).toBe(false);
  });

  it("handles empty merchant id", () => {
    const result = isReplayEvent("", "evt-001");
    expect(result.isReplay).toBe(false);
  });

  it("handles empty event id", () => {
    const result = isReplayEvent("merchant-1", "");
    expect(result.isReplay).toBe(false);
  });

  it("generates deterministic event id", () => {
    const id1 = generateEventId("m1", "payment.captured", "{}");
    const id2 = generateEventId("m1", "payment.captured", "{}");
    expect(id1).toBe(id2);
  });

  it("generates different ids for different inputs", () => {
    const id1 = generateEventId("m1", "payment.captured", "{}");
    const id2 = generateEventId("m1", "payment.failed", "{}");
    expect(id1).not.toBe(id2);
  });

  it("reports accurate stats", () => {
    isReplayEvent("merchant-1", "evt-001");
    isReplayEvent("merchant-1", "evt-002");
    const stats = getReplayStats("merchant-1");
    expect(stats.eventCount).toBe(2);
    expect(stats.oldestEventAge).toBeGreaterThanOrEqual(0);
  });

  it("clears replay window", () => {
    isReplayEvent("merchant-1", "evt-001");
    clearReplayWindow("merchant-1");
    const stats = getReplayStats("merchant-1");
    expect(stats.eventCount).toBe(0);
  });
});
