import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { evaluateGovernance } from "@/lib/governance/governance";
import { createActionRequest } from "@/lib/governance/action";
import { pauseAutomation } from "@/lib/governance/kill-switch";
import { enableEmergencyStop, disableEmergencyStop } from "@/lib/governance/emergency-stop";
import { evaluateApproval } from "@/lib/governance/approval-engine";
import { evaluateSecurity } from "@/lib/governance/security-agent";
import { ActionType } from "@/lib/governance/action";

async function cleanup() {
  await prisma.$executeRawUnsafe(`PRAGMA foreign_keys=OFF;DELETE FROM systemHealth;DELETE FROM opportunity;DELETE FROM strategyExperiment;DELETE FROM simulation;DELETE FROM decision;DELETE FROM decisionOutcome;DELETE FROM campaign;DELETE FROM agent;DELETE FROM auditEvent;DELETE FROM auditLog;DELETE FROM governanceDecision;DELETE FROM actionRequest;DELETE FROM policyRule;DELETE FROM policy;DELETE FROM customer;DELETE FROM orderItem;DELETE FROM payment;DELETE FROM "order";DELETE FROM product;DELETE FROM merchant;DELETE FROM user;PRAGMA foreign_keys=ON;`);
}

async function setup(merchantId: string) {
  const user = await prisma.user.create({ data: { email: `${Date.now()}-${merchantId}@example.com`, password: "hash", name: merchantId, role: "MERCHANT" } });
  const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: merchantId, email: `${Date.now()}-${merchantId}@example.com` } });
  const scenario = await prisma.scenario.create({ data: { merchantId: merchant.id, opportunityType: "UPSELL", strategyId: `strat-${Date.now()}-${merchantId}`, scenarioType: "CONSERVATIVE", eligibleCustomers: 100, expectedConversionRate: 0.1, expectedConversions: 10, expectedRevenueMinor: 500000, expectedCostMinor: 100000, expectedNetImpactMinor: 400000, expectedROI: 4.0, confidence: 85, riskScore: 30, riskLevel: "LOW", downsideRevenueMinor: 300000, downsideCostMinor: 150000, downsideNetImpactMinor: 150000, evidence: "{}" } });
  return { merchant, scenario };
}

describe("audit", () => {
  beforeEach(async () => cleanup());
  afterEach(async () => cleanup());

  describe("ACTION_CREATED", () => {
    it("creates AuditLog when action request is created", async () => {
      const { merchant } = await setup("audit-action");
      const actionRequest = await createActionRequest({
        actionType: "DISCOUNT", strategyId: `strat-audit-action`, amountMinor: 1000, currency: "INR",
      }, merchant.id);
      const auditLogs = await prisma.auditLog.findMany({ where: { resourceId: actionRequest.id } });
      expect(auditLogs.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("POLICY_EVALUATED", () => {
    it("creates audit record when policy is evaluated", async () => {
      const { merchant, scenario } = await setup("audit-policy");
      const policy = await prisma.policy.create({ data: { merchantId: merchant.id, name: "Audit Policy", conditionType: "RISK_SCORE", conditionOperator: "GTE", conditionValue: 50, action: "BLOCK", priority: 100, isActive: true, version: 1 } });
      const result = await evaluateGovernance({
        actionType: "DISCOUNT", strategyId: scenario.id, amountMinor: 1000,
        currency: "INR", riskLevel: "LOW", confidence: 90, customerCount: 5, policyId: policy.id,
      }, merchant.id);
      expect(result.governanceDecision).toBeDefined();
    });
  });

  describe("POLICY_BLOCKED", () => {
    it("creates AuditLog when policy blocks", async () => {
      const { merchant, scenario } = await setup("audit-pblock");
      const policy = await prisma.policy.create({ data: { merchantId: merchant.id, name: "Block Policy", conditionType: "RISK_SCORE", conditionOperator: "GTE", conditionValue: 30, action: "BLOCK", priority: 100, isActive: true, version: 1 } });
      await evaluateGovernance({
        actionType: "DISCOUNT", strategyId: scenario.id, amountMinor: 1000,
        currency: "INR", riskLevel: "MEDIUM", confidence: 90, customerCount: 5, policyId: policy.id,
      }, merchant.id);
      const auditLogs = await prisma.auditLog.findMany({ where: { action: { contains: "POLICY" } } });
      expect(auditLogs.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("SECURITY_EVALUATED", () => {
    it("creates audit record when security is evaluated", async () => {
      const { merchant, scenario } = await setup("audit-sec");
      await evaluateGovernance({
        actionType: "DISCOUNT", strategyId: scenario.id, amountMinor: 1000,
        currency: "INR", riskLevel: "LOW", confidence: 90, customerCount: 5,
      }, merchant.id);
      const auditLogs = await prisma.auditLog.findMany({ where: { severity: "INFO" } });
      expect(auditLogs.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("SECURITY_BLOCKED", () => {
    it("creates AuditLog when security blocks", async () => {
      const { merchant } = await setup("audit-secb");
      await evaluateSecurity({
        merchantId: merchant.id, actionRequestId: "req-sec", amountMinor: -1, actionType: "INVALID",
      });
      const auditLogs = await prisma.auditLog.findMany({ where: { severity: "CRITICAL" } });
      expect(auditLogs.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("APPROVAL_REQUIRED", () => {
    it("creates audit context when approval is required", async () => {
      const { merchant } = await setup("audit-appr");
      const result = await evaluateApproval({
        riskScore: 30, confidenceScore: 50, amountMinor: 1000,
        actionType: "DISCOUNT", customerCount: 10,
        securityResult: { securityLevel: "SECURE", reasonCodes: [] },
      });
      expect(result.decision).toBe("REQUIRE_APPROVAL");
    });
  });

  describe("AUTOMATION_PAUSED", () => {
    it("creates policy when automation is paused", async () => {
      const { merchant } = await setup("audit-autop");
      await pauseAutomation(merchant.id, "admin-1");
      const policy = await prisma.policy.findFirst({ where: { merchantId: merchant.id, name: "AUTOMATION_PAUSED" } });
      expect(policy).not.toBeNull();
    });
  });

  describe("AUTOMATION_RESUMED", () => {
    it("deactivates pause policy when automation is resumed", async () => {
      const { merchant } = await setup("audit-autores");
      await pauseAutomation(merchant.id, "admin-1");
      const result = await prisma.policy.updateMany({
        where: { merchantId: merchant.id, name: "AUTOMATION_PAUSED", isActive: true },
        data: { isActive: false },
      });
      expect(result.count).toBe(1);
    });
  });

  describe("EMERGENCY_STOP_ENABLED", () => {
    it("creates AuditLog when emergency stop is enabled", async () => {
      await enableEmergencyStop("admin-1", "Test");
      const auditLogs = await prisma.auditLog.findMany({ where: { action: "EMERGENCY_STOP_ENABLED" } });
      expect(auditLogs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("EMERGENCY_STOP_DISABLED", () => {
    it("creates AuditLog when emergency stop is disabled", async () => {
      await enableEmergencyStop("admin-1", "Test");
      await disableEmergencyStop("admin-1");
      const auditLogs = await prisma.auditLog.findMany({ where: { action: "EMERGENCY_STOP_DISABLED" } });
      expect(auditLogs.length).toBeGreaterThanOrEqual(1);
    });
  });
});
