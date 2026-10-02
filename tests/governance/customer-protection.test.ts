import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { evaluateCustomerProtection } from "@/lib/governance/customer-protection";

async function cleanup() {
  await prisma.$executeRawUnsafe(`PRAGMA foreign_keys=OFF;DELETE FROM systemHealth;DELETE FROM opportunity;DELETE FROM strategyExperiment;DELETE FROM simulation;DELETE FROM decision;DELETE FROM decisionOutcome;DELETE FROM campaign;DELETE FROM agent;DELETE FROM auditEvent;DELETE FROM auditLog;DELETE FROM governanceDecision;DELETE FROM actionRequest;DELETE FROM policyRule;DELETE FROM policy;DELETE FROM customer;DELETE FROM orderItem;DELETE FROM payment;DELETE FROM "order";DELETE FROM product;DELETE FROM merchant;DELETE FROM user;PRAGMA foreign_keys=ON;`);
}

async function setupMerchant(merchantId: string) {
  const ts = Date.now();
  const user = await prisma.user.create({ data: { email: `${merchantId}-${ts}@example.com`, password: "hash", name: merchantId, role: "MERCHANT" } });
  const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: merchantId, email: `${merchantId}-${ts}@example.com` } });
  const customer = await prisma.customer.create({ data: { merchantId: merchant.id, name: "Test Customer", email: `${merchantId}-${ts}@customer.com`, phone: "1234567890" } });
  return { merchant, customer };
}

describe("customer-protection", () => {
  beforeEach(async () => cleanup());
  afterEach(async () => cleanup());

  describe("cooldown", () => {
    it("BLOCKS when same customer + same strategy within cooldown", async () => {
      const { merchant, customer } = await setupMerchant("cp1");
      const now = new Date();
      await prisma.actionRequest.create({
        data: { merchantId: merchant.id, opportunityType: "DISCOUNT", strategyId: "s1", strategyName: "s1", customerId: customer.id, amountMinor: 1000, status: "PENDING", createdAt: now, recommendedScenario: "CONSERVATIVE", decisionScore: 50, riskLevel: "LOW", confidence: 70 },
      });
      const result = await evaluateCustomerProtection({
        merchantId: merchant.id, customerId: customer.id, strategyId: "s1",
        actionType: "DISCOUNT", now,
      });
      expect(result.decision).toBe("BLOCK");
      expect(result.reasonCode).toBe("CUSTOMER_COOLDOWN");
      expect(result.isProtected).toBe(true);
    });
  });

  describe("max per day", () => {
    it("BLOCKS when actions per day exceed maxPerDay", async () => {
      const { merchant, customer } = await setupMerchant("cp2");
      const now = new Date();
      const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
      for (let i = 0; i < 6; i++) {
        await prisma.actionRequest.create({
          data: { merchantId: merchant.id, opportunityType: "DISCOUNT", strategyId: `s${i}`, strategyName: `s${i}`, customerId: customer.id, amountMinor: 1000, status: "PENDING", createdAt: new Date(startOfDay.getTime() + i * 1000), recommendedScenario: "CONSERVATIVE", decisionScore: 50, riskLevel: "LOW", confidence: 70 },
        });
      }
      const result = await evaluateCustomerProtection({
        merchantId: merchant.id, customerId: customer.id, strategyId: "s-new",
        actionType: "DISCOUNT", now, maxPerDay: 5,
      });
      expect(result.decision).toBe("BLOCK");
      expect(result.reasonCode).toBe("CUSTOMER_MAX_PER_DAY_EXCEEDED");
    });
  });

  describe("max per month", () => {
    it("BLOCKS when actions per month exceed maxPerMonth", async () => {
      const { merchant, customer } = await setupMerchant("cp3");
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      for (let i = 0; i < 21; i++) {
        const actionDate = new Date(startOfMonth.getTime() + i * 1000);
        await prisma.actionRequest.create({
          data: { merchantId: merchant.id, opportunityType: "DISCOUNT", strategyId: `s${i}`, strategyName: `s${i}`, customerId: customer.id, amountMinor: 1000, status: "PENDING", createdAt: actionDate, recommendedScenario: "CONSERVATIVE", decisionScore: 50, riskLevel: "LOW", confidence: 70 },
        });
      }
      const result = await evaluateCustomerProtection({
        merchantId: merchant.id, customerId: customer.id, strategyId: "s-new",
        actionType: "DISCOUNT", now, maxPerMonth: 20,
      });
      expect(result.decision).toBe("BLOCK");
      expect(result.reasonCode).toBe("CUSTOMER_MAX_PER_MONTH_EXCEEDED");
    });
  });

  describe("duplicate prevention", () => {
    it("BLOCKS when same customer has recent action with same strategy", async () => {
      const { merchant, customer } = await setupMerchant("cp4");
      const now = new Date();
      await prisma.actionRequest.create({
        data: { merchantId: merchant.id, opportunityType: "DISCOUNT", strategyId: "dup-strategy", strategyName: "dup-strategy", customerId: customer.id, amountMinor: 1000, status: "PENDING", createdAt: now, recommendedScenario: "CONSERVATIVE", decisionScore: 50, riskLevel: "LOW", confidence: 70 },
      });
      const result = await evaluateCustomerProtection({
        merchantId: merchant.id, customerId: customer.id, strategyId: "dup-strategy",
        actionType: "DISCOUNT", now, cooldownMinutes: 30,
      });
      expect(result.decision).toBe("BLOCK");
      expect(result.isProtected).toBe(true);
    });
  });

  describe("pass case", () => {
    it("returns PASS when no protections triggered", async () => {
      const { merchant, customer } = await setupMerchant("cp5");
      const result = await evaluateCustomerProtection({
        merchantId: merchant.id, customerId: customer.id, strategyId: "s-new",
        actionType: "DISCOUNT", now: new Date(),
      });
      expect(result.decision).toBe("PASS");
      expect(result.reasonCode).toBe("CUSTOMER_PROTECTION_PASSED");
    });
  });
});
