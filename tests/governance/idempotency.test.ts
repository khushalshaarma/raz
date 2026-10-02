import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { createIdempotencyRecord, isDuplicateRequest } from "@/lib/governance/idempotency";

async function cleanup() {
  await prisma.$executeRawUnsafe(`PRAGMA foreign_keys=OFF;DELETE FROM systemHealth;DELETE FROM opportunity;DELETE FROM strategyExperiment;DELETE FROM simulation;DELETE FROM decision;DELETE FROM decisionOutcome;DELETE FROM campaign;DELETE FROM agent;DELETE FROM auditEvent;DELETE FROM auditLog;DELETE FROM governanceDecision;DELETE FROM actionRequest;DELETE FROM policyRule;DELETE FROM policy;DELETE FROM customer;DELETE FROM orderItem;DELETE FROM payment;DELETE FROM "order";DELETE FROM product;DELETE FROM merchant;DELETE FROM user;PRAGMA foreign_keys=ON;`);
}

async function setupMerchant(merchantId: string) {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const user = await prisma.user.create({ data: { email: `${Date.now()}-${merchantId}@example.com`, password: "hash", name: merchantId, role: "MERCHANT" } });
      const merchant = await prisma.merchant.create({ data: { ownerId: user.id, businessName: merchantId, email: `${Date.now()}-${merchantId}@example.com` } });
      return merchant;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < 2) await new Promise(r => setTimeout(r, 50));
    }
  }
  throw lastError;
}

describe("idempotency", () => {
  beforeEach(async () => cleanup());
  afterEach(async () => cleanup());

  describe("same request twice", () => {
    it("returns ONE decision for same idempotency key", async () => {
      const merchant = await setupMerchant("idem1");
      const decisionId = crypto.randomUUID();
      const result1 = await createIdempotencyRecord("key-1", merchant.id, decisionId, "req-1");
      expect(result1.isNew).toBe(true);
      const result2 = await createIdempotencyRecord("key-1", merchant.id, decisionId, "req-1");
      expect(result2.isNew).toBe(false);
      expect(result2.wasRetrieved).toBe(true);
      expect(result2.governanceDecisionId).toBe(result1.governanceDecisionId);
    });
  });

  describe("different idempotency key", () => {
    it("returns separate request for different idempotency key", async () => {
      const merchant = await setupMerchant("idem2");
      const result1 = await createIdempotencyRecord("key-a", merchant.id, "decision-a", "req-a");
      const result2 = await createIdempotencyRecord("key-b", merchant.id, "decision-b", "req-b");
      expect(result1.isNew).toBe(true);
      expect(result2.isNew).toBe(true);
      expect(result1.governanceDecisionId).not.toBe(result2.governanceDecisionId);
    });
  });

  describe("isDuplicateRequest", () => {
    it("returns true when decision already exists", async () => {
      const merchant = await setupMerchant("idem3");
      const decisionId = crypto.randomUUID();
      await createIdempotencyRecord("dup-key", merchant.id, decisionId, "req-1");
      const isDup = await isDuplicateRequest("dup-key", merchant.id, decisionId);
      expect(isDup).toBe(true);
    });
    it("returns false when decision does not exist", async () => {
      const merchant = await setupMerchant("idem4");
      const isDup = await isDuplicateRequest("non-dup", merchant.id, crypto.randomUUID());
      expect(isDup).toBe(false);
    });
  });

  describe("missing fields", () => {
    it("throws error when idempotency fields are missing", async () => {
      await expect(createIdempotencyRecord("", "m1", "d1", "r1")).rejects.toThrow("Missing required idempotency fields");
    });
  });
});
