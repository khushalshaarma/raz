import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { checkAutomationState, pauseAutomation, resumeAutomation } from "@/lib/governance/kill-switch";

async function cleanup() {
  await prisma.$executeRawUnsafe(`PRAGMA foreign_keys=OFF;DELETE FROM systemHealth;DELETE FROM opportunity;DELETE FROM strategyExperiment;DELETE FROM simulation;DELETE FROM decision;DELETE FROM decisionOutcome;DELETE FROM campaign;DELETE FROM agent;DELETE FROM auditEvent;DELETE FROM auditLog;DELETE FROM governanceDecision;DELETE FROM actionRequest;DELETE FROM policyRule;DELETE FROM policy;DELETE FROM customer;DELETE FROM orderItem;DELETE FROM payment;DELETE FROM "order";DELETE FROM product;DELETE FROM merchant;DELETE FROM user;PRAGMA foreign_keys=ON;`);
}

describe("kill-switch", () => {
  beforeEach(async () => cleanup());
  afterEach(async () => cleanup());

  describe("ACTIVE", () => {
    it("returns ACTIVE when no pause policy exists", async () => {
      const user = await prisma.user.create({ data: { email: `${Date.now()}-m@example.com`, password: "hash", name: "M", role: "MERCHANT" } });
      const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: `${Date.now()}-M`, email: `${Date.now()}-m@example.com` } });
      const result = await checkAutomationState(merchant.id);
      expect(result.state).toBe("ACTIVE");
      expect(result.isAutomationAllowed).toBe(true);
    });
    it("action can proceed when ACTIVE", async () => {
      const user = await prisma.user.create({ data: { email: `${Date.now()}-ma@example.com`, password: "hash", name: "MA", role: "MERCHANT" } });
      const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: `${Date.now()}-MA`, email: `${Date.now()}-ma@example.com` } });
      const result = await checkAutomationState(merchant.id);
      expect(result.isAutomationAllowed).toBe(true);
    });
  });

  describe("PAUSED", () => {
    it("returns PAUSED and blocks automated actions", async () => {
      const user = await prisma.user.create({ data: { email: `${Date.now()}-mb@example.com`, password: "hash", name: "MB", role: "MERCHANT" } });
      const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: `${Date.now()}-MB`, email: `${Date.now()}-mb@example.com` } });
      await pauseAutomation(merchant.id, "admin-1");
      const result = await checkAutomationState(merchant.id);
      expect(result.state).toBe("PAUSED");
      expect(result.isAutomationAllowed).toBe(false);
      expect(result.wasPaused).toBe(true);
    });
    it("action MUST NOT become execution-ready when PAUSED", async () => {
      const user = await prisma.user.create({ data: { email: `${Date.now()}-mc@example.com`, password: "hash", name: "MC", role: "MERCHANT" } });
      const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: `${Date.now()}-MC`, email: `${Date.now()}-mc@example.com` } });
      await pauseAutomation(merchant.id, "admin-1");
      const result = await checkAutomationState(merchant.id);
      expect(result.isAutomationAllowed).toBe(false);
      expect(result.wasPaused).toBe(true);
    });
  });

  describe("resume", () => {
    it("returns ACTIVE after resumeAutomation", async () => {
      const user = await prisma.user.create({ data: { email: `${Date.now()}-mr@example.com`, password: "hash", name: "MR", role: "MERCHANT" } });
      const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: `${Date.now()}-MR`, email: `${Date.now()}-mr@example.com` } });
      await pauseAutomation(merchant.id, "admin-1");
      const result = await resumeAutomation(merchant.id);
      expect(result.state).toBe("ACTIVE");
      expect(result.isAutomationAllowed).toBe(true);
      expect(result.wasPaused).toBe(false);
    });
  });
});
