import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { evaluateDataQualityGate } from "@/lib/governance/data-quality-gate";

async function cleanup() {
  await prisma.$executeRawUnsafe(`PRAGMA foreign_keys=OFF;DELETE FROM systemHealth;DELETE FROM opportunity;DELETE FROM strategyExperiment;DELETE FROM simulation;DELETE FROM decision;DELETE FROM decisionOutcome;DELETE FROM campaign;DELETE FROM agent;DELETE FROM auditEvent;DELETE FROM auditLog;DELETE FROM governanceDecision;DELETE FROM actionRequest;DELETE FROM policyRule;DELETE FROM policy;DELETE FROM customer;DELETE FROM orderItem;DELETE FROM payment;DELETE FROM "order";DELETE FROM product;DELETE FROM merchant;DELETE FROM user;PRAGMA foreign_keys=ON;`);
}

describe("data-quality-gate", () => {
  beforeEach(async () => cleanup());
  afterEach(async () => cleanup());

  describe("sufficient data (>= 30)", () => {
    it("returns PASS for data quality score >= 30", async () => {
      const result = await evaluateDataQualityGate({
        customerCount: 100, orderCount: 500, historicalSpanDays: 365,
      });
      expect(result.decision).toBe("PASS");
    });
  });

  describe("insufficient data (< 30)", () => {
    it("returns BLOCK for data quality score < 30", async () => {
      const result = await evaluateDataQualityGate({
        customerCount: 1, orderCount: 0, historicalSpanDays: 0,
      });
      expect(result.decision).toBe("BLOCK");
      expect(result.reasonCode).toBe("DATA_INSUFFICIENT");
    });
  });

  describe("missing data", () => {
    it("returns BLOCK when all fields are zero", async () => {
      const result = await evaluateDataQualityGate({
        customerCount: 0, orderCount: 0, historicalSpanDays: 0,
      });
      expect(result.decision).toBe("BLOCK");
      expect(result.insufficient).toBe(true);
    });
  });

  describe("invalid data", () => {
    it("returns BLOCK for negative values treated as 0", async () => {
      const result = await evaluateDataQualityGate({
        customerCount: -5, orderCount: -5, historicalSpanDays: -10,
      });
      expect(result.decision).toBe("BLOCK");
    });
  });

  describe("policy override", () => {
    it("uses policy threshold when policyId provided", async () => {
      const user = await prisma.user.create({ data: { email: `${Date.now()}-dqpolicy@example.com`, password: "hash", name: "DQ", role: "MERCHANT" } });
      const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: `${Date.now()}-DQ`, email: `${Date.now()}-dqpolicy@example.com` } });
      const policy = await prisma.policy.create({ data: { merchantId: merchant.id, name: "DQ Policy", conditionType: "DATA_QUALITY", conditionOperator: "GTE", conditionValue: 30, action: "BLOCK", priority: 100, isActive: true, version: 1 } });
      const result = await evaluateDataQualityGate({
        customerCount: 100, orderCount: 500, historicalSpanDays: 365, policyId: policy.id,
      });
      expect(result.decision).toBe("PASS");
    });
  });
});
