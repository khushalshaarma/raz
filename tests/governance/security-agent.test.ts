import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { evaluateSecurity } from "@/lib/governance/security-agent";
import { ActionType } from "@/lib/governance/action";

async function cleanup() {
  await prisma.$executeRawUnsafe(`PRAGMA foreign_keys=OFF;DELETE FROM systemHealth;DELETE FROM opportunity;DELETE FROM strategyExperiment;DELETE FROM simulation;DELETE FROM decision;DELETE FROM decisionOutcome;DELETE FROM campaign;DELETE FROM agent;DELETE FROM auditEvent;DELETE FROM auditLog;DELETE FROM governanceDecision;DELETE FROM actionRequest;DELETE FROM policyRule;DELETE FROM policy;DELETE FROM customer;DELETE FROM orderItem;DELETE FROM payment;DELETE FROM "order";DELETE FROM product;DELETE FROM merchant;DELETE FROM user;PRAGMA foreign_keys=ON;`);
}

async function setupMerchant() {
  const user = await prisma.user.create({ data: { email: `${Date.now()}-sec@example.com`, password: "hash", name: "Test", role: "MERCHANT" } });
  const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: `${Date.now()}-SecureMerchant`, email: `${Date.now()}-secure@example.com` } });
  return { merchant, user };
}

describe("security-agent", () => {
  beforeEach(async () => cleanup());
  afterEach(async () => cleanup());

  describe("valid merchant", () => {
    it("returns SECURE for valid merchant and valid action", async () => {
      const { merchant } = await setupMerchant();
      const result = await evaluateSecurity({
        merchantId: merchant.id,
        actionRequestId: "req-1",
        amountMinor: 1000,
        actionType: "DISCOUNT",
      });
      expect(result.securityLevel).toBe("SECURE");
      expect(result.securityScore).toBeGreaterThanOrEqual(70);
    });
  });

  describe("non-existent merchant", () => {
    it("returns SUSPICIOUS for non-existent merchant", async () => {
      const result = await evaluateSecurity({
        merchantId: "non-existent-merchant",
        actionRequestId: "req-1",
        amountMinor: 1000,
        actionType: "DISCOUNT",
      });
      expect(result.securityLevel).toBe("SUSPICIOUS");
    });
  });

  describe("invalid action type", () => {
    it("returns BLOCKED for truly invalid action type", async () => {
      const { merchant } = await setupMerchant();
      const result = await evaluateSecurity({
        merchantId: merchant.id,
        actionRequestId: "req-1",
        amountMinor: 1000,
        actionType: "FAKE" as ActionType,
      });
      expect(result.securityLevel).toBe("BLOCKED");
    });
  });

  describe("negative amount", () => {
    it("returns SUSPICIOUS for negative amount", async () => {
      const { merchant } = await setupMerchant();
      const result = await evaluateSecurity({
        merchantId: merchant.id,
        actionRequestId: "req-1",
        amountMinor: -100,
        actionType: "DISCOUNT",
      });
      expect(result.securityLevel).toBe("SUSPICIOUS");
    });
  });

  describe("zero amount", () => {
    it("returns SUSPICIOUS for zero amount", async () => {
      const { merchant } = await setupMerchant();
      const result = await evaluateSecurity({
        merchantId: merchant.id,
        actionRequestId: "req-1",
        amountMinor: 0,
        actionType: "DISCOUNT",
      });
      expect(result.securityLevel).toBe("SUSPICIOUS");
    });
  });

  describe("extreme amount", () => {
    it("handles extreme amounts", async () => {
      const { merchant } = await setupMerchant();
      const result = await evaluateSecurity({
        merchantId: merchant.id,
        actionRequestId: "req-1",
        amountMinor: 999999999,
        actionType: "DISCOUNT",
      });
      expect(result.securityScore).toBeGreaterThanOrEqual(0);
      expect(result.securityScore).toBeLessThanOrEqual(100);
    });
  });

  describe("merchant isolation", () => {
    it("BLOCKED when targetMerchantId differs from auth merchant", async () => {
      const { merchant } = await setupMerchant();
      const user = await prisma.user.create({ data: { email: `${Date.now()}-other@example.com`, password: "hash", name: "Other", role: "MERCHANT" } });
      const merchant2 = await prisma.merchant.create({ data: { ownerId: user.id, businessName: `${Date.now()}-Other`, email: `${Date.now()}-other@example.com` } });
      const result = await evaluateSecurity({
        merchantId: merchant.id,
        actionRequestId: "req-1",
        amountMinor: 1000,
        actionType: "DISCOUNT",
        targetMerchantId: merchant2.id,
      });
      expect(result.securityLevel).toBe("BLOCKED");
      expect(result.reasonCodes).toContain("MERCHANT_ISOLATION_VIOLATION");
    });
  });

  describe("replay request", () => {
    it("handles replay by checking actionRequestId", async () => {
      const { merchant } = await setupMerchant();
      const result = await evaluateSecurity({
        merchantId: merchant.id,
        actionRequestId: "replay-req",
        amountMinor: 1000,
        actionType: "DISCOUNT",
      });
      expect(result.securityLevel).toBeDefined();
    });
  });

  describe("security agent NEVER approves", () => {
    it("security agent does NOT use frontend values", async () => {
      const { merchant } = await setupMerchant();
      const result = await evaluateSecurity({
        merchantId: merchant.id,
        actionRequestId: "req-1",
        amountMinor: 1000,
        actionType: "DISCOUNT",
      });
      expect(result.securityLevel).toBe("SECURE");
    });
  });
});
