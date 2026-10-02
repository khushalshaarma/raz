import { describe, it, expect } from "vitest";
import {
  normalizeAgentActivity,
  normalizeMerchantOverview,
  isApiErrorEnvelope,
  toFiniteNumber,
  EMPTY_AGENT_ACTIVITY,
  type MerchantOverview,
} from "@/lib/product/overview-contract";

/**
 * Regression tests for the merchant dashboard runtime error:
 *   "Cannot read properties of undefined (reading 'totalRuns')"
 *   at src/app/merchant/dashboard/page.tsx
 *
 * The dashboard dereferenced `overview.agentActivity.totalRuns` on data that
 * was not guaranteed to be a valid overview payload. These tests pin the
 * response contract so the documented shape is always present.
 */

function fullOverview(overrides: Partial<MerchantOverview> = {}): Record<string, unknown> {
  return {
    revenue: {
      value: 1000,
      formattedValue: "₹10",
      period: "Last 30 days",
      comparison: 5,
      trend: "UP",
      source: "REAL",
    },
    orders: {
      value: 2,
      formattedValue: "2",
      period: "Last 30 days",
      comparison: 1,
      trend: "UP",
      source: "REAL",
    },
    customers: {
      value: 3,
      formattedValue: "3",
      period: "Total",
      comparison: 2,
      trend: "UP",
      source: "REAL",
    },
    conversion: {
      value: 10,
      formattedValue: "10.0%",
      period: "Last 30 days",
      comparison: 0,
      trend: "FLAT",
      source: "REAL",
    },
    averageOrderValue: {
      value: 500,
      formattedValue: "₹5",
      period: "Last 30 days",
      comparison: 0,
      trend: "FLAT",
      source: "REAL",
    },
    repeatCustomerRate: {
      value: 20,
      formattedValue: "20%",
      period: "All time",
      comparison: 0,
      trend: "FLAT",
      source: "REAL",
    },
    paymentSuccessRate: {
      value: 95,
      formattedValue: "95%",
      period: "Last 30 days",
      comparison: 0,
      trend: "UP",
      source: "REAL",
    },
    growthOpportunities: 4,
    activeStrategies: 4,
    pendingApprovals: 2,
    recentExecutions: 7,
    agentActivity: {
      totalRuns: 12,
      completedRuns: 10,
      failedRuns: 2,
      lastRunAt: "2026-01-01T00:00:00.000Z",
      successRate: (10 / 12) * 100,
    },
    riskAlerts: [
      {
        type: "EMERGENCY_STOP",
        message: "Emergency stop is active",
        severity: "HIGH",
        timestamp: "2026-01-01T00:00:00.000Z",
      },
    ],
    aiBuyerActivity: {
      totalRequests: 5,
      pendingApprovals: 1,
      approvedPurchases: 2,
      checkoutStarted: 3,
      successfulPurchases: 2,
      rejectedPurchases: 1,
      recentActivity: [],
    },
    ...overrides,
  };
}

describe("overview response contract", () => {
  describe("normal dashboard response", () => {
    it("preserves agent activity when fully populated", () => {
      const result = normalizeMerchantOverview(fullOverview());

      expect(result.agentActivity.totalRuns).toBe(12);
      expect(result.agentActivity.completedRuns).toBe(10);
      expect(result.agentActivity.failedRuns).toBe(2);
      expect(result.agentActivity.lastRunAt).toBe("2026-01-01T00:00:00.000Z");
      expect(result.agentActivity.successRate).toBeCloseTo((10 / 12) * 100);
    });

    it("preserves metrics, alerts and AI buyer activity", () => {
      const result = normalizeMerchantOverview(fullOverview());

      expect(result.revenue.formattedValue).toBe("₹10");
      expect(result.revenue.trend).toBe("UP");
      expect(result.pendingApprovals).toBe(2);
      expect(result.recentExecutions).toBe(7);
      expect(result.riskAlerts).toHaveLength(1);
      expect(result.aiBuyerActivity.totalRequests).toBe(5);
    });
  });

  describe("merchant with zero agent runs", () => {
    it("returns legitimate zeros rather than undefined", () => {
      const result = normalizeMerchantOverview(
        fullOverview({
          agentActivity: {
            totalRuns: 0,
            completedRuns: 0,
            failedRuns: 0,
            lastRunAt: null,
            successRate: 0,
          },
        })
      );

      expect(result.agentActivity.totalRuns).toBe(0);
      expect(result.agentActivity.successRate).toBe(0);
      expect(result.agentActivity.lastRunAt).toBeNull();
      // The exact expression that used to crash must now be safe.
      expect(result.agentActivity.successRate.toFixed(0)).toBe("0");
    });
  });

  describe("missing or malformed agent activity", () => {
    it("falls back to zeros when agentActivity is missing", () => {
      const payload = fullOverview();
      delete payload.agentActivity;

      const result = normalizeMerchantOverview(payload);

      expect(result.agentActivity).toEqual(EMPTY_AGENT_ACTIVITY);
      expect(result.agentActivity.totalRuns).toBe(0);
    });

    it("falls back to zeros when agentActivity is null", () => {
      const result = normalizeMerchantOverview(fullOverview({ agentActivity: null as never }));
      expect(result.agentActivity.totalRuns).toBe(0);
    });

    it("coerces non-numeric and missing counters to numbers", () => {
      const result = normalizeAgentActivity({
        totalRuns: "12",
        completedRuns: null,
        failedRuns: undefined,
        lastRunAt: 42,
        successRate: "not-a-number",
      });

      expect(result.totalRuns).toBe(12);
      expect(result.completedRuns).toBe(0);
      expect(result.failedRuns).toBe(0);
      expect(result.lastRunAt).toBeNull();
      // Unparseable success rate falls back to a derived value, never NaN.
      expect(Number.isFinite(result.successRate)).toBe(true);
    });

    it("derives successRate when only totals are provided", () => {
      const result = normalizeAgentActivity({ totalRuns: 4, completedRuns: 3 });
      expect(result.successRate).toBe(75);
    });

    it("returns the empty shape for a non-object value", () => {
      expect(normalizeAgentActivity(undefined)).toEqual(EMPTY_AGENT_ACTIVITY);
      expect(normalizeAgentActivity(null)).toEqual(EMPTY_AGENT_ACTIVITY);
      expect(normalizeAgentActivity("nope")).toEqual(EMPTY_AGENT_ACTIVITY);
    });
  });

  describe("unexpected response shapes", () => {
    it("never throws and always exposes totalRuns for an error envelope", () => {
      // This is what the API returns for 401/403/404/500. The page used to
      // store it as `overview` and then crash on `.agentActivity.totalRuns`.
      const errorEnvelope = { error: "Merchant not found" };
      const result = normalizeMerchantOverview(errorEnvelope);

      expect(result.agentActivity.totalRuns).toBe(0);
      expect(result.riskAlerts).toEqual([]);
      expect(result.pendingApprovals).toBe(0);
    });

    it("survives null, undefined and primitive payloads", () => {
      for (const payload of [null, undefined, 42, "text", []]) {
        const result = normalizeMerchantOverview(payload);
        expect(result.agentActivity.totalRuns).toBe(0);
        expect(typeof result.agentActivity.successRate.toFixed(0)).toBe("string");
      }
    });

    it("coerces invalid trend/source values to safe defaults", () => {
      const result = normalizeMerchantOverview(
        fullOverview({
          revenue: { value: 1, formattedValue: "x", period: "", comparison: 0, trend: "SIDEWAYS", source: "MADE_UP" } as never,
        })
      );

      expect(result.revenue.trend).toBe("FLAT");
      expect(result.revenue.source).toBe("INSUFFICIENT_DATA");
    });

    it("drops malformed risk alerts and AI buyer rows instead of throwing", () => {
      const payload = fullOverview();
      payload.riskAlerts = "not-an-array";
      payload.aiBuyerActivity = { totalRequests: 1, recentActivity: "nope" };

      const result = normalizeMerchantOverview(payload);

      expect(result.riskAlerts).toEqual([]);
      expect(result.aiBuyerActivity.totalRequests).toBe(1);
      expect(result.aiBuyerActivity.recentActivity).toEqual([]);
    });
  });

  describe("render safety", () => {
    it("satisfies every overview property the dashboard JSX reads", () => {
      // Guards against a future field being added to the JSX without being
      // added to the contract.
      const result = normalizeMerchantOverview({ error: "boom" });

      expect(() => result.agentActivity.totalRuns).not.toThrow();
      expect(() => result.agentActivity.successRate.toFixed(0)).not.toThrow();
      expect(() => result.aiBuyerActivity.totalRequests).not.toThrow();
      expect(() => result.aiBuyerActivity.recentActivity.slice(0, 6)).not.toThrow();
      expect(() => result.riskAlerts.map((a) => a.message)).not.toThrow();
      expect(() => result.growthOpportunities.toString()).not.toThrow();
    });

    it("amount stays numeric so toLocaleString cannot throw", () => {
      const result = normalizeMerchantOverview(
        fullOverview({
          aiBuyerActivity: {
            totalRequests: 1,
            pendingApprovals: 0,
            approvedPurchases: 0,
            checkoutStarted: 0,
            successfulPurchases: 0,
            rejectedPurchases: 0,
            recentActivity: [{ time: "now", query: "shoes", productName: "Sneaker", status: "APPROVED", amount: "499" as unknown as number }],
          },
        })
      );

      expect(result.aiBuyerActivity.recentActivity[0].amount).toBe(499);
      expect(() => result.aiBuyerActivity.recentActivity[0].amount.toLocaleString("en-IN")).not.toThrow();
    });
  });

  describe("error envelope detection", () => {
    it("identifies API error payloads", () => {
      expect(isApiErrorEnvelope({ error: "Unauthorized" })).toBe(true);
      expect(isApiErrorEnvelope({ error: "Merchant not found", status: 404 })).toBe(true);
    });

    it("does not misclassify valid overviews", () => {
      expect(isApiErrorEnvelope(fullOverview())).toBe(false);
      expect(isApiErrorEnvelope({ agentActivity: {} })).toBe(false);
      expect(isApiErrorEnvelope(null)).toBe(false);
      expect(isApiErrorEnvelope("error")).toBe(false);
    });
  });

  describe("toFiniteNumber", () => {
    it("coerces valid input and falls back for invalid input", () => {
      expect(toFiniteNumber(5)).toBe(5);
      expect(toFiniteNumber("7")).toBe(7);
      expect(toFiniteNumber(undefined, 3)).toBe(3);
      expect(toFiniteNumber(null, 3)).toBe(3);
      expect(toFiniteNumber(NaN, 3)).toBe(3);
      expect(toFiniteNumber(Infinity, 3)).toBe(3);
      expect(toFiniteNumber({}, 3)).toBe(3);
    });
  });
});