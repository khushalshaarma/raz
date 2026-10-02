import { describe, it, expect } from "vitest";
import { validateMoneyAmount, isValidCurrency, formatMoneyMinor } from "@/lib/security/money";

describe("money", () => {
  describe("validateMoneyAmount", () => {
    it("validates positive integer amounts", () => {
      expect(validateMoneyAmount(100).valid).toBe(true);
      expect(validateMoneyAmount(1).valid).toBe(true);
    });

    it("rejects non-numbers", () => {
      expect(validateMoneyAmount("100").valid).toBe(false);
      expect(validateMoneyAmount(null).valid).toBe(false);
    });

    it("rejects zero", () => {
      expect(validateMoneyAmount(0).valid).toBe(false);
    });

    it("rejects negative", () => {
      expect(validateMoneyAmount(-100).valid).toBe(false);
    });

    it("rejects non-integers", () => {
      expect(validateMoneyAmount(100.5).valid).toBe(false);
    });

    it("rejects NaN", () => {
      expect(validateMoneyAmount(NaN).valid).toBe(false);
    });

    it("rejects Infinity", () => {
      expect(validateMoneyAmount(Infinity).valid).toBe(false);
    });

    it("rejects amounts exceeding max", () => {
      expect(validateMoneyAmount(9999999999).valid).toBe(false);
    });
  });

  describe("isValidCurrency", () => {
    it("validates INR", () => {
      expect(isValidCurrency("INR")).toBe(true);
    });

    it("validates USD", () => {
      expect(isValidCurrency("USD")).toBe(true);
    });

    it("rejects invalid", () => {
      expect(isValidCurrency("XYZ")).toBe(false);
    });
  });

  describe("formatMoneyMinor", () => {
    it("formats INR amounts", () => {
      const formatted = formatMoneyMinor(10000, "INR");
      expect(formatted).toContain("₹");
      expect(formatted).toContain("100.00");
    });

    it("formats USD amounts", () => {
      const formatted = formatMoneyMinor(5000, "USD");
      expect(formatted).toContain("$");
    });
  });
});
