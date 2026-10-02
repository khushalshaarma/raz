import { describe, it, expect } from "vitest";
import {
  validateEmail,
  validatePassword,
  validatePrice,
  validateRole,
  validateOrderStatus,
  validatePaymentStatus,
  validateOpportunityType,
  validateOpportunityStatus,
  validateCampaignStatus,
  validateAgentType,
  validateAgentStatus,
} from "@/lib/validations";

describe("validation helpers", () => {
  describe("validateEmail", () => {
    it("accepts valid emails", () => {
      expect(validateEmail("a@b.com")).toBe(true);
      expect(validateEmail("user.name@domain.co.in")).toBe(true);
    });

    it("rejects invalid emails", () => {
      expect(validateEmail("")).toBe(false);
      expect(validateEmail("not-an-email")).toBe(false);
      expect(validateEmail("a@b")).toBe(false);
      expect(validateEmail("@b.com")).toBe(false);
    });
  });

  describe("validatePassword", () => {
    it("accepts a strong password", () => {
      const result = validatePassword("Password123");
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects short passwords", () => {
      const result = validatePassword("Pass1");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Password must be at least 8 characters");
    });

    it("rejects passwords without uppercase", () => {
      const result = validatePassword("password123");
      expect(result.valid).toBe(false);
    });

    it("rejects passwords without numbers", () => {
      const result = validatePassword("Passwordxyz");
      expect(result.valid).toBe(false);
    });
  });

  describe("validatePrice", () => {
    it("accepts positive integers", () => {
      expect(validatePrice(499900)).toBe(true);
      expect(validatePrice(1)).toBe(true);
    });

    it("rejects negative, zero, and non-integers", () => {
      expect(validatePrice(0)).toBe(false);
      expect(validatePrice(-100)).toBe(false);
      expect(validatePrice(49.99)).toBe(false);
      expect(validatePrice(NaN)).toBe(false);
    });
  });

  describe("validateRole", () => {
    it("accepts valid roles", () => {
      expect(validateRole("MERCHANT")).toBe(true);
      expect(validateRole("CUSTOMER")).toBe(true);
      expect(validateRole("ADMIN")).toBe(true);
    });

    it("rejects invalid roles", () => {
      expect(validateRole("USER")).toBe(false);
      expect(validateRole("guest")).toBe(false);
      expect(validateRole("")).toBe(false);
    });
  });

  describe("validateOrderStatus", () => {
    it("accepts valid order statuses", () => {
      ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED"].forEach((s) =>
        expect(validateOrderStatus(s)).toBe(true)
      );
    });
    it("rejects invalid order statuses", () => {
      expect(validateOrderStatus("SHIPPED")).toBe(false);
      expect(validateOrderStatus("DIRTY")).toBe(false);
    });
  });

  describe("validatePaymentStatus", () => {
    it("accepts valid payment statuses", () => {
      ["CREATED", "PENDING", "AUTHORIZED", "CAPTURED", "FAILED", "REFUNDED", "UNKNOWN"].forEach((s) =>
        expect(validatePaymentStatus(s)).toBe(true)
      );
    });
    it("rejects invalid payment statuses", () => {
      expect(validatePaymentStatus("PAID")).toBe(false);
    });
  });

  describe("validateOpportunityType", () => {
    it("accepts valid types", () => {
      ["INACTIVE_CUSTOMERS", "CART_ABANDONMENT", "UPSELL", "CROSS_SELL", "LOW_CONVERSION", "PAYMENT_RECOVERY", "HIGH_VALUE_CUSTOMER"].forEach((t) =>
        expect(validateOpportunityType(t)).toBe(true)
      );
    });
    it("rejects invalid types", () => {
      expect(validateOpportunityType("UNKNOWN")).toBe(false);
    });
  });

  describe("validateCampaignStatus", () => {
    it("accepts valid statuses", () => {
      ["DRAFT", "PENDING_APPROVAL", "APPROVED", "RUNNING", "PAUSED", "COMPLETED", "FAILED"].forEach((s) =>
        expect(validateCampaignStatus(s)).toBe(true)
      );
    });
    it("rejects invalid statuses", () => {
      expect(validateCampaignStatus("LIVE")).toBe(false);
    });
  });

  describe("validateAgentType", () => {
    it("accepts valid types", () => {
      ["OPPORTUNITY", "STRATEGY", "SIMULATION", "DECISION", "EXECUTION", "SECURITY", "RELIABILITY", "RECONCILIATION", "LEARNING"].forEach((t) =>
        expect(validateAgentType(t)).toBe(true)
      );
    });
    it("rejects invalid types", () => {
      expect(validateAgentType("CHAT")).toBe(false);
    });
  });
});
