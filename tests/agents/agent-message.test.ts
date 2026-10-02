import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { createAgentMessage, getMessagesForCycle, getMessagesBetweenAgents } from "@/lib/agents/agent-message";

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
    data: { email: `msg-${Date.now()}@test.com`, password: "hash", name: "Test", role: "MERCHANT" },
  });
  const merchant = await prisma.merchant.create({
    data: { ownerId: user.id, businessName: "Test Merchant", email: `msg-${Date.now()}@test.com` },
  });
  return { user, merchant };
}

describe("agent messaging", () => {
  beforeEach(async () => await cleanup());

  it("creates and retrieves messages", async () => {
    const { merchant } = await setup();

    const msgId = await createAgentMessage({
      merchantId: merchant.id,
      senderAgent: "OPPORTUNITY",
      receiverAgent: "STRATEGY",
      messageType: "PROPOSAL",
      payload: { opportunities: ["opp1", "opp2"] },
    });

    expect(msgId).toBeDefined();

    const messages = await getMessagesForCycle(merchant.id, "");
    expect(messages.length).toBeGreaterThanOrEqual(1);
  });

  it("filters messages between specific agents", async () => {
    const { merchant } = await setup();

    await createAgentMessage({
      merchantId: merchant.id,
      senderAgent: "OPPORTUNITY",
      receiverAgent: "STRATEGY",
      messageType: "PROPOSAL",
      payload: { data: "test" },
    });

    await createAgentMessage({
      merchantId: merchant.id,
      senderAgent: "STRATEGY",
      receiverAgent: "DECISION",
      messageType: "PROPOSAL",
      payload: { data: "test2" },
    });

    const msgs = await getMessagesBetweenAgents(
      merchant.id,
      "",
      "OPPORTUNITY",
      "STRATEGY"
    );
    expect(msgs).toHaveLength(1);
    expect(msgs[0].payload.data).toBe("test");
  });
});
