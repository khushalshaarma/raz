import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { evaluatePolicy } from "@/lib/governance/policy-engine";

async function cleanup() {
  await prisma.$executeRawUnsafe(`PRAGMA foreign_keys=OFF;DELETE FROM systemHealth;DELETE FROM opportunity;DELETE FROM strategyExperiment;DELETE FROM simulation;DELETE FROM decision;DELETE FROM decisionOutcome;DELETE FROM campaign;DELETE FROM agent;DELETE FROM auditEvent;DELETE FROM auditLog;DELETE FROM governanceDecision;DELETE FROM actionRequest;DELETE FROM policyRule;DELETE FROM policy;DELETE FROM customer;DELETE FROM orderItem;DELETE FROM payment;DELETE FROM "order";DELETE FROM product;DELETE FROM merchant;DELETE FROM user;PRAGMA foreign_keys=ON;`);
}

async function setup() {
  const user = await prisma.user.create({ data: { email: `${Date.now()}-test@example.com`, password: "hash", name: "Test", role: "MERCHANT" } });
  const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: `${Date.now()}-Test Merchant`, email: `${Date.now()}-test@example.com` } });
  const policy = await prisma.policy.create({ data: { merchantId: merchant.id, name: "Test Policy", conditionType: "RISK_SCORE", conditionOperator: "GTE", conditionValue: 50, action: "BLOCK", priority: 100, isActive: true, version: 1 } });
  return { merchant, policy };
}

describe("policy-engine", () => {
  beforeEach(async () => cleanup());
  afterEach(async () => cleanup());

  describe("ALLOW decision", () => {
    it("returns BLOCK when condition is not met (risk below threshold)", async () => {
      const { policy } = await setup();
      const policy2 = await prisma.policy.update({ where: { id: policy.id }, data: { conditionOperator: "GTE", conditionValue: 100 } });
      const result = await evaluatePolicy(policy2.id, { riskScore: 50, confidenceScore: 80, dataQualityScore: 80, velocity: 10, spendMinor: 1000 });
      expect(result.decision).toBe("BLOCK");
    });
  });

  describe("BLOCK decision", () => {
    it("returns BLOCK when condition is not met", async () => {
      const { policy } = await setup();
      const result = await evaluatePolicy(policy.id, { riskScore: 40, confidenceScore: 80, dataQualityScore: 80, velocity: 10, spendMinor: 1000 });
      expect(result.decision).toBe("BLOCK");
    });
    it("BLOCK takes precedence when condition not met", async () => {
      const user = await prisma.user.create({ data: { email: `${Date.now()}-m2@example.com`, password: "hash", name: "M2", role: "MERCHANT" } });
      const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: `${Date.now()}-M2`, email: `${Date.now()}-m2@example.com` } });
      const blockPolicy = await prisma.policy.create({ data: { merchantId: merchant.id, name: "Block Policy", conditionType: "RISK_SCORE", conditionOperator: "GTE", conditionValue: 50, action: "BLOCK", priority: 100, isActive: true, version: 1 } });
      const result = await evaluatePolicy(blockPolicy.id, { riskScore: 40, confidenceScore: 80, dataQualityScore: 80, velocity: 10, spendMinor: 1000 });
      expect(result.decision).toBe("BLOCK");
    });
  });

  describe("REQUIRE_APPROVAL decision", () => {
    it("returns REQUIRE_APPROVAL when condition is met", async () => {
      const user = await prisma.user.create({ data: { email: `${Date.now()}-m3@example.com`, password: "hash", name: "M3", role: "MERCHANT" } });
      const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: `${Date.now()}-M3`, email: `${Date.now()}-m3@example.com` } });
      const policy = await prisma.policy.create({ data: { merchantId: merchant.id, name: "Approval Policy", conditionType: "RISK_SCORE", conditionOperator: "GTE", conditionValue: 50, action: "REQUIRE_APPROVAL", priority: 100, isActive: true, version: 1 } });
      const result = await evaluatePolicy(policy.id, { riskScore: 80, confidenceScore: 80, dataQualityScore: 80, velocity: 10, spendMinor: 1000 });
      expect(result.decision).toBe("REQUIRE_APPROVAL");
    });
  });

  describe("default deny", () => {
    it("returns BLOCK for unknown condition type (NEUTRAL)", async () => {
      const user = await prisma.user.create({ data: { email: `${Date.now()}-m4@example.com`, password: "hash", name: "M4", role: "MERCHANT" } });
      const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: `${Date.now()}-M4`, email: `${Date.now()}-m4@example.com` } });
      const policy = await prisma.policy.create({ data: { merchantId: merchant.id, name: "Unknown Policy", conditionType: "UNKNOWN_TYPE", conditionOperator: "GTE", conditionValue: 50, action: "BLOCK", priority: 100, isActive: true, version: 1 } });
      const result = await evaluatePolicy(policy.id, { riskScore: 80, confidenceScore: 80, dataQualityScore: 80, velocity: 10, spendMinor: 1000 });
      expect(result.decision).toBe("BLOCK");
    });
  });

  describe("operators", () => {
    it("GTE operator: value >= threshold → ALLOW", async () => {
      const user = await prisma.user.create({ data: { email: `${Date.now()}-gte@example.com`, password: "hash", name: "GTE", role: "MERCHANT" } });
      const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: `${Date.now()}-GTE`, email: `${Date.now()}-gte@example.com` } });
      const policy = await prisma.policy.create({ data: { merchantId: merchant.id, name: "GTE", conditionType: "RISK_SCORE", conditionOperator: "GTE", conditionValue: 50, action: "ALLOW", priority: 100, isActive: true, version: 1 } });
      const result = await evaluatePolicy(policy.id, { riskScore: 50, confidenceScore: 80, dataQualityScore: 80, velocity: 10, spendMinor: 1000 });
      expect(result.decision).toBe("ALLOW");
    });
    it("GTE operator: value < threshold → BLOCK", async () => {
      const user = await prisma.user.create({ data: { email: `${Date.now()}-gteb@example.com`, password: "hash", name: "GTEB", role: "MERCHANT" } });
      const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: `${Date.now()}-GTEB`, email: `${Date.now()}-gteb@example.com` } });
      const policy = await prisma.policy.create({ data: { merchantId: merchant.id, name: "GTEB", conditionType: "RISK_SCORE", conditionOperator: "GTE", conditionValue: 50, action: "BLOCK", priority: 100, isActive: true, version: 1 } });
      const result = await evaluatePolicy(policy.id, { riskScore: 40, confidenceScore: 80, dataQualityScore: 80, velocity: 10, spendMinor: 1000 });
      expect(result.decision).toBe("BLOCK");
    });
    it("LTE operator: value <= threshold → ALLOW", async () => {
      const user = await prisma.user.create({ data: { email: `${Date.now()}-lte@example.com`, password: "hash", name: "LTE", role: "MERCHANT" } });
      const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: `${Date.now()}-LTE`, email: `${Date.now()}-lte@example.com` } });
      const policy = await prisma.policy.create({ data: { merchantId: merchant.id, name: "LTE", conditionType: "RISK_SCORE", conditionOperator: "LTE", conditionValue: 50, action: "ALLOW", priority: 100, isActive: true, version: 1 } });
      const result = await evaluatePolicy(policy.id, { riskScore: 50, confidenceScore: 80, dataQualityScore: 80, velocity: 10, spendMinor: 1000 });
      expect(result.decision).toBe("ALLOW");
    });
    it("LTE operator: value > threshold → BLOCK", async () => {
      const user = await prisma.user.create({ data: { email: `${Date.now()}-ltb@example.com`, password: "hash", name: "LTB", role: "MERCHANT" } });
      const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: `${Date.now()}-LTB`, email: `${Date.now()}-ltb@example.com` } });
      const policy = await prisma.policy.create({ data: { merchantId: merchant.id, name: "LTB", conditionType: "RISK_SCORE", conditionOperator: "LTE", conditionValue: 30, action: "BLOCK", priority: 100, isActive: true, version: 1 } });
      const result = await evaluatePolicy(policy.id, { riskScore: 50, confidenceScore: 80, dataQualityScore: 80, velocity: 10, spendMinor: 1000 });
      expect(result.decision).toBe("BLOCK");
    });
    it("GT operator: value > threshold → ALLOW", async () => {
      const user = await prisma.user.create({ data: { email: `${Date.now()}-gt@example.com`, password: "hash", name: "GT", role: "MERCHANT" } });
      const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: `${Date.now()}-GT`, email: `${Date.now()}-gt@example.com` } });
      const policy = await prisma.policy.create({ data: { merchantId: merchant.id, name: "GT", conditionType: "RISK_SCORE", conditionOperator: "GT", conditionValue: 30, action: "ALLOW", priority: 100, isActive: true, version: 1 } });
      const result = await evaluatePolicy(policy.id, { riskScore: 50, confidenceScore: 80, dataQualityScore: 80, velocity: 10, spendMinor: 1000 });
      expect(result.decision).toBe("ALLOW");
    });
    it("LT operator: value < threshold → ALLOW", async () => {
      const user = await prisma.user.create({ data: { email: `${Date.now()}-lt@example.com`, password: "hash", name: "LT", role: "MERCHANT" } });
      const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: `${Date.now()}-LT`, email: `${Date.now()}-lt@example.com` } });
      const policy = await prisma.policy.create({ data: { merchantId: merchant.id, name: "LT", conditionType: "RISK_SCORE", conditionOperator: "LT", conditionValue: 70, action: "ALLOW", priority: 100, isActive: true, version: 1 } });
      const result = await evaluatePolicy(policy.id, { riskScore: 50, confidenceScore: 80, dataQualityScore: 80, velocity: 10, spendMinor: 1000 });
      expect(result.decision).toBe("ALLOW");
    });
    it("EQ operator: value === threshold → ALLOW", async () => {
      const user = await prisma.user.create({ data: { email: `${Date.now()}-eq@example.com`, password: "hash", name: "EQ", role: "MERCHANT" } });
      const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: `${Date.now()}-EQ`, email: `${Date.now()}-eq@example.com` } });
      const policy = await prisma.policy.create({ data: { merchantId: merchant.id, name: "EQ", conditionType: "RISK_SCORE", conditionOperator: "EQ", conditionValue: 50, action: "ALLOW", priority: 100, isActive: true, version: 1 } });
      const result = await evaluatePolicy(policy.id, { riskScore: 50, confidenceScore: 80, dataQualityScore: 80, velocity: 10, spendMinor: 1000 });
      expect(result.decision).toBe("ALLOW");
    });
    it("NEQ operator: value !== threshold → ALLOW", async () => {
      const user = await prisma.user.create({ data: { email: `${Date.now()}-neq@example.com`, password: "hash", name: "NEQ", role: "MERCHANT" } });
      const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: `${Date.now()}-NEQ`, email: `${Date.now()}-neq@example.com` } });
      const policy = await prisma.policy.create({ data: { merchantId: merchant.id, name: "NEQ", conditionType: "RISK_SCORE", conditionOperator: "NEQ", conditionValue: 99, action: "ALLOW", priority: 100, isActive: true, version: 1 } });
      const result = await evaluatePolicy(policy.id, { riskScore: 50, confidenceScore: 80, dataQualityScore: 80, velocity: 10, spendMinor: 1000 });
      expect(result.decision).toBe("ALLOW");
    });
  });

  describe("multiple rules and conflicting rules", () => {
    it("evaluates multiple rules - condition met returns ALLOW", async () => {
      const user = await prisma.user.create({ data: { email: `${Date.now()}-multi@example.com`, password: "hash", name: "MULTI", role: "MERCHANT" } });
      const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: `${Date.now()}-MULTI`, email: `${Date.now()}-multi@example.com` } });
      const blockPolicy = await prisma.policy.create({ data: { merchantId: merchant.id, name: "Block", conditionType: "RISK_SCORE", conditionOperator: "GTE", conditionValue: 50, action: "BLOCK", priority: 100, isActive: true, version: 1 } });
      const allowPolicy = await prisma.policy.create({ data: { merchantId: merchant.id, name: "Allow", conditionType: "RISK_SCORE", conditionOperator: "LTE", conditionValue: 30, action: "ALLOW", priority: 50, isActive: true, version: 1 } });
      const result = await evaluatePolicy(blockPolicy.id, { riskScore: 80, confidenceScore: 80, dataQualityScore: 80, velocity: 10, spendMinor: 1000 });
      expect(result.decision).toBe("BLOCK");
    });
  });

  describe("CUSTOM condition safety", () => {
    it("CUSTOM condition always returns BLOCK", async () => {
      const user = await prisma.user.create({ data: { email: `${Date.now()}-cust@example.com`, password: "hash", name: "C", role: "MERCHANT" } });
      const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: `${Date.now()}-CUST`, email: `${Date.now()}-cust@example.com` } });
      const policy = await prisma.policy.create({ data: { merchantId: merchant.id, name: "CUSTOM", conditionType: "CUSTOM", conditionOperator: "EQ", conditionValue: 1, conditionExpression: '{"key":"value"}', action: "ALLOW", priority: 100, isActive: true, version: 1 } });
      const result = await evaluatePolicy(policy.id, { riskScore: 80, confidenceScore: 80, dataQualityScore: 80, velocity: 10, spendMinor: 1000, custom: { CUSTOM: 1 } });
      expect(result.decision).toBe("BLOCK");
    });
  });
});
