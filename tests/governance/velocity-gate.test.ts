import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { evaluateVelocityGate } from "@/lib/governance/velocity-gate";

async function cleanup() {
  await prisma.$executeRawUnsafe(`PRAGMA foreign_keys=OFF;DELETE FROM systemHealth;DELETE FROM opportunity;DELETE FROM strategyExperiment;DELETE FROM simulation;DELETE FROM decision;DELETE FROM decisionOutcome;DELETE FROM campaign;DELETE FROM agent;DELETE FROM auditEvent;DELETE FROM auditLog;DELETE FROM governanceDecision;DELETE FROM actionRequest;DELETE FROM policyRule;DELETE FROM policy;DELETE FROM customer;DELETE FROM orderItem;DELETE FROM payment;DELETE FROM "order";DELETE FROM product;DELETE FROM merchant;DELETE FROM user;PRAGMA foreign_keys=ON;`);
}

describe("velocity-gate", () => {
  beforeEach(async () => cleanup());
  afterEach(async () => cleanup());

  describe("below limit", () => {
    it("returns PASS when count is below limit", async () => {
      const result = await evaluateVelocityGate({ currentCount: 50, period: "day" });
      expect(result.decision).toBe("PASS");
    });
  });

  describe("exact limit", () => {
    it("returns BLOCK when count equals limit", async () => {
      const result = await evaluateVelocityGate({ currentCount: 100, period: "day" });
      expect(result.decision).toBe("BLOCK");
    });
    it("returns BLOCK when count equals hour limit", async () => {
      const result = await evaluateVelocityGate({ currentCount: 20, period: "hour" });
      expect(result.decision).toBe("BLOCK");
    });
  });

  describe("above limit", () => {
    it("returns BLOCK when count exceeds limit", async () => {
      const result = await evaluateVelocityGate({ currentCount: 150, period: "day" });
      expect(result.decision).toBe("BLOCK");
    });
    it("returns REQUIRE_APPROVAL when count >= 80% of limit", async () => {
      const result = await evaluateVelocityGate({ currentCount: 80, period: "day" });
      expect(result.decision).toBe("REQUIRE_APPROVAL");
    });
  });

  describe("policy override", () => {
    it("uses policy threshold when policyId provided", async () => {
      const user = await prisma.user.create({ data: { email: `${Date.now()}-velpolicy@example.com`, password: "hash", name: "VP", role: "MERCHANT" } });
      const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: `${Date.now()}-VP`, email: `${Date.now()}-velpolicy@example.com` } });
      const policy = await prisma.policy.create({ data: { merchantId: merchant.id, name: "Velocity Policy", conditionType: "VELOCITY", conditionOperator: "GTE", conditionValue: 50, action: "BLOCK", priority: 100, isActive: true, version: 1 } });
      const result = await evaluateVelocityGate({ currentCount: 60, period: "day", policyId: policy.id });
      expect(result.decision).toBe("BLOCK");
    });
  });
});
