import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { storeMemory, retrieveMemory, listMemory, deleteMemory, cleanupExpiredMemory, createMemoryKey } from "@/lib/agents/memory/memory";

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
    data: { email: `mem-${Date.now()}@test.com`, password: "hash", name: "Test", role: "MERCHANT" },
  });
  const merchant = await prisma.merchant.create({
    data: { ownerId: user.id, businessName: "Test Merchant", email: `mem-${Date.now()}@test.com` },
  });
  return { user, merchant };
}

describe("agent memory", () => {
  beforeEach(async () => await cleanup());

  it("stores and retrieves memory", async () => {
    const { merchant } = await setup();
    const id = await storeMemory({
      merchantId: merchant.id,
      memoryType: "SHORT_TERM",
      category: "STRATEGY_PERFORMANCE",
      key: "test-key",
      value: { score: 85 },
      confidence: 0.8,
    });

    expect(id).toBeDefined();

    const memory = await retrieveMemory(merchant.id, "SHORT_TERM", "STRATEGY_PERFORMANCE", "test-key");
    expect(memory).not.toBeNull();
    expect(memory!.value.score).toBe(85);
    expect(memory!.confidence).toBe(0.8);
  });

  it("updates existing memory", async () => {
    const { merchant } = await setup();
    await storeMemory({
      merchantId: merchant.id,
      memoryType: "LONG_TERM",
      category: "PREDICTION_ACCURACY",
      key: "pred-1",
      value: { count: 1 },
    });

    await storeMemory({
      merchantId: merchant.id,
      memoryType: "LONG_TERM",
      category: "PREDICTION_ACCURACY",
      key: "pred-1",
      value: { count: 2 },
    });

    const memory = await retrieveMemory(merchant.id, "LONG_TERM", "PREDICTION_ACCURACY", "pred-1");
    expect(memory!.value.count).toBe(2);
  });

  it("returns null for non-existent memory", async () => {
    const { merchant } = await setup();
    const memory = await retrieveMemory(merchant.id, "SHORT_TERM", "STRATEGY_PERFORMANCE", "nonexistent");
    expect(memory).toBeNull();
  });

  it("lists memory by type", async () => {
    const { merchant } = await setup();
    await storeMemory({ merchantId: merchant.id, memoryType: "SHORT_TERM", category: "STRATEGY_PERFORMANCE", key: "k1", value: {} });
    await storeMemory({ merchantId: merchant.id, memoryType: "LONG_TERM", category: "STRATEGY_PERFORMANCE", key: "k2", value: {} });

    const shortTerm = await listMemory(merchant.id, "SHORT_TERM");
    expect(shortTerm).toHaveLength(1);
    expect(shortTerm[0].memoryType).toBe("SHORT_TERM");
  });

  it("deletes memory", async () => {
    const { merchant } = await setup();
    await storeMemory({ merchantId: merchant.id, memoryType: "SHORT_TERM", category: "STRATEGY_PERFORMANCE", key: "del", value: {} });

    const deleted = await deleteMemory(merchant.id, "SHORT_TERM", "STRATEGY_PERFORMANCE", "del");
    expect(deleted).toBe(true);

    const memory = await retrieveMemory(merchant.id, "SHORT_TERM", "STRATEGY_PERFORMANCE", "del");
    expect(memory).toBeNull();
  });

  it("cleans up expired memory", async () => {
    const { merchant } = await setup();
    await storeMemory({
      merchantId: merchant.id,
      memoryType: "SHORT_TERM",
      category: "STRATEGY_PERFORMANCE",
      key: "exp",
      value: {},
      expiresAt: new Date(Date.now() - 1000),
    });

    const cleaned = await cleanupExpiredMemory(merchant.id);
    expect(cleaned).toBe(1);
  });

  it("creates memory key from parts", () => {
    expect(createMemoryKey("a", "b", "c")).toBe("a::b::c");
  });

  it("isolates memory by merchant", async () => {
    const { merchant: m1 } = await setup();
    const { merchant: m2 } = await setup();

    await storeMemory({ merchantId: m1.id, memoryType: "SHORT_TERM", category: "STRATEGY_PERFORMANCE", key: "shared", value: { owner: "m1" } });
    await storeMemory({ merchantId: m2.id, memoryType: "SHORT_TERM", category: "STRATEGY_PERFORMANCE", key: "shared", value: { owner: "m2" } });

    const mem1 = await retrieveMemory(m1.id, "SHORT_TERM", "STRATEGY_PERFORMANCE", "shared");
    const mem2 = await retrieveMemory(m2.id, "SHORT_TERM", "STRATEGY_PERFORMANCE", "shared");

    expect(mem1!.value.owner).toBe("m1");
    expect(mem2!.value.owner).toBe("m2");
  });
});
