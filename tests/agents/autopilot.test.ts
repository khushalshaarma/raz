import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { getAutopilotConfig, updateAutopilotConfig, stopAutopilot, isAutopilotActive, checkAutopilotLimits } from "@/lib/agents/autopilot";

async function cleanup() {
  await prisma.$executeRawUnsafe(`
    PRAGMA foreign_keys=OFF;
    DELETE FROM autopilotConfig;
    DELETE FROM agentMemory;
    DELETE FROM agentProposal;
    DELETE FROM agentMessage;
    DELETE FROM agentTask;
    DELETE FROM agentRun;
    DELETE FROM agentEvent;
    DELETE FROM growthCycle;
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
    data: { email: `ap-${Date.now()}@test.com`, password: "hash", name: "Test", role: "MERCHANT" },
  });
  const merchant = await prisma.merchant.create({
    data: { ownerId: user.id, businessName: "Test Merchant", email: `ap-${Date.now()}@test.com` },
  });
  return { user, merchant };
}

describe("autopilot", () => {
  beforeEach(async () => await cleanup());

  it("returns default config when none exists", async () => {
    const { merchant } = await setup();
    const config = await getAutopilotConfig(merchant.id);
    expect(config).not.toBeNull();
    expect(config!.mode).toBe("OFF");
    expect(config!.isActive).toBe(false);
  });

  it("updates autopilot config", async () => {
    const { merchant } = await setup();
    await updateAutopilotConfig(merchant.id, { mode: "FULL", isActive: true });

    const config = await getAutopilotConfig(merchant.id);
    expect(config!.mode).toBe("FULL");
    expect(config!.isActive).toBe(true);
  });

  it("stops autopilot", async () => {
    const { merchant } = await setup();
    await updateAutopilotConfig(merchant.id, { mode: "FULL", isActive: true });
    await stopAutopilot(merchant.id);

    const config = await getAutopilotConfig(merchant.id);
    expect(config!.mode).toBe("OFF");
    expect(config!.isActive).toBe(false);
  });

  it("checks if autopilot is active", async () => {
    const { merchant } = await setup();
    expect(await isAutopilotActive(merchant.id)).toBe(false);

    await updateAutopilotConfig(merchant.id, { mode: "FULL", isActive: true });
    expect(await isAutopilotActive(merchant.id)).toBe(true);
  });

  it("checks autopilot limits", async () => {
    const { merchant } = await setup();
    const result = await checkAutopilotLimits(merchant.id, 5000);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("OFF");

    await updateAutopilotConfig(merchant.id, { mode: "FULL", isActive: true });
    const result2 = await checkAutopilotLimits(merchant.id, 5000);
    expect(result2.allowed).toBe(true);
  });
});
