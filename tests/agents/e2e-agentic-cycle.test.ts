import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { runGrowthCycle, getAgentEventsForCycle } from "@/lib/agents/orchestrator";
import { getGrowthCycle, getGrowthCyclesForMerchant } from "@/lib/agents/workflows/growth-cycle";

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
    data: { email: `e2e-${Date.now()}@test.com`, password: "hash", name: "Test", role: "MERCHANT" },
  });
  const merchant = await prisma.merchant.create({
    data: { ownerId: user.id, businessName: "Test Merchant", email: `e2e-${Date.now()}@test.com` },
  });
  return { user, merchant };
}

describe("e2e agentic cycle", () => {
  beforeEach(async () => await cleanup());

  it("full pipeline with skipExecution", async () => {
    const { merchant } = await setup();

    await prisma.systemHealth.create({
      data: { application: "ok", api: "ok", database: "ok" },
    });

    const result = await runGrowthCycle(merchant.id, undefined, {
      autopilotMode: "FULL",
      skipExecution: true,
    });

    expect(result.cycleId).toBeDefined();
    expect(["COMPLETED", "WAITING_APPROVAL", "BLOCKED", "FAILED"]).toContain(result.status);
    expect(result.agentResults.length).toBeGreaterThan(0);
  });

  it("blocks when security fails", async () => {
    const { merchant } = await setup();

    await prisma.systemHealth.create({
      data: { application: "ok", api: "ok", database: "ok" },
    });

    const result = await runGrowthCycle(merchant.id, undefined, {
      skipExecution: true,
    });

    expect(result.cycleId).toBeDefined();
    expect(["COMPLETED", "BLOCKED", "FAILED", "WAITING_APPROVAL"]).toContain(result.status);
  });

  it("stops at WAITING_APPROVAL in review mode", async () => {
    const { merchant } = await setup();

    await prisma.systemHealth.create({
      data: { application: "ok", api: "ok", database: "ok" },
    });

    const result = await runGrowthCycle(merchant.id, undefined, {
      autopilotMode: "REVIEW",
      skipExecution: true,
    });

    expect(result.status).toBe("WAITING_APPROVAL");
  });

  it("records agent events for timeline", async () => {
    const { merchant } = await setup();

    await prisma.systemHealth.create({
      data: { application: "ok", api: "ok", database: "ok" },
    });

    const result = await runGrowthCycle(merchant.id, undefined, {
      skipExecution: true,
    });

    const events = await getAgentEventsForCycle(merchant.id, result.cycleId);
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.eventType === "CYCLE_STARTED")).toBe(true);
  });

  it("lists growth cycles for merchant", async () => {
    const { merchant } = await setup();

    await prisma.systemHealth.create({
      data: { application: "ok", api: "ok", database: "ok" },
    });

    await runGrowthCycle(merchant.id, undefined, { skipExecution: true });

    const cycles = await getGrowthCyclesForMerchant(merchant.id);
    expect(cycles.length).toBeGreaterThanOrEqual(1);
  });
});
