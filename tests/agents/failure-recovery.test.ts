import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { failGrowthCycle, blockGrowthCycle, getGrowthCycle, createGrowthCycle } from "@/lib/agents/workflows/growth-cycle";
import { failAgentRun, createAgentRun, startAgentRun } from "@/lib/agents/agent-result";

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
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const user = await prisma.user.create({
        data: { email: `fail-${Date.now()}-${attempt}@test.com`, password: "hash", name: "Test", role: "MERCHANT" },
      });
      const merchant = await prisma.merchant.create({
        data: { ownerId: user.id, businessName: "Test Merchant", email: `fail-${Date.now()}-${attempt}@test.com` },
      });
      return { user, merchant };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < 2) await new Promise(r => setTimeout(r, 50));
    }
  }
  throw lastError;
}

describe("failure recovery", () => {
  beforeEach(async () => await cleanup());

  it("failGrowthCycle sets status to FAILED", async () => {
    const { merchant } = await setup();
    const cycleId = await createGrowthCycle(merchant.id);

    await failGrowthCycle(cycleId, "Agent timeout");

    const cycle = await getGrowthCycle(cycleId);
    if (cycle) {
      expect(cycle.status).toBe("FAILED");
      expect(cycle.failReason).toBe("Agent timeout");
      expect(cycle.completedAt).not.toBeNull();
    }
  });

  it("blockGrowthCycle sets status to BLOCKED", async () => {
    const { merchant } = await setup();
    const cycleId = await createGrowthCycle(merchant.id);

    await blockGrowthCycle(cycleId, "Security violation");

    const cycle = await getGrowthCycle(cycleId);
    expect(cycle!.status).toBe("BLOCKED");
    expect(cycle!.blockReason).toBe("Security violation");
    expect(cycle!.completedAt).not.toBeNull();
  });

  it("failGrowthCycle does not throw when cycle does not exist", async () => {
    await expect(failGrowthCycle("non-existent-id", "test")).resolves.not.toThrow();
  });

  it("blockGrowthCycle does not throw when cycle does not exist", async () => {
    await expect(blockGrowthCycle("non-existent-id", "test")).resolves.not.toThrow();
  });

  it("failed cycle can be restarted", async () => {
    const { merchant } = await setup();
    const cycleId = await createGrowthCycle(merchant.id);
    await failGrowthCycle(cycleId, "Test failure");

    const cycle = await getGrowthCycle(cycleId);
    expect(cycle!.status).toBe("FAILED");

    const { canTransitionTo } = await import("@/lib/agents/workflows/growth-cycle");
    expect(canTransitionTo("FAILED", "CREATED")).toBe(true);
  });

  it("blocked cycle can be restarted", async () => {
    const { merchant } = await setup();
    const cycleId = await createGrowthCycle(merchant.id);
    await blockGrowthCycle(cycleId, "Test block");

    const { canTransitionTo } = await import("@/lib/agents/workflows/growth-cycle");
    expect(canTransitionTo("BLOCKED", "CREATED")).toBe(true);
  });

  it("agent run failure is recorded", async () => {
    const { merchant } = await setup();
    const runId = await createAgentRun({
      merchantId: merchant.id,
      agentType: "OPPORTUNITY",
      input: {},
    });
    await startAgentRun(runId);
    await failAgentRun(runId, "DB connection lost");

    const run = await prisma.agentRun.findUnique({ where: { id: runId } });
    expect(run!.status).toBe("FAILED");
    expect(run!.error).toBe("DB connection lost");
    expect(run!.completedAt).not.toBeNull();
  });
});
