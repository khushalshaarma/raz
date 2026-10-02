import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { evaluateConfidenceGate } from "@/lib/governance/confidence-gate";

async function cleanup() {
  await prisma.$executeRawUnsafe(`PRAGMA foreign_keys=OFF;DELETE FROM systemHealth;DELETE FROM opportunity;DELETE FROM strategyExperiment;DELETE FROM simulation;DELETE FROM decision;DELETE FROM decisionOutcome;DELETE FROM campaign;DELETE FROM agent;DELETE FROM auditEvent;DELETE FROM auditLog;DELETE FROM governanceDecision;DELETE FROM actionRequest;DELETE FROM policyRule;DELETE FROM policy;DELETE FROM customer;DELETE FROM orderItem;DELETE FROM payment;DELETE FROM "order";DELETE FROM product;DELETE FROM merchant;DELETE FROM user;PRAGMA foreign_keys=ON;`);
}

describe("confidence-gate", () => {
  beforeEach(async () => cleanup());
  afterEach(async () => cleanup());

  describe("HIGH confidence", () => {
    it("returns PASS for HIGH confidence (score >= 70)", async () => {
      const result = await evaluateConfidenceGate({ confidenceScore: 85 });
      expect(result.decision).toBe("PASS");
      expect(result.confidenceLevel).toBe("HIGH");
    });
  });

  describe("MEDIUM confidence", () => {
    it("returns REQUIRE_APPROVAL for MEDIUM confidence (60 <= score < 70)", async () => {
      const result = await evaluateConfidenceGate({ confidenceScore: 65 });
      expect(result.decision).toBe("REQUIRE_APPROVAL");
      expect(result.confidenceLevel).toBe("MEDIUM");
    });
  });

  describe("LOW confidence", () => {
    it("returns BLOCK for LOW confidence (score < 60)", async () => {
      const result = await evaluateConfidenceGate({ confidenceScore: 40 });
      expect(result.decision).toBe("BLOCK");
      expect(result.confidenceLevel).toBe("LOW");
    });
  });

  describe("missing confidence", () => {
    it("returns BLOCK when confidence score is very low", async () => {
      const result = await evaluateConfidenceGate({ confidenceScore: 10 });
      expect(result.decision).toBe("BLOCK");
    });
    it("returns PASS when confidence is exactly 70", async () => {
      const result = await evaluateConfidenceGate({ confidenceScore: 70 });
      expect(result.decision).toBe("PASS");
    });
    it("returns REQUIRE_APPROVAL when confidence is exactly 60", async () => {
      const result = await evaluateConfidenceGate({ confidenceScore: 60 });
      expect(result.decision).toBe("REQUIRE_APPROVAL");
    });
  });

  describe("policy override", () => {
    it("uses policy threshold when policyId provided", async () => {
      const ts = Date.now();
      const user = await prisma.user.create({ data: { email: `confpolicy-${ts}@example.com`, password: "hash", name: "CP", role: "MERCHANT" } });
      const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: `${Date.now()}-CP`, email: `confpolicy-${ts}@example.com` } });
      const policy = await prisma.policy.create({ data: { merchantId: merchant.id, name: "Confidence Policy", conditionType: "CONFIDENCE_SCORE", conditionOperator: "GTE", conditionValue: 80, action: "BLOCK", priority: 100, isActive: true, version: 1 } });
      const result = await evaluateConfidenceGate({ confidenceScore: 75, policyId: policy.id });
      expect(result.decision).toBe("REQUIRE_APPROVAL");
      expect(result.confidenceLevel).toBe("MEDIUM");
    });
    it("PASS when score meets policy threshold", async () => {
      const ts = Date.now();
      const user = await prisma.user.create({ data: { email: `confpolicy2-${ts}@example.com`, password: "hash", name: "CP2", role: "MERCHANT" } });
      const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: `${Date.now()}-CP2`, email: `confpolicy2-${ts}@example.com` } });
      const policy = await prisma.policy.create({ data: { merchantId: merchant.id, name: "Confidence Policy High", conditionType: "CONFIDENCE_SCORE", conditionOperator: "GTE", conditionValue: 80, action: "BLOCK", priority: 100, isActive: true, version: 1 } });
      const result = await evaluateConfidenceGate({ confidenceScore: 85, policyId: policy.id });
      expect(result.decision).toBe("PASS");
    });
  });
});
