import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";

async function cleanup() {
  await prisma.$executeRawUnsafe(`PRAGMA foreign_keys=OFF;DELETE FROM reconciliation;DELETE FROM webhookEvent;DELETE FROM executionAttempt;DELETE FROM execution;DELETE FROM systemHealth;DELETE FROM opportunity;DELETE FROM strategyExperiment;DELETE FROM simulation;DELETE FROM decision;DELETE FROM decisionOutcome;DELETE FROM campaign;DELETE FROM agent;DELETE FROM auditEvent;DELETE FROM auditLog;DELETE FROM governanceDecision;DELETE FROM actionRequest;DELETE FROM policyRule;DELETE FROM policy;DELETE FROM customer;DELETE FROM orderItem;DELETE FROM payment;DELETE FROM "order";DELETE FROM product;DELETE FROM merchant;DELETE FROM user;PRAGMA foreign_keys=ON;`);
  await prisma.systemHealth.create({ data: { application: "ok", api: "ok", database: "ok", environment: "test", lastCheckedAt: new Date() } });
}

async function setup() {
  const user = await prisma.user.create({ data: { email: `${Date.now()}-e2e@example.com`, password: "hash", name: "Test", role: "MERCHANT" } });
  const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: `${Date.now()}-Test Merchant`, email: `${Date.now()}-e2e@example.com` } });
  return { user, merchant };
}

describe("e2e execution flow", () => {
  beforeEach(async () => await cleanup());
  afterEach(async () => await cleanup());

  it("complete execution lifecycle", async () => {
    const { merchant } = await setup();

    const actionRequest = await prisma.actionRequest.create({
      data: { merchantId: merchant.id, opportunityType: "DISCOUNT", strategyId: "strat-1", strategyName: "Test", recommendedScenario: "CONSERVATIVE", decisionScore: 80, riskLevel: "LOW", confidence: 90, status: "APPROVED", amountMinor: 5000 },
    });

    const governanceDecision = await prisma.governanceDecision.create({
      data: { merchantId: merchant.id, actionRequestId: actionRequest.id, decision: "ALLOW", decisionReason: "Test", riskLevel: "LOW", confidence: 90, status: "APPROVED", approvedAt: new Date() },
    });

    const execution = await prisma.execution.create({
      data: {
        merchantId: merchant.id,
        governanceDecisionId: governanceDecision.id,
        actionRequestId: actionRequest.id,
        actionType: "DISCOUNT",
        strategyId: "strat-1",
        amountMinor: 5000,
        status: "CREATED",
      },
    });

    expect(execution.status).toBe("CREATED");

    const { runExecutionPreflight } = await import("@/lib/execution/preflight");
    const preflight = await runExecutionPreflight(execution.id, merchant.id);
    expect(preflight.status).toBe("READY");

    await prisma.execution.update({ where: { id: execution.id }, data: { status: "PREFLIGHT" } });

    await prisma.executionAttempt.create({
      data: { executionId: execution.id, attemptNumber: 1, provider: "razorpay", status: "PENDING" },
    });

    const { reconcileExecution } = await import("@/lib/execution/reconciliation");
    const reconciliation = await reconcileExecution(execution.id);
    expect(reconciliation).not.toBeNull();
  });

  it("blocks execution after emergency stop", async () => {
    const { merchant } = await setup();

    const actionRequest = await prisma.actionRequest.create({
      data: { merchantId: merchant.id, opportunityType: "DISCOUNT", strategyId: "strat-1", strategyName: "Test", recommendedScenario: "CONSERVATIVE", decisionScore: 80, riskLevel: "LOW", confidence: 90, status: "APPROVED", amountMinor: 1000 },
    });

    const governanceDecision = await prisma.governanceDecision.create({
      data: { merchantId: merchant.id, actionRequestId: actionRequest.id, decision: "ALLOW", decisionReason: "Test", riskLevel: "LOW", confidence: 90, status: "APPROVED", approvedAt: new Date() },
    });

    await prisma.systemHealth.deleteMany();
    await prisma.systemHealth.create({
      data: { application: "ok", api: "STOPPED", database: "ok", lastCheckedAt: new Date() },
    });

    const execution = await prisma.execution.create({
      data: {
        merchantId: merchant.id,
        governanceDecisionId: governanceDecision.id,
        actionRequestId: actionRequest.id,
        actionType: "DISCOUNT",
        strategyId: "strat-1",
        amountMinor: 1000,
        status: "CREATED",
      },
    });

    const { runExecutionPreflight } = await import("@/lib/execution/preflight");
    const result = await runExecutionPreflight(execution.id, merchant.id);
    expect(result.status).toBe("EMERGENCY_STOP");
  });

  it("blocks execution when automation paused", async () => {
    const { merchant } = await setup();

    const actionRequest = await prisma.actionRequest.create({
      data: { merchantId: merchant.id, opportunityType: "DISCOUNT", strategyId: "strat-1", strategyName: "Test", recommendedScenario: "CONSERVATIVE", decisionScore: 80, riskLevel: "LOW", confidence: 90, status: "APPROVED", amountMinor: 1000 },
    });

    const governanceDecision = await prisma.governanceDecision.create({
      data: { merchantId: merchant.id, actionRequestId: actionRequest.id, decision: "ALLOW", decisionReason: "Test", riskLevel: "LOW", confidence: 90, status: "APPROVED", approvedAt: new Date() },
    });

    await prisma.systemHealth.deleteMany();
    await prisma.systemHealth.create({
      data: { application: "ok", api: "ok", database: "ok", lastCheckedAt: new Date() },
    });

    await prisma.policy.create({
      data: { merchantId: merchant.id, name: "AUTOMATION_PAUSED", conditionType: "CUSTOM", conditionOperator: "EQ", conditionValue: 1, action: "BLOCK", priority: 0, isActive: true, version: 1 },
    });

    const execution = await prisma.execution.create({
      data: {
        merchantId: merchant.id,
        governanceDecisionId: governanceDecision.id,
        actionRequestId: actionRequest.id,
        actionType: "DISCOUNT",
        strategyId: "strat-1",
        amountMinor: 1000,
        status: "CREATED",
      },
    });

    const { runExecutionPreflight } = await import("@/lib/execution/preflight");
    const result = await runExecutionPreflight(execution.id, merchant.id);
    expect(result.status).toBe("AUTOMATION_PAUSED");
  });
});

describe("retry classification", () => {
  it("marks network errors as safe to retry", async () => {
    const { classifyRetry } = await import("@/lib/execution/preflight");
    expect(classifyRetry("TIMEOUT")).toBe("SAFE_TO_RETRY");
    expect(classifyRetry("NETWORK_ERROR")).toBe("SAFE_TO_RETRY");
  });

  it("marks validation errors as not safe to retry", async () => {
    const { classifyRetry } = await import("@/lib/execution/preflight");
    expect(classifyRetry("VALIDATION_ERROR")).toBe("NOT_SAFE_TO_RETRY");
    expect(classifyRetry("AUTH_ERROR")).toBe("NOT_SAFE_TO_RETRY");
  });

  it("marks unknown errors as unknown", async () => {
    const { classifyRetry } = await import("@/lib/execution/preflight");
    expect(classifyRetry("SOME_WEIRD_CODE")).toBe("UNKNOWN");
    expect(classifyRetry(null)).toBe("UNKNOWN");
  });
});
