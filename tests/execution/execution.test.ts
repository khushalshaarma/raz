import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";

async function cleanup() {
  await prisma.$executeRawUnsafe(`PRAGMA foreign_keys=OFF;DELETE FROM reconciliation;DELETE FROM webhookEvent;DELETE FROM executionAttempt;DELETE FROM execution;DELETE FROM systemHealth;DELETE FROM opportunity;DELETE FROM strategyExperiment;DELETE FROM simulation;DELETE FROM decision;DELETE FROM decisionOutcome;DELETE FROM campaign;DELETE FROM agent;DELETE FROM auditEvent;DELETE FROM auditLog;DELETE FROM governanceDecision;DELETE FROM actionRequest;DELETE FROM policyRule;DELETE FROM policy;DELETE FROM customer;DELETE FROM orderItem;DELETE FROM payment;DELETE FROM "order";DELETE FROM product;DELETE FROM merchant;DELETE FROM user;PRAGMA foreign_keys=ON;`);
}

async function setup() {
  const user = await prisma.user.create({ data: { email: `${Date.now()}-exec@example.com`, password: "hash", name: "Test", role: "MERCHANT" } });
  const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: `${Date.now()}-Test Merchant`, email: `${Date.now()}-exec@example.com` } });
  return { user, merchant };
}

describe("execution types", () => {
  it("exports correct type definitions", async () => {
    const types = await import("@/lib/execution/types");
    expect(types).toBeDefined();
  });
});

describe("preflight", () => {
  beforeEach(async () => await cleanup());
  afterEach(async () => await cleanup());

  it("returns BLOCKED when execution not found", async () => {
    const { runExecutionPreflight } = await import("@/lib/execution/preflight");
    const result = await runExecutionPreflight("nonexistent-id", "merchant-1");
    expect(result.status).toBe("BLOCKED");
    expect(result.reason).toBe("EXECUTION_NOT_FOUND");
  });

  it("returns BLOCKED when merchant isolation violated", async () => {
    const { merchant } = await setup();
    const execution = await prisma.execution.create({
      data: {
        merchantId: merchant.id,
        governanceDecisionId: "fake-gd",
        actionRequestId: "fake-ar",
        actionType: "DISCOUNT",
        strategyId: "strat-1",
        amountMinor: 1000,
        status: "CREATED",
      },
    });
    const { runExecutionPreflight } = await import("@/lib/execution/preflight");
    const result = await runExecutionPreflight(execution.id, "wrong-merchant");
    expect(result.status).toBe("BLOCKED");
    expect(result.reason).toBe("MERCHANT_ISOLATION_VIOLATION");
  });
});

describe("idempotency", () => {
  beforeEach(async () => await cleanup());
  afterEach(async () => await cleanup());

  it("creates idempotency record successfully", async () => {
    const { merchant } = await setup();
    const { createExecutionIdempotencyRecord } = await import("@/lib/execution/idempotency");
    const executionId = crypto.randomUUID();
    const result = await createExecutionIdempotencyRecord(merchant.id, executionId, "key-1");
    expect(result.isNew).toBe(true);
    expect(result.executionId).toBe(executionId);
  });

  it("detects duplicate idempotency key", async () => {
    const { merchant } = await setup();
    const { createExecutionIdempotencyRecord } = await import("@/lib/execution/idempotency");
    const executionId = crypto.randomUUID();
    await createExecutionIdempotencyRecord(merchant.id, executionId, "key-dup");
    const result = await createExecutionIdempotencyRecord(merchant.id, executionId, "key-dup");
    expect(result.isNew).toBe(false);
  });

  it("throws error for missing fields", async () => {
    const { createExecutionIdempotencyRecord } = await import("@/lib/execution/idempotency");
    await expect(createExecutionIdempotencyRecord("", "d1", "r1")).rejects.toThrow("Missing required idempotency fields");
  });
});

describe("failure classification", () => {
  it("classifies network errors as safe to retry", async () => {
    const { classifyFailure } = await import("@/lib/execution/failure");
    const result = classifyFailure("NETWORK_ERROR");
    expect(result.type).toBe("NETWORK_ERROR");
    expect(result.retryAllowed).toBe(true);
  });

  it("classifies validation errors as not safe to retry", async () => {
    const { classifyFailure } = await import("@/lib/execution/failure");
    const result = classifyFailure("VALIDATION_ERROR");
    expect(result.type).toBe("VALIDATION_ERROR");
    expect(result.retryAllowed).toBe(false);
  });

  it("classifies unknown codes", async () => {
    const { classifyFailure } = await import("@/lib/execution/failure");
    const result = classifyFailure("SOME_UNKNOWN_CODE");
    expect(result.type).toBe("UNKNOWN");
  });

  it("handles null failure code", async () => {
    const { classifyFailure } = await import("@/lib/execution/failure");
    const result = classifyFailure(null);
    expect(result.type).toBe("UNKNOWN");
  });
});

describe("merchant isolation", () => {
  beforeEach(async () => await cleanup());
  afterEach(async () => await cleanup());

  it("prevents cross-merchant execution access", async () => {
    const { merchant } = await setup();
    const otherUser = await prisma.user.create({ data: { email: `${Date.now()}-other@example.com`, password: "hash", name: "Other", role: "MERCHANT" } });
    const otherMerchant = await prisma.merchant.create({ data: { ownerId: otherUser.id, businessName: `${Date.now()}-Other Merchant`, email: `${Date.now()}-other@example.com` } });

    const execution = await prisma.execution.create({
      data: {
        merchantId: merchant.id,
        governanceDecisionId: "fake-gd",
        actionRequestId: "fake-ar",
        actionType: "DISCOUNT",
        strategyId: "strat-1",
        amountMinor: 1000,
        status: "CREATED",
      },
    });

    const { runExecutionPreflight } = await import("@/lib/execution/preflight");
    const result = await runExecutionPreflight(execution.id, otherMerchant.id);
    expect(result.status).toBe("BLOCKED");
    expect(result.reason).toBe("MERCHANT_ISOLATION_VIOLATION");
  });
});

describe("reconciliation", () => {
  beforeEach(async () => await cleanup());
  afterEach(async () => await cleanup());

  it("returns null for nonexistent execution", async () => {
    const { reconcileExecution } = await import("@/lib/execution/reconciliation");
    const result = await reconcileExecution("nonexistent-id");
    expect(result).toBeNull();
  });
});

describe("config validation", () => {
  it("validates amount is integer", async () => {
    const { validateAmount } = await import("@/lib/execution/providers/razorpay/config");
    expect(() => validateAmount(100.5)).toThrow("amountMinor must be an integer");
  });

  it("validates amount is positive", async () => {
    const { validateAmount } = await import("@/lib/execution/providers/razorpay/config");
    expect(() => validateAmount(-100)).toThrow("amountMinor must be positive");
  });

  it("validates currency is INR", async () => {
    const { validateCurrency } = await import("@/lib/execution/providers/razorpay/config");
    expect(() => validateCurrency("USD")).toThrow("Unsupported currency");
  });

  it("accepts valid INR currency", async () => {
    const { validateCurrency } = await import("@/lib/execution/providers/razorpay/config");
    expect(() => validateCurrency("INR")).not.toThrow();
  });
});
