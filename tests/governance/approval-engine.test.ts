import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { evaluateApproval } from "@/lib/governance/approval-engine";

async function cleanup() {
  await prisma.$executeRawUnsafe(`PRAGMA foreign_keys=OFF;DELETE FROM systemHealth;DELETE FROM opportunity;DELETE FROM strategyExperiment;DELETE FROM simulation;DELETE FROM decision;DELETE FROM decisionOutcome;DELETE FROM campaign;DELETE FROM agent;DELETE FROM auditEvent;DELETE FROM auditLog;DELETE FROM governanceDecision;DELETE FROM actionRequest;DELETE FROM policyRule;DELETE FROM policy;DELETE FROM customer;DELETE FROM orderItem;DELETE FROM payment;DELETE FROM "order";DELETE FROM product;DELETE FROM merchant;DELETE FROM user;PRAGMA foreign_keys=ON;`);
}

describe("approval-engine", () => {
  beforeEach(async () => cleanup());
  afterEach(async () => cleanup());

  describe("no approval required", () => {
    it("returns NO_APPROVAL_REQUIRED when all conditions are low risk", async () => {
      const result = await evaluateApproval({
        riskScore: 30, confidenceScore: 80, amountMinor: 1000,
        actionType: "DISCOUNT", customerCount: 5,
        securityResult: { securityLevel: "SECURE", reasonCodes: [] },
      });
      expect(result.decision).toBe("NO_APPROVAL_REQUIRED");
    });
  });

  describe("merchant approval", () => {
    it("returns MERCHANT_APPROVAL_REQUIRED for large amount", async () => {
      const result = await evaluateApproval({
        riskScore: 30, confidenceScore: 80, amountMinor: 600000,
        actionType: "DISCOUNT", customerCount: 5,
        securityResult: { securityLevel: "SECURE", reasonCodes: [] },
        merchantAutoApproval: false,
      });
      expect(result.decision).toBe("MERCHANT_APPROVAL_REQUIRED");
    });
    it("returns MERCHANT_APPROVAL_REQUIRED for moderate customer base", async () => {
      const result = await evaluateApproval({
        riskScore: 30, confidenceScore: 80, amountMinor: 1000,
        actionType: "DISCOUNT", customerCount: 50,
        securityResult: { securityLevel: "SECURE", reasonCodes: [] },
      });
      expect(result.decision).toBe("MERCHANT_APPROVAL_REQUIRED");
    });
  });

  describe("admin approval", () => {
    it("returns ADMIN_APPROVAL_REQUIRED for large customer base", async () => {
      const result = await evaluateApproval({
        riskScore: 30, confidenceScore: 80, amountMinor: 1000,
        actionType: "DISCOUNT", customerCount: 150,
        securityResult: { securityLevel: "SECURE", reasonCodes: [] },
      });
      expect(result.decision).toBe("ADMIN_APPROVAL_REQUIRED");
    });
  });

  describe("dual approval", () => {
    it("returns DUAL_APPROVAL_REQUIRED for very large amount", async () => {
      const result = await evaluateApproval({
        riskScore: 30, confidenceScore: 80, amountMinor: 3000000,
        actionType: "DISCOUNT", customerCount: 5,
        securityResult: { securityLevel: "SECURE", reasonCodes: [] },
      });
      expect(result.decision).toBe("DUAL_APPROVAL_REQUIRED");
    });
  });

  describe("security blocked", () => {
    it("BLOCKED when security is BLOCKED", async () => {
      const result = await evaluateApproval({
        riskScore: 30, confidenceScore: 80, amountMinor: 1000,
        actionType: "DISCOUNT", customerCount: 5,
        securityResult: { securityLevel: "BLOCKED", reasonCodes: ["MERCHANT_ISOLATION_VIOLATION"] },
      });
      expect(result.decision).toBe("BLOCKED");
      expect(result.reasonCode).toBe("SECURITY_BLOCKED");
    });
  });

  describe("risk too high", () => {
    it("BLOCKED when risk is too high for approval", async () => {
      const result = await evaluateApproval({
        riskScore: 80, confidenceScore: 80, amountMinor: 1000,
        actionType: "DISCOUNT", customerCount: 5,
        securityResult: { securityLevel: "SECURE", reasonCodes: [] },
      });
      expect(result.decision).toBe("BLOCKED");
    });
  });

  describe("low confidence", () => {
    it("returns REQUIRE_APPROVAL when confidence is too low", async () => {
      const result = await evaluateApproval({
        riskScore: 30, confidenceScore: 50, amountMinor: 1000,
        actionType: "DISCOUNT", customerCount: 5,
        securityResult: { securityLevel: "SECURE", reasonCodes: [] },
      });
      expect(result.decision).toBe("REQUIRE_APPROVAL");
      expect(result.requiresFourEyes).toBe(true);
    });
  });

  describe("large customer base", () => {
    it("returns ADMIN_APPROVAL_REQUIRED for 100+ customers", async () => {
      const result = await evaluateApproval({
        riskScore: 30, confidenceScore: 80, amountMinor: 1000,
        actionType: "DISCOUNT", customerCount: 100,
        securityResult: { securityLevel: "SECURE", reasonCodes: [] },
      });
      expect(result.decision).toBe("ADMIN_APPROVAL_REQUIRED");
    });
    it("returns MERCHANT_APPROVAL_REQUIRED for 20-99 customers", async () => {
      const result = await evaluateApproval({
        riskScore: 30, confidenceScore: 80, amountMinor: 1000,
        actionType: "DISCOUNT", customerCount: 20,
        securityResult: { securityLevel: "SECURE", reasonCodes: [] },
      });
      expect(result.decision).toBe("MERCHANT_APPROVAL_REQUIRED");
    });
  });

  describe("four-eyes", () => {
    it("large amount requires four eyes", async () => {
      const result = await evaluateApproval({
        riskScore: 30, confidenceScore: 80, amountMinor: 600000,
        actionType: "DISCOUNT", customerCount: 5,
        securityResult: { securityLevel: "SECURE", reasonCodes: [] },
      });
      expect(result.requiresFourEyes).toBe(true);
      expect(result.decision).toBe("MERCHANT_APPROVAL_REQUIRED");
    });
    it("admin approval requires four eyes", async () => {
      const result = await evaluateApproval({
        riskScore: 30, confidenceScore: 80, amountMinor: 1000,
        actionType: "DISCOUNT", customerCount: 150,
        securityResult: { securityLevel: "SECURE", reasonCodes: [] },
      });
      expect(result.requiresFourEyes).toBe(true);
    });
  });
});
