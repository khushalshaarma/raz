import { describe, it, expect, beforeEach } from "vitest";
import {
  checkRateLimit,
  getRateLimitHeaders,
  clearRateLimitBuckets,
  cleanupExpiredEntries,
  resolveApiRateLimit,
  getRetryAfterSeconds,
} from "@/lib/security/rate-limiter";

describe("rate-limiter", () => {
  beforeEach(() => clearRateLimitBuckets());

  describe("basic rate limiting", () => {
    it("allows requests within limit", () => {
      const result = checkRateLimit("test-key", { windowMs: 60000, maxRequests: 5 });
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it("blocks requests exceeding limit", () => {
      for (let i = 0; i < 5; i++) {
        checkRateLimit("test-key", { windowMs: 60000, maxRequests: 5 });
      }
      const result = checkRateLimit("test-key", { windowMs: 60000, maxRequests: 5 });
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("tracks remaining correctly", () => {
      checkRateLimit("test-key", { windowMs: 60000, maxRequests: 3 });
      checkRateLimit("test-key", { windowMs: 60000, maxRequests: 3 });
      const result = checkRateLimit("test-key", { windowMs: 60000, maxRequests: 3 });
      expect(result.remaining).toBe(0);
    });
  });

  describe("window expiration", () => {
    it("resets after window expires", () => {
      const key = "expire-test";
      const config = { windowMs: 1, maxRequests: 2 };
      checkRateLimit(key, config);
      checkRateLimit(key, config);
      const blocked = checkRateLimit(key, config);
      expect(blocked.allowed).toBe(false);
    });
  });

  describe("isolated keys", () => {
    it("different keys are isolated", () => {
      const config = { windowMs: 60000, maxRequests: 2 };
      checkRateLimit("key-a", config);
      checkRateLimit("key-a", config);
      const a = checkRateLimit("key-a", config);
      expect(a.allowed).toBe(false);
      const b = checkRateLimit("key-b", config);
      expect(b.allowed).toBe(true);
    });
  });

  describe("headers", () => {
    it("returns correct headers", () => {
      const result = checkRateLimit("header-test", { windowMs: 60000, maxRequests: 10 });
      const headers = getRateLimitHeaders(result);
      expect(headers["X-RateLimit-Remaining"]).toBe("9");
      expect(headers["X-RateLimit-Reset"]).toBeDefined();
    });

    it("includes Retry-After so clients know how long to wait", () => {
      const now = Date.now();
      const result = checkRateLimit("retry-after-test", { windowMs: 30000, maxRequests: 1 });
      const headers = getRateLimitHeaders(result);

      const retryAfter = Number(headers["Retry-After"]);
      expect(Number.isFinite(retryAfter)).toBe(true);
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(30);
      expect(result.resetAt).toBeGreaterThan(now);
    });

    it("never returns a Retry-After below one second", () => {
      const result = { allowed: false, remaining: 0, resetAt: Date.now() - 5000 };
      expect(getRetryAfterSeconds(result)).toBe(1);
    });
  });

  describe("per-route limit resolution", () => {
    it("keeps strict production limits", () => {
      expect(resolveApiRateLimit("/api/auth/login", "production")).toEqual({
        windowMs: 60000,
        maxRequests: 10,
      });
      expect(resolveApiRateLimit("/api/auth/register", "production")).toEqual({
        windowMs: 300000,
        maxRequests: 5,
      });
      expect(resolveApiRateLimit("/api/webhooks", "production")).toEqual({
        windowMs: 60000,
        maxRequests: 200,
      });
      expect(resolveApiRateLimit("/api/merchant/overview", "production")).toEqual({
        windowMs: 60000,
        maxRequests: 100,
      });
    });

    it("relaxes the budget outside production without disabling the limiter", () => {
      const dev = resolveApiRateLimit("/api/merchant/overview", "development");
      expect(dev.maxRequests).toBeGreaterThan(100);
      // Window length is preserved so the limiter still resets.
      expect(dev.windowMs).toBe(60000);

      const test = resolveApiRateLimit("/api/merchant/overview", "test");
      expect(test.maxRequests).toBeGreaterThan(100);
    });

    it("applies the relaxation to sensitive auth routes too", () => {
      expect(resolveApiRateLimit("/api/auth/login", "development").maxRequests)
        .toBeGreaterThan(resolveApiRateLimit("/api/auth/login", "production").maxRequests);
    });

    it("does not exhaust the development budget during active development", () => {
      // React StrictMode double-invokes effects and HMR remounts components, so a
      // single page view costs several requests per endpoint.
      const config = resolveApiRateLimit("/api/merchant/overview", "development");
      for (let i = 0; i < 250; i++) {
        expect(checkRateLimit("dev-overview", config).allowed).toBe(true);
      }
    });

    it("still blocks once the development budget is genuinely exhausted", () => {
      const config = resolveApiRateLimit("/api/merchant/overview", "development");
      let last;
      for (let i = 0; i < config.maxRequests; i++) {
        last = checkRateLimit("dev-exhaust", config);
      }
      expect(last!.allowed).toBe(true);
      expect(checkRateLimit("dev-exhaust", config).allowed).toBe(false);
    });

    it("does not mutate the shared production config between calls", () => {
      resolveApiRateLimit("/api/merchant/overview", "development");
      expect(resolveApiRateLimit("/api/merchant/overview", "production").maxRequests).toBe(100);
    });
  });

  describe("cleanup", () => {
    it("clearRateLimitBuckets clears all entries", () => {
      const config = { windowMs: 60000, maxRequests: 100 };
      checkRateLimit("cleanup-test-1", config);
      checkRateLimit("cleanup-test-2", config);
      clearRateLimitBuckets();
      const r1 = checkRateLimit("cleanup-test-1", config);
      expect(r1.remaining).toBe(99);
    });

    it("cleanupExpiredEntries cleans old entries", () => {
      const config = { windowMs: 0, maxRequests: 100 };
      checkRateLimit("expire-test", config);
      const cleaned = cleanupExpiredEntries();
      expect(cleaned).toBeGreaterThanOrEqual(0);
    });
  });
});
