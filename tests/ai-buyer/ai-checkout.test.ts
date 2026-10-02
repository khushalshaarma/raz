import { describe, it, expect, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createBuyerSession } from "@/lib/ai-buyer/buyer";
import { createCheckout, confirmCheckout } from "@/lib/ai-buyer/checkout";
import { getRazorpayConfig } from "@/lib/execution/providers/razorpay/config";
import { createRazorpayOrder } from "@/lib/execution/providers/razorpay/orders";

vi.mock("@/lib/execution/providers/razorpay/config", () => ({
  getRazorpayConfig: vi.fn(() => ({ keyId: "rzp_test_mock", keySecret: "secret", webhookSecret: "whsec", mode: "test" as const })),
}));

vi.mock("@/lib/execution/providers/razorpay/orders", () => ({
  createRazorpayOrder: vi.fn(() => Promise.resolve({ id: "razorpay_order_mock", amount: 100, currency: "INR", status: "created", created_at: Date.now() })),
}));

let URBAN_MERCHANT_ID: string | null = null;
let TECH_MERCHANT_ID: string | null = null;

async function getMerchantIds() {
  if (URBAN_MERCHANT_ID && TECH_MERCHANT_ID) return { urban: URBAN_MERCHANT_ID, tech: TECH_MERCHANT_ID };
  const merchants = await prisma.merchant.findMany({ select: { id: true, businessName: true } });
  URBAN_MERCHANT_ID = merchants.find((m) => m.businessName === "UrbanWear")?.id || merchants[0]?.id || "";
  TECH_MERCHANT_ID = merchants.find((m) => m.businessName === "TechStore")?.id || merchants[1]?.id || "";
  return { urban: URBAN_MERCHANT_ID, tech: TECH_MERCHANT_ID };
}

async function createTestProposal(overrides: { status?: string; merchantId?: string } = {}): Promise<string | null> {
  const { urban, tech } = await getMerchantIds();
  const merchantId = overrides.merchantId || urban;
  const result = await createBuyerSession({
    merchantId,
    query: "Find running shoes under ₹5000",
    quantity: 1,
  });
  if (!result.success || !result.proposal) return null;
  const actionRequest = await prisma.actionRequest.findFirst({
    where: { strategyId: result.proposal.id, merchantId },
  });
  if (!actionRequest) return null;
  if (overrides.status) {
    await prisma.actionRequest.update({ where: { id: actionRequest.id }, data: { status: overrides.status as any } });
  }
  return actionRequest.id;
}

async function createApprovedProposal(merchantId: string): Promise<string | null> {
  return createTestProposal({ status: "APPROVED", merchantId });
}

async function createPendingProposal(merchantId: string): Promise<string | null> {
  return createTestProposal({ status: "PENDING", merchantId });
}

async function createSucceededExecution(merchantId: string, proposalId: string): Promise<string> {
  const governanceDecision = await prisma.governanceDecision.create({
    data: {
      merchantId,
      actionRequestId: proposalId,
      decision: "ALLOW",
      decisionReason: "Auto-approved for test",
      riskLevel: "LOW",
      confidence: 90,
      status: "APPROVED",
    },
  });
  const execution = await prisma.execution.create({
    data: {
      id: "succeeded-checkout",
      merchantId,
      governanceDecisionId: governanceDecision.id,
      actionRequestId: proposalId,
      actionType: "AI_BUYER_PURCHASE",
      strategyId: proposalId,
      amountMinor: 10000,
      currency: "INR",
      status: "SUCCEEDED",
      provider: "razorpay",
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  return execution.id;
}

describe("AI Buyer checkout", () => {
  it("rejects checkout for non-existent proposal", async () => {
    const result = await createCheckout({ proposalId: "nonexistent", merchantId: "merchant-1" });
    expect(result.success).toBe(false);
    expect(result.status).toBe("NOT_FOUND");
  });

  it("rejects checkout for unapproved proposal", async () => {
    const { urban } = await getMerchantIds();
    const proposalId = await createPendingProposal(urban);
    expect(proposalId).not.toBeNull();
    if (!proposalId) { expect(true).toBe(false); return; }
    const result = await createCheckout({ proposalId, merchantId: urban });
    expect(result.success).toBe(false);
    expect(result.status).toBe("NOT_APPROVED");
  });

  it("rejects checkout for merchant isolation violation", async () => {
    const { urban, tech } = await getMerchantIds();
    const proposalId = await createApprovedProposal(urban);
    expect(proposalId).not.toBeNull();
    if (!proposalId) { expect(true).toBe(false); return; }
    const result = await createCheckout({ proposalId, merchantId: tech });
    expect(result.success).toBe(false);
    expect(result.status).toBe("MERCHANT_ISOLATION");
  });

  it("returns CHECKOUT_READY for valid approved proposal", async () => {
    const { urban } = await getMerchantIds();
    const proposalId = await createApprovedProposal(urban);
    expect(proposalId).not.toBeNull();
    if (!proposalId) { expect(true).toBe(false); return; }
    const result = await createCheckout({ proposalId, merchantId: urban });
    expect(result.success).toBe(true);
    expect(result.status).toBe("CHECKOUT_READY");
    expect(result.checkoutId).toBeDefined();
    expect(result.razorpayOrderId).toBe("razorpay_order_mock");
    expect(result.amount).toBeDefined();
    expect(result.currency).toBe("INR");
    expect(result.keyId).toBe("rzp_test_mock");
  });
});

describe("Checkout confirmation", () => {
  it("confirms already succeeded checkout", async () => {
    const { urban } = await getMerchantIds();
    const proposalId = await createApprovedProposal(urban);
    expect(proposalId).not.toBeNull();
    if (!proposalId) { expect(true).toBe(false); return; }
    await createSucceededExecution(urban, proposalId);
    const result = await confirmCheckout("succeeded-checkout", urban);
    expect(result.success).toBe(true);
    expect(result.status).toBe("ALREADY_SUCCEEDED");
  });

  it("rejects checkout not found", async () => {
    const result = await confirmCheckout("nonexistent", "merchant-1");
    expect(result.success).toBe(false);
    expect(result.status).toBe("NOT_FOUND");
  });
});

describe("AI Buyer security", () => {
  it("never returns Razorpay key secret", async () => {
    const { urban } = await getMerchantIds();
    const proposalId = await createApprovedProposal(urban);
    expect(proposalId).not.toBeNull();
    if (!proposalId) { expect(true).toBe(false); return; }
    const result = await createCheckout({ proposalId, merchantId: urban });
    expect(result).not.toHaveProperty("keySecret");
    expect(result.keyId).toBe("rzp_test_mock");
  });
});

describe("Price change protection", () => {
  it("detects price mismatch", async () => {
    const { urban } = await getMerchantIds();
    const proposalId = await createApprovedProposal(urban);
    expect(proposalId).not.toBeNull();
    if (!proposalId) { expect(true).toBe(false); return; }
    const actionRequest = await prisma.actionRequest.findUnique({ where: { id: proposalId } });
    if (!actionRequest) return;
    const evidence = actionRequest.evidence ? JSON.parse(actionRequest.evidence) : {};
    const productId = evidence.productId;
    if (productId) {
      const product = await prisma.product.findUnique({ where: { id: productId } });
      if (product) {
        await prisma.product.update({ where: { id: productId }, data: { priceMinor: product.priceMinor + 50000 } });
      }
    }
    const result = await createCheckout({ proposalId, merchantId: urban });
    expect(result.success).toBe(false);
    expect(result.status).toBe("PRICE_CHANGED");
  });
});

describe("Inventory safety", () => {
  it("blocks checkout for insufficient inventory", async () => {
    const { urban } = await getMerchantIds();
    const proposalId = await createApprovedProposal(urban);
    expect(proposalId).not.toBeNull();
    if (!proposalId) { expect(true).toBe(false); return; }
    const actionRequest = await prisma.actionRequest.findUnique({ where: { id: proposalId } });
    if (!actionRequest) return;
    const evidence = actionRequest.evidence ? JSON.parse(actionRequest.evidence) : {};
    const productId = evidence.productId;
    if (productId) {
      const product = await prisma.product.findUnique({ where: { id: productId } });
      if (product) {
        await prisma.product.update({ where: { id: productId }, data: { stock: 0 } });
      }
    }
    const result = await createCheckout({ proposalId, merchantId: urban });
    expect(result.success).toBe(false);
    expect(result.status).toBe("INSUFFICIENT_INVENTORY");
  });
});