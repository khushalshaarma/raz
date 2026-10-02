import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { evaluateSecurity } from "@/lib/governance/security-agent";
import { evaluatePolicy } from "@/lib/governance/policy-engine";
import { evaluateRiskGate } from "@/lib/governance/risk-gate";
import { evaluateConfidenceGate } from "@/lib/governance/confidence-gate";
import { evaluateDataQualityGate } from "@/lib/governance/data-quality-gate";
import { evaluateVelocityGate } from "@/lib/governance/velocity-gate";
import { evaluateSpendGate } from "@/lib/governance/spend-gate";
import { evaluateApproval } from "@/lib/governance/approval-engine";
import { checkAutomationState } from "@/lib/governance/kill-switch";

async function cleanup() {
  await prisma.$executeRawUnsafe(`PRAGMA foreign_keys=OFF;DELETE FROM systemHealth;DELETE FROM opportunity;DELETE FROM strategyExperiment;DELETE FROM simulation;DELETE FROM decision;DELETE FROM decisionOutcome;DELETE FROM campaign;DELETE FROM agent;DELETE FROM auditEvent;DELETE FROM auditLog;DELETE FROM governanceDecision;DELETE FROM actionRequest;DELETE FROM policyRule;DELETE FROM policy;DELETE FROM customer;DELETE FROM orderItem;DELETE FROM payment;DELETE FROM "order";DELETE FROM product;DELETE FROM merchant;DELETE FROM user;PRAGMA foreign_keys=ON;`);
}

async function setupMerchant(merchantId: string) {
  const user = await prisma.user.create({ data: { email: `${Date.now()}-${merchantId}@example.com`, password: "hash", name: merchantId, role: "MERCHANT" } });
  const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: merchantId, email: `${Date.now()}-${merchantId}@example.com` } });
  await prisma.scenario.create({ data: { merchantId: merchant.id, opportunityType: "UPSELL", strategyId: `strat-${Date.now()}-${merchantId}`, scenarioType: "CONSERVATIVE", eligibleCustomers: 100, expectedConversionRate: 0.1, expectedConversions: 10, expectedRevenueMinor: 500000, expectedCostMinor: 100000, expectedNetImpactMinor: 400000, expectedROI: 4.0, confidence: 85, riskScore: 30, riskLevel: "LOW", downsideRevenueMinor: 300000, downsideCostMinor: 150000, downsideNetImpactMinor: 150000, evidence: "{}" } });
  return merchant;
}

describe("merchant-isolation", () => {
  beforeEach(async () => cleanup());
  afterEach(async () => cleanup());

  it("A cannot access B's policies", async () => {
    const merchantA = await setupMerchant("mA");
    const merchantB = await setupMerchant("mB");
    const policyB = await prisma.policy.create({ data: { merchantId: merchantB.id, name: "B Policy", conditionType: "RISK_SCORE", conditionOperator: "GTE", conditionValue: 50, action: "BLOCK", priority: 100, isActive: true, version: 1 } });
    const result = await evaluatePolicy(policyB.id, { riskScore: 80, confidenceScore: 80, dataQualityScore: 80, velocity: 10, spendMinor: 1000 });
    expect(result.decision).toBe("BLOCK");
    const policiesA = await prisma.policy.findMany({ where: { merchantId: merchantA.id } });
    expect(policiesA.length).toBe(0);
  });

  it("A cannot access B's actions", async () => {
    const merchantA = await setupMerchant("mA2");
    const merchantB = await setupMerchant("mB2");
    const actionB = await prisma.actionRequest.create({ data: { merchantId: merchantB.id, opportunityType: "DISCOUNT", strategyId: "strat-b", strategyName: "strat-b", amountMinor: 1000, currency: "INR", status: "PENDING", recommendedScenario: "CONSERVATIVE", decisionScore: 0, riskLevel: "", confidence: 0 } });
    const actionA = await prisma.actionRequest.findFirst({ where: { id: actionB.id, merchantId: merchantA.id } });
    expect(actionA).toBeNull();
  });

  it("A cannot access B's approvals", async () => {
    const merchantA = await setupMerchant("mA3");
    const merchantB = await setupMerchant("mB3");
    const actionB = await prisma.actionRequest.create({ data: { merchantId: merchantB.id, opportunityType: "DISCOUNT", strategyId: "req-b", strategyName: "req-b", amountMinor: 1000, currency: "INR", status: "PENDING", recommendedScenario: "CONSERVATIVE", decisionScore: 0, riskLevel: "", confidence: 0 } });
    const decisionB = await prisma.governanceDecision.create({ data: { merchantId: merchantB.id, actionRequestId: actionB.id, decision: "BLOCK", decisionReason: "test", riskLevel: "HIGH", confidence: 0, status: "PENDING" } });
    const decisionA = await prisma.governanceDecision.findFirst({ where: { id: decisionB.id, merchantId: merchantA.id } });
    expect(decisionA).toBeNull();
  });

  it("A cannot access B's audit logs", async () => {
    const merchantA = await setupMerchant("mA4");
    const merchantB = await setupMerchant("mB4");
    const auditB = await prisma.auditLog.create({ data: { merchantId: merchantB.id, action: "TEST", resourceType: "TEST", resourceId: "r1", outcome: "BLOCKED", severity: "INFO" } });
    const auditA = await prisma.auditLog.findFirst({ where: { id: auditB.id, merchantId: merchantA.id } });
    expect(auditA).toBeNull();
  });

  it("security agent enforces merchant isolation", async () => {
    const merchantA = await setupMerchant("mA5");
    const merchantB = await setupMerchant("mB5");
    const result = await evaluateSecurity({
      merchantId: merchantA.id,
      actionRequestId: "req-1",
      amountMinor: 1000,
      actionType: "DISCOUNT",
      targetMerchantId: merchantB.id,
    });
    expect(result.securityLevel).toBe("BLOCKED");
    expect(result.reasonCodes).toContain("MERCHANT_ISOLATION_VIOLATION");
  });

  it("A cannot access B's spend", async () => {
    const merchantA = await setupMerchant("mA6");
    const merchantB = await setupMerchant("mB6");
    const resultA = await evaluateSpendGate({ amountMinor: 1000, currency: "INR" });
    expect(resultA.decision).toBe("PASS");
    const policiesB = await prisma.policy.findMany({ where: { merchantId: merchantB.id } });
    expect(policiesB.length).toBe(0);
  });

  it("A cannot access B's velocity", async () => {
    const merchantA = await setupMerchant("mA7");
    const merchantB = await setupMerchant("mB7");
    const resultA = await evaluateVelocityGate({ currentCount: 5, period: "day" });
    expect(resultA.decision).toBe("PASS");
  });

  it("kill switch is merchant-specific", async () => {
    const merchantA = await setupMerchant("mA8");
    const merchantB = await setupMerchant("mB8");
    const stateA = await checkAutomationState(merchantA.id);
    const stateB = await checkAutomationState(merchantB.id);
    expect(stateA.state).toBe("ACTIVE");
    expect(stateB.state).toBe("ACTIVE");
    expect(stateA.isAutomationAllowed).toBe(true);
    expect(stateB.isAutomationAllowed).toBe(true);
  });
});
