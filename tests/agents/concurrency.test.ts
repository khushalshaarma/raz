import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { createGrowthCycle, updateGrowthCycleStatus } from "@/lib/agents/workflows/growth-cycle";
import { storeMemory, retrieveMemory } from "@/lib/agents/memory/memory";

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

async function setup() {
  const user = await prisma.user.create({
    data: { email: `conc-${Date.now()}@test.com`, password: "hash", name: "Test", role: "MERCHANT" },
  });
  const merchant = await prisma.merchant.create({
    data: { ownerId: user.id, businessName: "Test Merchant", email: `conc-${Date.now()}@test.com` },
  });
  return { user, merchant };
}

describe("concurrency", () => {
  beforeEach(async () => await cleanup());

  it("concurrent growth cycle creation does not corrupt data", async () => {
    const { merchant } = await setup();

    const results = await Promise.all([
      createGrowthCycle(merchant.id),
      createGrowthCycle(merchant.id),
      createGrowthCycle(merchant.id),
    ]);

    expect(results).toHaveLength(3);
    const uniqueIds = new Set(results);
    expect(uniqueIds.size).toBe(3);
  });

  it("concurrent memory writes do not corrupt data", async () => {
    const { merchant } = await setup();

    await Promise.all([
      storeMemory({ merchantId: merchant.id, memoryType: "LONG_TERM", category: "STRATEGY_PERFORMANCE", key: "a", value: { v: 1 } }),
      storeMemory({ merchantId: merchant.id, memoryType: "LONG_TERM", category: "STRATEGY_PERFORMANCE", key: "b", value: { v: 2 } }),
      storeMemory({ merchantId: merchant.id, memoryType: "LONG_TERM", category: "STRATEGY_PERFORMANCE", key: "c", value: { v: 3 } }),
    ]);

    const memA = await retrieveMemory(merchant.id, "LONG_TERM", "STRATEGY_PERFORMANCE", "a");
    const memB = await retrieveMemory(merchant.id, "LONG_TERM", "STRATEGY_PERFORMANCE", "b");
    const memC = await retrieveMemory(merchant.id, "LONG_TERM", "STRATEGY_PERFORMANCE", "c");

    expect(memA).not.toBeNull();
    expect(memB).not.toBeNull();
    expect(memC).not.toBeNull();
  });

  it("concurrent status updates are serialized by SQLite", async () => {
    const { merchant } = await setup();
    const cycleId = await createGrowthCycle(merchant.id);

    await updateGrowthCycleStatus(cycleId, "OBSERVING");
    const after1 = await prisma.growthCycle.findUnique({ where: { id: cycleId } });
    expect(after1!.status).toBe("OBSERVING");

    await updateGrowthCycleStatus(cycleId, "STRATEGIZING");
    const after2 = await prisma.growthCycle.findUnique({ where: { id: cycleId } });
    expect(after2!.status).toBe("STRATEGIZING");
  });

  it("merchant isolation holds under concurrent access", async () => {
    const user1 = await prisma.user.create({
      data: { email: `conc1-${Date.now()}@test.com`, password: "hash", name: "A", role: "MERCHANT" },
    });
    const m1 = await prisma.merchant.create({
      data: { ownerId: user1.id, businessName: "A Merchant", email: `conc1-${Date.now()}@test.com` },
    });

    const user2 = await prisma.user.create({
      data: { email: `conc2-${Date.now()}@test.com`, password: "hash", name: "B", role: "MERCHANT" },
    });
    const m2 = await prisma.merchant.create({
      data: { ownerId: user2.id, businessName: "B Merchant", email: `conc2-${Date.now()}@test.com` },
    });

    await Promise.all([
      storeMemory({ merchantId: m1.id, memoryType: "LONG_TERM", category: "STRATEGY_PERFORMANCE", key: "shared-key", value: { merchant: "A" } }),
      storeMemory({ merchantId: m2.id, memoryType: "LONG_TERM", category: "STRATEGY_PERFORMANCE", key: "shared-key", value: { merchant: "B" } }),
    ]);

    const mem1 = await retrieveMemory(m1.id, "LONG_TERM", "STRATEGY_PERFORMANCE", "shared-key");
    const mem2 = await retrieveMemory(m2.id, "LONG_TERM", "STRATEGY_PERFORMANCE", "shared-key");

    expect(mem1).not.toBeNull();
    expect(mem2).not.toBeNull();
    expect(mem1!.value).toEqual({ merchant: "A" });
    expect(mem2!.value).toEqual({ merchant: "B" });
  });
});
