import { describe, it, expect } from "vitest";
import { classifyRetry, calculateRetryDelay, withRetry } from "@/lib/security/retry";

describe("retry", () => {
  describe("classifyRetry", () => {
    it("classifies SAFE_TO_RETRY codes", () => {
      expect(classifyRetry("TIMEOUT")).toBe("SAFE_TO_RETRY");
      expect(classifyRetry("NETWORK_ERROR")).toBe("SAFE_TO_RETRY");
      expect(classifyRetry("429")).toBe("SAFE_TO_RETRY");
      expect(classifyRetry("503")).toBe("SAFE_TO_RETRY");
    });

    it("classifies NOT_SAFE_TO_RETRY codes", () => {
      expect(classifyRetry("AUTH_ERROR")).toBe("NOT_SAFE_TO_RETRY");
      expect(classifyRetry("PAYMENT_DECLINED")).toBe("NOT_SAFE_TO_RETRY");
      expect(classifyRetry("401")).toBe("NOT_SAFE_TO_RETRY");
    });

    it("returns UNKNOWN for unknown codes", () => {
      expect(classifyRetry("UNKNOWN_CODE")).toBe("UNKNOWN");
    });

    it("returns UNKNOWN for null", () => {
      expect(classifyRetry(null)).toBe("UNKNOWN");
    });
  });

  describe("calculateRetryDelay", () => {
    it("calculates exponential backoff", () => {
      const d0 = calculateRetryDelay(0);
      const d1 = calculateRetryDelay(1);
      const d2 = calculateRetryDelay(2);
      expect(d1).toBeGreaterThan(d0);
      expect(d2).toBeGreaterThan(d1);
    });

    it("caps at maxDelayMs", () => {
      const delay = calculateRetryDelay(100, { maxDelayMs: 5000 });
      expect(delay).toBeLessThanOrEqual(5000);
    });
  });

  describe("withRetry", () => {
    it("succeeds on first attempt", async () => {
      let calls = 0;
      const result = await withRetry(async () => {
        calls++;
        return "ok";
      }, { config: { maxAttempts: 3 } });
      expect(result).toBe("ok");
      expect(calls).toBe(1);
    });

    it("retries on failure then succeeds", async () => {
      let calls = 0;
      const result = await withRetry(
        async () => {
          calls++;
          if (calls < 3) throw new Error("fail");
          return "ok";
        },
        { config: { maxAttempts: 3, baseDelayMs: 1 } }
      );
      expect(result).toBe("ok");
      expect(calls).toBe(3);
    });

    it("throws after max attempts", async () => {
      await expect(
        withRetry(
          async () => {
            throw new Error("always fail");
          },
          { config: { maxAttempts: 2, baseDelayMs: 1 } }
        )
      ).rejects.toThrow("always fail");
    });

    it("stops retrying on NOT_SAFE_TO_RETRY", async () => {
      let calls = 0;
      await expect(
        withRetry(
          async () => {
            calls++;
            const err = new Error("auth failed");
            (err as any).code = "AUTH_ERROR";
            throw err;
          },
          {
            config: { maxAttempts: 3, baseDelayMs: 1 },
            classify: (err) => {
              if (err.message.includes("auth")) return "NOT_SAFE_TO_RETRY";
              return "UNKNOWN";
            },
          }
        )
      ).rejects.toThrow("auth failed");
      expect(calls).toBe(1);
    });
  });
});
