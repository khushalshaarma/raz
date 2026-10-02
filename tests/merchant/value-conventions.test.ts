import { describe, it, expect } from "vitest";
import {
  countByCanonicalStatus,
  normalizePaymentStatus,
  totalStatusCount,
  PAYMENT_SUCCESS_STATUSES,
  PAYMENT_FAILURE_STATUSES,
  PAYMENT_REFUND_STATUSES,
} from "@/lib/product/payment-status";
import {
  formatConfidencePercent,
  toConfidencePercent,
} from "@/lib/product/format";

/**
 * Regression cover for the two value-convention bugs that made the merchant
 * dashboard report impossible numbers:
 *
 *  1. Payment status casing. `Payment.status` holds UPPERCASE values
 *     (`CAPTURED`) but the readers filtered on lowercase literals, so every
 *     merchant with real captured payments showed a 0% success rate and a
 *     false HIGH-severity `PAYMENT_FAILURE` risk alert.
 *  2. Confidence scale. Confidence is an integer percentage (0-100), but the
 *     UI multiplied by 100, rendering a stored 84 as "8400%".
 */

describe("normalizePaymentStatus", () => {
  it("upper-cases and trims", () => {
    expect(normalizePaymentStatus("captured")).toBe("CAPTURED");
    expect(normalizePaymentStatus("  Captured ")).toBe("CAPTURED");
    expect(normalizePaymentStatus("FAILED")).toBe("FAILED");
  });
});

describe("countByCanonicalStatus", () => {
  it("counts UPPERCASE stored values (the actual database convention)", () => {
    const counts = { CAPTURED: 18, CREATED: 11, PENDING: 6 };
    expect(countByCanonicalStatus(counts, PAYMENT_SUCCESS_STATUSES)).toBe(18);
  });

  it("counts lowercase values that were previously missed", () => {
    const counts = { captured: 4, failed: 1 };
    expect(countByCanonicalStatus(counts, PAYMENT_SUCCESS_STATUSES)).toBe(4);
    expect(countByCanonicalStatus(counts, PAYMENT_FAILURE_STATUSES)).toBe(1);
  });

  it("matches regardless of case and surrounding whitespace", () => {
    const counts = { " captured ": 2, CaPtUrEd: 3 };
    expect(countByCanonicalStatus(counts, PAYMENT_SUCCESS_STATUSES)).toBe(5);
  });

  it("returns 0 when no status matches instead of a false positive", () => {
    expect(countByCanonicalStatus({ CREATED: 5, PENDING: 3 }, PAYMENT_SUCCESS_STATUSES)).toBe(0);
    expect(countByCanonicalStatus({ CAPTURED: 5 }, PAYMENT_REFUND_STATUSES)).toBe(0);
  });

  it("sums across mixed-case duplicates", () => {
    const counts = { CAPTURED: 2, captured: 3 };
    expect(countByCanonicalStatus(counts, PAYMENT_SUCCESS_STATUSES)).toBe(5);
  });

  it("handles an empty status map", () => {
    expect(countByCanonicalStatus({}, PAYMENT_SUCCESS_STATUSES)).toBe(0);
  });
});

describe("totalStatusCount", () => {
  it("sums every status, so success rate has the right denominator", () => {
    // Regression: with 18 CAPTURED out of 35 total the success rate is ~51%.
    const counts = { CAPTURED: 18, CREATED: 11, PENDING: 6 };
    expect(totalStatusCount(counts)).toBe(35);
    const rate = (countByCanonicalStatus(counts, PAYMENT_SUCCESS_STATUSES) / totalStatusCount(counts)) * 100;
    expect(rate).toBeCloseTo(51.4, 1);
  });
});

describe("confidence percent formatting", () => {
  it("treats confidence as an already-scaled 0-100 integer", () => {
    // The stored value is 84; it must render as 84%, never 8400%.
    expect(formatConfidencePercent(84)).toBe("84%");
    expect(toConfidencePercent(84)).toBe(84);
  });

  it("never multiplies by 100", () => {
    for (const value of [0, 1, 50, 65, 84, 100]) {
      expect(formatConfidencePercent(value)).toBe(`${value}%`);
    }
  });

  it("clamps out-of-range values instead of rendering nonsense", () => {
    expect(formatConfidencePercent(-10)).toBe("0%");
    expect(formatConfidencePercent(140)).toBe("100%");
    expect(toConfidencePercent(140)).toBe(100);
  });

  it("rounds fractional confidence", () => {
    expect(formatConfidencePercent(72.4)).toBe("72%");
    expect(formatConfidencePercent(72.6)).toBe("73%");
  });
});
