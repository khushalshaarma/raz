import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { createGrowthCycle, updateGrowthCycleStatus, canTransitionTo, blockGrowthCycle, failGrowthCycle, getGrowthCycle, getGrowthCyclesForMerchant } from "@/lib/agents/workflows/growth-cycle";

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
    data: { email: `gc-${Date.now()}@test.com`, password: "hash", name: "Test", role: "MERCHANT" },
  });
  const merchant = await prisma.merchant.create({
    data: { ownerId: user.id, businessName: "Test Merchant", email: `gc-${Date.now()}@test.com` },
  });
  return { user, merchant };
}

describe("growth cycle", () => {
  beforeEach(async () => await cleanup());

  it("creates growth cycle", async () => {
    const { merchant } = await setup();
    const cycleId = await createGrowthCycle(merchant.id);
    expect(cycleId).toBeDefined();

    const cycle = await getGrowthCycle(cycleId);
    expect(cycle).not.toBeNull();
    expect(cycle!.status).toBe("CREATED");
    expect(cycle!.merchantId).toBe(merchant.id);
  });

  it("validates state transitions", () => {
    expect(canTransitionTo("CREATED", "OBSERVING")).toBe(true);
    expect(canTransitionTo("CREATED", "COMPLETED")).toBe(false);
    expect(canTransitionTo("OBSERVING", "ANALYZING")).toBe(true);
    expect(canTransitionTo("COMPLETED", "CREATED")).toBe(false);
    expect(canTransitionTo("FAILED", "CREATED")).toBe(true);
    expect(canTransitionTo("BLOCKED", "CREATED")).toBe(true);
  });

  it("blocks growth cycle", async () => {
    const { merchant } = await setup();
    const cycleId = await createGrowthCycle(merchant.id);
    await blockGrowthCycle(cycleId, "Security violation");

    const cycle = await getGrowthCycle(cycleId);
    expect(cycle!.status).toBe("BLOCKED");
    expect(cycle!.blockReason).toBe("Security violation");
  });

  it("fails growth cycle", async () => {
    const { merchant } = await setup();
    const cycleId = await createGrowthCycle(merchant.id);
    await failGrowthCycle(cycleId, "Agent timeout");

    const cycle = await getGrowthCycle(cycleId);
    expect(cycle!.status).toBe("FAILED");
    expect(cycle!.failReason).toBe("Agent timeout");
  });

  it("lists cycles for merchant", async () => {
    const { merchant } = await setup();
    await createGrowthCycle(merchant.id);
    await createGrowthCycle(merchant.id);

    const cycles = await getGrowthCyclesForMerchant(merchant.id);
    expect(cycles).toHaveLength(2);
  });
});
