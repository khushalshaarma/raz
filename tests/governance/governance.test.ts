import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { evaluateGovernance } from "@/lib/governance/governance";
import { ActionType } from "@/lib/governance/action";

async function cleanup() {
  await prisma.$executeRawUnsafe(`PRAGMA foreign_keys=OFF;DELETE FROM systemHealth;DELETE FROM opportunity;DELETE FROM strategyExperiment;DELETE FROM simulation;DELETE FROM decision;DELETE FROM decisionOutcome;DELETE FROM campaign;DELETE FROM agent;DELETE FROM auditEvent;DELETE FROM auditLog;DELETE FROM governanceDecision;DELETE FROM actionRequest;DELETE FROM policyRule;DELETE FROM policy;DELETE FROM customer;DELETE FROM orderItem;DELETE FROM payment;DELETE FROM "order";DELETE FROM product;DELETE FROM merchant;DELETE FROM user;PRAGMA foreign_keys=ON;`);
}

async function setupFull() {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const user = await prisma.user.create({ data: { email: `${Date.now()}-${attempt}-gov@example.com`, password: "hash", name: "Test", role: "MERCHANT" } });
      const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: `${Date.now()}-GovMerchant`, email: `${Date.now()}-${attempt}-gov@example.com` } });
      const scenario = await prisma.scenario.create({ data: { merchantId: merchant.id, opportunityType: "UPSELL", strategyId: "strat-1", scenarioType: "CONSERVATIVE", eligibleCustomers: 100, expectedConversionRate: 0.1, expectedConversions: 10, expectedRevenueMinor: 500000, expectedCostMinor: 100000, expectedNetImpactMinor: 400000, expectedROI: 4.0, confidence: 85, riskScore: 30, riskLevel: "LOW", downsideRevenueMinor: 300000, downsideCostMinor: 150000, downsideNetImpactMinor: 150000, evidence: "{}" } });
      return { merchant, scenario };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < 2) await new Promise(r => setTimeout(r, 100));
    }
  }
  throw lastError;
}

describe("governance", () => {
  beforeEach(async () => cleanup());
  afterEach(async () => cleanup());

  describe("all gates pass → GOVERNANCE APPROVED", () => {
    it("returns APPROVED when all gates pass", async () => {
      const { merchant, scenario } = await setupFull();
      const policy = await prisma.policy.create({ data: { merchantId: merchant.id, name: "Allow Policy", conditionType: "RISK_SCORE", conditionOperator: "LTE", conditionValue: 30, action: "ALLOW", priority: 100, isActive: true, version: 1 } });
      const result = await evaluateGovernance({
        actionType: "DISCOUNT", strategyId: scenario.id, amountMinor: 1000,
        currency: "INR", riskLevel: "LOW", confidence: 90, customerCount: 5, orderCount: 100, historicalSpanDays: 90, policyId: policy.id,
      }, merchant.id);
      expect(result.governanceDecision).toBe("APPROVED");
    });
  });

  describe("risk HIGH → BLOCKED", () => {
    it("returns BLOCKED when risk is HIGH", async () => {
      const { merchant, scenario } = await setupFull();
      const result = await evaluateGovernance({
        actionType: "DISCOUNT", strategyId: scenario.id, amountMinor: 1000,
        currency: "INR", riskLevel: "HIGH", confidence: 90, customerCount: 5,
      }, merchant.id);
      expect(result.governanceDecision).toBe("BLOCKED");
    });
  });

  describe("policy BLOCK → BLOCKED", () => {
    it("returns BLOCKED when policy blocks", async () => {
      const { merchant, scenario } = await setupFull();
      const policy = await prisma.policy.create({ data: { merchantId: merchant.id, name: "Block Policy", conditionType: "RISK_SCORE", conditionOperator: "GTE", conditionValue: 30, action: "BLOCK", priority: 100, isActive: true, version: 1 } });
      const result = await evaluateGovernance({
        actionType: "DISCOUNT", strategyId: scenario.id, amountMinor: 1000,
        currency: "INR", riskLevel: "MEDIUM", confidence: 90, customerCount: 5, policyId: policy.id,
      }, merchant.id);
      expect(result.governanceDecision).toBe("BLOCKED");
    });
  });

  describe("policy REQUIRE_APPROVAL → REQUIRE_APPROVAL", () => {
    it("returns REQUIRE_APPROVAL when policy requires approval", async () => {
      const user = await prisma.user.create({ data: { email: `${Date.now()}-appm@example.com`, password: "hash", name: "APPM", role: "MERCHANT" } });
      const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: `${Date.now()}-APPM`, email: `${Date.now()}-appm@example.com` } });
      const scenario = await prisma.scenario.create({ data: { merchantId: merchant.id, opportunityType: "UPSELL", strategyId: "strat-2", scenarioType: "CONSERVATIVE", eligibleCustomers: 100, expectedConversionRate: 0.1, expectedConversions: 10, expectedRevenueMinor: 500000, expectedCostMinor: 100000, expectedNetImpactMinor: 400000, expectedROI: 4.0, confidence: 85, riskScore: 30, riskLevel: "LOW", downsideRevenueMinor: 300000, downsideCostMinor: 150000, downsideNetImpactMinor: 150000, evidence: "{}" } });
      const policy = await prisma.policy.create({ data: { merchantId: merchant.id, name: "Approval Policy", conditionType: "RISK_SCORE", conditionOperator: "LTE", conditionValue: 30, action: "REQUIRE_APPROVAL", priority: 100, isActive: true, version: 1 } });
      const result = await evaluateGovernance({
        actionType: "DISCOUNT", strategyId: scenario.id, amountMinor: 1000,
        currency: "INR", riskLevel: "LOW", confidence: 80, customerCount: 5, orderCount: 100, historicalSpanDays: 90, policyId: policy.id,
      }, merchant.id);
      expect(result.governanceDecision).toBe("REQUIRE_APPROVAL");
    });
  });

  describe("automation paused → BLOCKED", () => {
    it("returns BLOCKED when automation is paused", async () => {
      const { merchant, scenario } = await setupFull();
      await prisma.policy.create({ data: { merchantId: merchant.id, name: "AUTOMATION_PAUSED", conditionType: "CUSTOM", conditionOperator: "EQ", conditionValue: 1, action: "BLOCK", priority: 0, isActive: true, version: 1 } });
      const result = await evaluateGovernance({
        actionType: "DISCOUNT", strategyId: scenario.id, amountMinor: 1000,
        currency: "INR", riskLevel: "LOW", confidence: 90, customerCount: 5,
      }, merchant.id);
      expect(result.governanceDecision).toBe("BLOCKED");
    });
  });

  describe("governance produces valid result", () => {
    it("returns structured result with all gate results", async () => {
      const { merchant, scenario } = await setupFull();
      const result = await evaluateGovernance({
        actionType: "DISCOUNT", strategyId: scenario.id, amountMinor: 1000,
        currency: "INR", riskLevel: "LOW", confidence: 90, customerCount: 5,
      }, merchant.id);
      expect(result.governanceDecision).toBeDefined();
      expect(result.actionRequestId).toBeDefined();
      expect(result.merchantId).toBe(merchant.id);
      expect(result.dataQualityGate).toBeDefined();
      expect(result.confidenceGate).toBeDefined();
      expect(result.riskGate).toBeDefined();
      expect(result.security).toBeDefined();
      expect(result.policyEngine).toBeDefined();
      expect(result.velocity).toBeDefined();
      expect(result.spend).toBeDefined();
      expect(result.customerProtection).toBeDefined();
      expect(result.approvalEngine).toBeDefined();
      expect(result.allReasonCodes).toBeDefined();
      expect(result.evaluatedAt).toBeDefined();
    });
  });
});
