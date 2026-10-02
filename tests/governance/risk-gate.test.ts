import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { evaluateRiskGate } from "@/lib/governance/risk-gate";

async function cleanup() {
  await prisma.$executeRawUnsafe(`PRAGMA foreign_keys=OFF;DELETE FROM systemHealth;DELETE FROM opportunity;DELETE FROM strategyExperiment;DELETE FROM simulation;DELETE FROM decision;DELETE FROM decisionOutcome;DELETE FROM campaign;DELETE FROM agent;DELETE FROM auditEvent;DELETE FROM auditLog;DELETE FROM governanceDecision;DELETE FROM actionRequest;DELETE FROM policyRule;DELETE FROM policy;DELETE FROM customer;DELETE FROM orderItem;DELETE FROM payment;DELETE FROM "order";DELETE FROM product;DELETE FROM merchant;DELETE FROM user;PRAGMA foreign_keys=ON;`);
}

describe("risk-gate", () => {
  beforeEach(async () => cleanup());
  afterEach(async () => cleanup());

  describe("LOW risk", () => {
    it("returns PASS for LOW risk (score < 40)", async () => {
      const result = await evaluateRiskGate({ riskScore: 20 });
      expect(result.decision).toBe("PASS");
      expect(result.riskLevel).toBe("LOW");
    });
  });

  describe("MEDIUM risk", () => {
    it("returns REQUIRE_APPROVAL for MEDIUM risk (40 <= score < 70)", async () => {
      const result = await evaluateRiskGate({ riskScore: 50 });
      expect(result.decision).toBe("REQUIRE_APPROVAL");
      expect(result.riskLevel).toBe("MEDIUM");
    });
  });

  describe("HIGH risk", () => {
    it("returns BLOCK for HIGH risk (score >= 70)", async () => {
      const result = await evaluateRiskGate({ riskScore: 80 });
      expect(result.decision).toBe("BLOCK");
      expect(result.riskLevel).toBe("HIGH");
    });
  });

  describe("missing risk", () => {
    it("handles threshold override", async () => {
      const result = await evaluateRiskGate({ riskScore: 65, overrideRiskThresholdLow: 60, overrideRiskThresholdHigh: 80 });
      expect(result.decision).toBe("REQUIRE_APPROVAL");
    });
    it("returns BLOCK when risk score is above custom threshold", async () => {
      const result = await evaluateRiskGate({ riskScore: 85, overrideRiskThresholdHigh: 80 });
      expect(result.decision).toBe("BLOCK");
    });
  });

  describe("invalid risk", () => {
    it("handles boundary values correctly", async () => {
      const result = await evaluateRiskGate({ riskScore: 0 });
      expect(result.decision).toBe("PASS");
      const result2 = await evaluateRiskGate({ riskScore: 100 });
      expect(result2.decision).toBe("BLOCK");
    });
  });

  describe("policy override", () => {
    it("uses policy threshold when policyId provided", async () => {
      const user = await prisma.user.create({ data: { email: `${Date.now()}-policy@example.com`, password: "hash", name: "P", role: "MERCHANT" } });
      const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: `${Date.now()}-P`, email: `${Date.now()}-policy@example.com` } });
      const policy = await prisma.policy.create({ data: { merchantId: merchant.id, name: "Risk Policy", conditionType: "RISK_SCORE", conditionOperator: "GTE", conditionValue: 60, action: "BLOCK", priority: 100, isActive: true, version: 1 } });
      const result = await evaluateRiskGate({ riskScore: 65, policyId: policy.id });
      expect(result.decision).toBe("BLOCK");
    });
  });
});
