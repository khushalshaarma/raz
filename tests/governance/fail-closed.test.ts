import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { evaluateGovernance } from "@/lib/governance/governance";
import { evaluatePolicy } from "@/lib/governance/policy-engine";
import { evaluateRiskGate } from "@/lib/governance/risk-gate";
import { evaluateConfidenceGate } from "@/lib/governance/confidence-gate";
import { evaluateDataQualityGate } from "@/lib/governance/data-quality-gate";
import { evaluateSecurity } from "@/lib/governance/security-agent";
import { evaluateApproval } from "@/lib/governance/approval-engine";
import { evaluateVelocityGate } from "@/lib/governance/velocity-gate";
import { evaluateSpendGate } from "@/lib/governance/spend-gate";
import { checkAutomationState } from "@/lib/governance/kill-switch";
import { ActionType } from "@/lib/governance/action";

async function cleanup() {
  await prisma.$executeRawUnsafe(`PRAGMA foreign_keys=OFF;DELETE FROM systemHealth;DELETE FROM opportunity;DELETE FROM strategyExperiment;DELETE FROM simulation;DELETE FROM decision;DELETE FROM decisionOutcome;DELETE FROM campaign;DELETE FROM agent;DELETE FROM auditEvent;DELETE FROM auditLog;DELETE FROM governanceDecision;DELETE FROM actionRequest;DELETE FROM policyRule;DELETE FROM policy;DELETE FROM customer;DELETE FROM orderItem;DELETE FROM payment;DELETE FROM "order";DELETE FROM product;DELETE FROM merchant;DELETE FROM user;PRAGMA foreign_keys=ON;`);
}

async function setupMerchant(merchantId: string) {
  const ts = Date.now();
  const user = await prisma.user.create({ data: { email: `${merchantId}-${ts}@example.com`, password: "hash", name: merchantId, role: "MERCHANT" } });
  const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: merchantId, email: `${merchantId}-${ts}@example.com` } });
  return merchant;
}

describe("fail-closed", () => {
  beforeEach(async () => cleanup());
  afterEach(async () => cleanup());

  describe("policy failure", () => {
    it("policy failure MUST NOT APPROVE", async () => {
      const merchant = await setupMerchant("fc1");
      const result = await evaluateGovernance({
        actionType: "DISCOUNT", strategyId: "strat-fc", amountMinor: 1000,
        currency: "INR", riskLevel: "LOW", confidence: 90, customerCount: 5, policyId: "non-existent-policy",
      }, merchant.id);
      expect(result.governanceDecision).toBe("BLOCKED");
    });
  });

  describe("risk failure", () => {
    it("risk failure MUST NOT APPROVE", async () => {
      const result = await evaluateRiskGate({ riskScore: 100 });
      expect(result.decision).toBe("BLOCK");
    });
  });

  describe("confidence failure", () => {
    it("confidence failure MUST NOT APPROVE", async () => {
      const result = await evaluateConfidenceGate({ confidenceScore: 10 });
      expect(result.decision).toBe("BLOCK");
    });
  });

  describe("security failure", () => {
    it("security failure MUST NEVER result in approval", async () => {
      const merchant = await setupMerchant("fc-sec");
      const result = await evaluateSecurity({
        merchantId: merchant.id, actionRequestId: "req-1", amountMinor: -1, actionType: "INVALID",
        targetMerchantId: "other-merchant-id",
      });
      expect(result.securityLevel).toBe("BLOCKED");
    });
  });

  describe("approval failure", () => {
    it("approval failure MUST NOT APPROVE", async () => {
      const result = await evaluateApproval({
        riskScore: 80, confidenceScore: 80, amountMinor: 1000,
        actionType: "DISCOUNT", customerCount: 5,
        securityResult: { securityLevel: "SECURE", reasonCodes: [] },
      });
      expect(result.decision).toBe("BLOCKED");
    });
  });

  describe("data quality failure", () => {
    it("data quality failure MUST NOT APPROVE", async () => {
      const result = await evaluateDataQualityGate({ customerCount: 0, orderCount: 0, historicalSpanDays: 0 });
      expect(result.decision).toBe("BLOCK");
    });
  });

  describe("every critical governance failure MUST NOT APPROVE", () => {
    it("no critical failure results in APPROVED", async () => {
      const merchant = await setupMerchant("fc-every");
      const result = await evaluateGovernance({
        actionType: "DISCOUNT", strategyId: "strat-fcevery", amountMinor: 1000,
        currency: "INR", riskLevel: "HIGH", confidence: 10, customerCount: 150,
      }, merchant.id);
      expect(result.governanceDecision).toBe("BLOCKED");
    });
  });

  describe("fail-closed is deterministic", () => {
    it("same input always produces BLOCKED for critical failures", async () => {
      const result1 = await evaluateRiskGate({ riskScore: 100 });
      const result2 = await evaluateRiskGate({ riskScore: 100 });
      expect(result1.decision).toBe(result2.decision);
      expect(result1.decision).toBe("BLOCK");
    });
  });
});
