import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";

async function cleanup() {
  await prisma.$executeRawUnsafe(`PRAGMA foreign_keys=OFF;DELETE FROM reconciliation;DELETE FROM webhookEvent;DELETE FROM executionAttempt;DELETE FROM execution;DELETE FROM systemHealth;DELETE FROM opportunity;DELETE FROM strategyExperiment;DELETE FROM simulation;DELETE FROM decision;DELETE FROM decisionOutcome;DELETE FROM campaign;DELETE FROM agent;DELETE FROM auditEvent;DELETE FROM auditLog;DELETE FROM governanceDecision;DELETE FROM actionRequest;DELETE FROM policyRule;DELETE FROM policy;DELETE FROM customer;DELETE FROM orderItem;DELETE FROM payment;DELETE FROM "order";DELETE FROM product;DELETE FROM merchant;DELETE FROM user;PRAGMA foreign_keys=ON;`);
  await prisma.systemHealth.create({ data: { application: "ok", api: "ok", database: "ok", environment: "test", lastCheckedAt: new Date() } });
}

async function setup() {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const user = await prisma.user.create({ data: { email: `${Date.now()}-${attempt}-sec@example.com`, password: "hash", name: "Test", role: "MERCHANT" } });
      const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: `${Date.now()}-Test Merchant`, email: `${Date.now()}-${attempt}-sec@example.com` } });
      return { user, merchant };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < 2) await new Promise(r => setTimeout(r, 50));
    }
  }
  throw lastError;
}

describe("execution security", () => {
  beforeEach(async () => await cleanup());
  afterEach(async () => await cleanup());

  it("prevents execution with nonexistent governance decision", async () => {
    const { merchant } = await setup();
    const execution = await prisma.execution.create({
      data: {
        merchantId: merchant.id,
        governanceDecisionId: "nonexistent-gd",
        actionRequestId: "nonexistent-ar",
        actionType: "DISCOUNT",
        strategyId: "strat-1",
        amountMinor: 1000,
        status: "CREATED",
      },
    });

    const { runExecutionPreflight } = await import("@/lib/execution/preflight");
    const result = await runExecutionPreflight(execution.id, merchant.id);
    expect(result.status).toBe("GOVERNANCE_INVALID");
  });

  it("prevents execution with unapproved governance decision", async () => {
    const { merchant } = await setup();
    const user = await prisma.user.create({ data: { email: `${Date.now()}-app@example.com`, password: "hash", name: "App", role: "MERCHANT" } });
    const appMerchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: `${Date.now()}-App Merchant`, email: `${Date.now()}-app@example.com` } });
    const actionRequest = await prisma.actionRequest.create({
      data: { merchantId: merchant.id, opportunityType: "DISCOUNT", strategyId: "strat-1", strategyName: "Test", recommendedScenario: "CONSERVATIVE", decisionScore: 80, riskLevel: "LOW", confidence: 90, status: "APPROVED", amountMinor: 1000 },
    });
    const governanceDecision = await prisma.governanceDecision.create({
      data: { merchantId: merchant.id, actionRequestId: actionRequest.id, decision: "ALLOW", decisionReason: "Test", riskLevel: "LOW", confidence: 90, status: "PENDING" },
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
    expect(result.status).toBe("GOVERNANCE_INVALID");
  });

  it("blocks execution in UNKNOWN state", async () => {
    const { merchant } = await setup();
    const execution = await prisma.execution.create({
      data: {
        merchantId: merchant.id,
        governanceDecisionId: "fake-gd",
        actionRequestId: "fake-ar",
        actionType: "DISCOUNT",
        strategyId: "strat-1",
        amountMinor: 1000,
        status: "UNKNOWN",
      },
    });

    const { runExecutionPreflight } = await import("@/lib/execution/preflight");
    const result = await runExecutionPreflight(execution.id, merchant.id);
    expect(result.status).toBe("BLOCKED");
    expect(result.reason).toBe("UNKNOWN_STATE_REQUIRES_RECONCILIATION");
  });

  it("blocks duplicate execution attempts", async () => {
    const { merchant } = await setup();
    const actionRequest = await prisma.actionRequest.create({
      data: { merchantId: merchant.id, opportunityType: "DISCOUNT", strategyId: "strat-1", strategyName: "Test", recommendedScenario: "CONSERVATIVE", decisionScore: 80, riskLevel: "LOW", confidence: 90, status: "APPROVED", amountMinor: 1000 },
    });
    const governanceDecision = await prisma.governanceDecision.create({
      data: { merchantId: merchant.id, actionRequestId: actionRequest.id, decision: "ALLOW", decisionReason: "Test", riskLevel: "LOW", confidence: 90, status: "APPROVED", approvedAt: new Date() },
    });

    await prisma.systemHealth.create({
      data: { application: "ok", api: "ok", database: "ok" },
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

    await prisma.executionAttempt.create({
      data: { executionId: execution.id, attemptNumber: 1, provider: "razorpay", status: "ACCEPTED" },
    });

    const { runExecutionPreflight } = await import("@/lib/execution/preflight");
    const result = await runExecutionPreflight(execution.id, merchant.id);
    expect(result.status).toBe("ALREADY_EXECUTED");
  });
});

describe("webhook security", () => {
  it("rejects invalid webhook signature", async () => {
    const { verifyRazorpayWebhookSignature } = await import("@/lib/execution/providers/razorpay/signatures");
    const result = verifyRazorpayWebhookSignature("test-body", "invalid-sig", "test-secret");
    expect(result).toBe(false);
  });

  it("accepts valid webhook signature", async () => {
    const { verifyRazorpayWebhookSignature, generateRazorpaySignature } = await import("@/lib/execution/providers/razorpay/signatures");
    const body = "test-body";
    const secret = "test-secret";
    const sig = generateRazorpaySignature(body, secret);
    const result = verifyRazorpayWebhookSignature(body, sig, secret);
    expect(result).toBe(true);
  });
});

describe("money validation", () => {
  it("rejects zero amount", async () => {
    const { validateAmount } = await import("@/lib/execution/providers/razorpay/config");
    expect(() => validateAmount(0)).toThrow("amountMinor must be positive");
  });

  it("rejects negative amount", async () => {
    const { validateAmount } = await import("@/lib/execution/providers/razorpay/config");
    expect(() => validateAmount(-100)).toThrow("amountMinor must be positive");
  });

  it("rejects unsafe integer", async () => {
    const { validateAmount } = await import("@/lib/execution/providers/razorpay/config");
    expect(() => validateAmount(100.5)).toThrow("amountMinor must be an integer");
  });

  it("accepts valid amount", async () => {
    const { validateAmount } = await import("@/lib/execution/providers/razorpay/config");
    expect(() => validateAmount(100)).not.toThrow();
    expect(() => validateAmount(50000)).not.toThrow();
    expect(() => validateAmount(99999999)).not.toThrow();
  });
});
