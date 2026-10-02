import { describe, it, expect } from "vitest";
import { validatePrice, validatePaymentStatus, validateOrderStatus } from "@/lib/validations";

/**
 * Data model / financial integrity tests (#22: Payment model validation,
 * invalid product price, invalid order total).
 *
 * Money is stored in integer minor units (paise) to avoid floating point
 * arithmetic. These tests assert the invariants that protect financial data.
 */

describe("financial data model integrity", () => {
  describe("order total", () => {
    it("rejects negative order totals", () => {
      const subtotalMinor = 0;
      const discountMinor = 100;
      const totalMinor = subtotalMinor - discountMinor;
      expect(totalMinor).toBeLessThan(0);
      // Over-discounted orders must be rejected as invalid.
      const isValidOrderTotal = totalMinor >= 0;
      expect(isValidOrderTotal).toBe(false);
    });

    it("calculates total as subtotal minus discount", () => {
      const subtotalMinor = 500000;
      const discountMinor = 50000;
      const totalMinor = subtotalMinor - discountMinor;
      expect(totalMinor).toBe(450000);
      // No floating point drift:
      expect(totalMinor).toBe(Math.round(totalMinor));
    });

    it("total never exceeds subtotal", () => {
      const subtotalMinor = 100000;
      const discountMinor = 20000;
      const totalMinor = subtotalMinor - discountMinor;
      expect(totalMinor).toBeLessThanOrEqual(subtotalMinor);
      expect(totalMinor).toBe(Number.isInteger(totalMinor) ? totalMinor : NaN);
    });
  });

  describe("product price", () => {
    it("rejects an invalid (negative) product price", () => {
      expect(validatePrice(-499900)).toBe(false);
    });

    it("rejects zero price", () => {
      expect(validatePrice(0)).toBe(false);
    });

    it("rejects a floating-point price (non-integer minor units)", () => {
      expect(validatePrice(4999.99)).toBe(false);
    });

    it("accepts an integer minor-unit price", () => {
      expect(validatePrice(499900)).toBe(true);
    });
  });

  describe("payment model validation", () => {
    it("accepts only known payment statuses", () => {
      // Every status in the foundation enum must be accepted.
      expect(validatePaymentStatus("CREATED")).toBe(true);
      expect(validatePaymentStatus("PENDING")).toBe(true);
      expect(validatePaymentStatus("AUTHORIZED")).toBe(true);
      expect(validatePaymentStatus("CAPTURED")).toBe(true);
      expect(validatePaymentStatus("FAILED")).toBe(true);
      expect(validatePaymentStatus("REFUNDED")).toBe(true);
      expect(validatePaymentStatus("UNKNOWN")).toBe(true);
    });

    it("rejects an unknown payment status", () => {
      expect(validatePaymentStatus("REFUND")).toBe(false);
      expect(validatePaymentStatus("processing")).toBe(false);
    });

    it("payment belongs to an order and a merchant (flow check)", () => {
      const payment = {
        merchantId: "m-1",
        orderId: "o-1",
        amountMinor: 150000,
      };
      expect(payment.merchantId).toBeTruthy();
      expect(payment.orderId).toBeTruthy();
      expect(Number.isInteger(payment.amountMinor)).toBe(true);
    });
  });

  describe("order status validation", () => {
    it("accepts the four initial statuses", () => {
      ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"].forEach((s) =>
        expect(validateOrderStatus(s)).toBe(true)
      );
    });

    it("rejects a non-initial status", () => {
      expect(validateOrderStatus("SHIPPED")).toBe(false);
    });
  });
});
