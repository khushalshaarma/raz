import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { evaluateSpendGate } from "@/lib/governance/spend-gate";

async function cleanup() {
  await prisma.$executeRawUnsafe(`PRAGMA foreign_keys=OFF;DELETE FROM systemHealth;DELETE FROM opportunity;DELETE FROM strategyExperiment;DELETE FROM simulation;DELETE FROM decision;DELETE FROM decisionOutcome;DELETE FROM campaign;DELETE FROM agent;DELETE FROM auditEvent;DELETE FROM auditLog;DELETE FROM governanceDecision;DELETE FROM actionRequest;DELETE FROM policyRule;DELETE FROM policy;DELETE FROM customer;DELETE FROM orderItem;DELETE FROM payment;DELETE FROM "order";DELETE FROM product;DELETE FROM merchant;DELETE FROM user;PRAGMA foreign_keys=ON;`);
}

describe("spend-gate", () => {
  beforeEach(async () => cleanup());
  afterEach(async () => cleanup());

  describe("below limit", () => {
    it("returns PASS when amount is below action limit", async () => {
      const result = await evaluateSpendGate({ amountMinor: 1000, currency: "INR" });
      expect(result.decision).toBe("PASS");
    });
  });

  describe("exact limit", () => {
    it("returns BLOCK when amount equals action limit (50000)", async () => {
      const result = await evaluateSpendGate({ amountMinor: 50000, currency: "INR" });
      expect(result.decision).toBe("BLOCK");
      expect(result.reasonCode).toBe("SPEND_ACTION_LIMIT_EXCEEDED");
    });
  });

  describe("above limit", () => {
    it("returns BLOCK when amount exceeds action limit", async () => {
      const result = await evaluateSpendGate({ amountMinor: 60000, currency: "INR" });
      expect(result.decision).toBe("BLOCK");
    });
  });

  describe("daily spend", () => {
    it("returns BLOCK when daily total exceeds limit", async () => {
      const result = await evaluateSpendGate({ amountMinor: 1000, dailyTotalMinor: 1000000, currency: "INR" });
      expect(result.decision).toBe("BLOCK");
      expect(result.reasonCode).toBe("SPEND_DAILY_LIMIT_EXCEEDED");
    });
    it("returns REQUIRE_APPROVAL when daily total approaches limit", async () => {
      const result = await evaluateSpendGate({ amountMinor: 1000, dailyTotalMinor: 799000, currency: "INR" });
      expect(result.decision).toBe("REQUIRE_APPROVAL");
    });
  });

  describe("monthly spend", () => {
    it("returns BLOCK when monthly total exceeds limit", async () => {
      const result = await evaluateSpendGate({ amountMinor: 1000, monthlyTotalMinor: 10000000, currency: "INR" });
      expect(result.decision).toBe("BLOCK");
    });
  });

  describe("negative values", () => {
    it("throws error for negative amountMinor", async () => {
      await expect(evaluateSpendGate({ amountMinor: -1, currency: "INR" })).rejects.toThrow();
    });
  });

  describe("very large values", () => {
    it("handles very large integer values", async () => {
      const result = await evaluateSpendGate({ amountMinor: 99999999, currency: "INR" });
      expect(result.decision).toBe("BLOCK");
    });
  });

  describe("integer minor-unit arithmetic", () => {
    it("uses integer paise arithmetic, no floating point", async () => {
      const result = await evaluateSpendGate({ amountMinor: 5000, dailyTotalMinor: 0, monthlyTotalMinor: 0, currency: "INR" });
      expect(Number.isInteger(result.currentAmountMinor)).toBe(true);
      expect(Number.isInteger(result.limitMinor)).toBe(true);
    });
    it("no floating point in amount", async () => {
      const result = await evaluateSpendGate({ amountMinor: 4999, currency: "INR" });
      expect(result.currentAmountMinor % 1).toBe(0);
    });
  });

  describe("non-INR currency", () => {
    it("throws error for non-INR currency", async () => {
      await expect(evaluateSpendGate({ amountMinor: 1000, currency: "USD" })).rejects.toThrow();
    });
  });
});
