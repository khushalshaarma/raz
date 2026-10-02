import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { storeMemory, retrieveMemory } from "@/lib/agents/memory/memory";
import { createGrowthCycle, getGrowthCycle } from "@/lib/agents/workflows/growth-cycle";
import { getAutopilotConfig } from "@/lib/agents/autopilot";

async function cleanup() {
  await prisma.$executeRawUnsafe(`
    PRAGMA foreign_keys=OFF;
    DELETE FROM agentMemory;
    DELETE FROM agentProposal;
    DELETE FROM agentMessage;
    DELETE FROM agentTask;
    DELETE FROM agentRun;
    DELETE FROM agentEvent;
    DELETE FROM growthCycle;
    DELETE FROM autopilotConfig;
    DELETE FROM reconciliation;
    DELETE FROM webhookEvent;
    DELETE FROM executionAttempt;
    DELETE FROM execution;
    DELETE FROM systemHealth;
    DELETE FROM governanceDecision;
    DELETE FROM actionRequest;
    DELETE FROM policyRule;
    DELETE FROM policy;
    DELETE FROM opportunity;
    DELETE FROM strategyExperiment;
    DELETE FROM simulation;
    DELETE FROM decisionOutcome;
    DELETE FROM decision;
    DELETE FROM campaign;
    DELETE FROM auditEvent;
    DELETE FROM auditLog;
    DELETE FROM payment;
    DELETE FROM "order";
    DELETE FROM orderItem;
    DELETE FROM product;
    DELETE FROM customer;
    DELETE FROM merchant;
    DELETE FROM user;
    PRAGMA foreign_keys=ON;
  `);
}

async function setupMerchant(name: string) {
  const user = await prisma.user.create({
    data: { email: `iso-${name}-${Date.now()}@test.com`, password: "hash", name: name, role: "MERCHANT" },
  });
  const merchant = await prisma.merchant.create({
    data: { ownerId: user.id, businessName: `${name} Merchant`, email: `iso-${name}-${Date.now()}@test.com` },
  });
  return { user, merchant };
}

describe("merchant isolation", () => {
  beforeEach(async () => await cleanup());

  it("memory is isolated between merchants", async () => {
    const { merchant: m1 } = await setupMerchant("A");
    const { merchant: m2 } = await setupMerchant("B");

    await storeMemory({
      merchantId: m1.id,
      memoryType: "LONG_TERM",
      category: "STRATEGY_PERFORMANCE",
      key: "strategy::discount::performance",
      value: { successRate: 0.85 },
    });

    const memA = await retrieveMemory(m1.id, "LONG_TERM", "STRATEGY_PERFORMANCE", "strategy::discount::performance");
    const memB = await retrieveMemory(m2.id, "LONG_TERM", "STRATEGY_PERFORMANCE", "strategy::discount::performance");

    expect(memA).not.toBeNull();
    expect(memB).toBeNull();
  });

  it("growth cycles are isolated between merchants", async () => {
    const { merchant: m1 } = await setupMerchant("A");
    const { merchant: m2 } = await setupMerchant("B");

    const cycle1 = await createGrowthCycle(m1.id);
    const cycle2 = await createGrowthCycle(m2.id);

    const c1 = await getGrowthCycle(cycle1);
    const c2 = await getGrowthCycle(cycle2);

    expect(c1!.merchantId).toBe(m1.id);
    expect(c2!.merchantId).toBe(m2.id);
  });

  it("autopilot configs are isolated", async () => {
    const { merchant: m1 } = await setupMerchant("A");
    const { merchant: m2 } = await setupMerchant("B");

    const config1 = await getAutopilotConfig(m1.id);
    const config2 = await getAutopilotConfig(m2.id);

    expect(config1!.mode).toBe("OFF");
    expect(config2!.mode).toBe("OFF");
  });
});
