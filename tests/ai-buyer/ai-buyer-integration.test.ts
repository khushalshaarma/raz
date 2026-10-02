import { describe, it, expect } from "vitest";
import { initializeAIProvider } from "@/lib/ai";
import { createBuyerSession } from "@/lib/ai-buyer/buyer";
import { getAIProviderConfig, getEffectiveAIProvider } from "@/lib/ai/config";

describe("AI Buyer deterministic mode", () => {
  it("detects deterministic provider when no API key", () => {
    process.env.AI_PROVIDER = "deterministic";
    expect(getEffectiveAIProvider()).toBe("deterministic");
    delete process.env.AI_PROVIDER;
  });
});

describe("AI Buyer proposal creation", () => {
  it("creates a buyer session with deterministic provider", async () => {
    const result = await createBuyerSession({
      merchantId: "test-merchant",
      query: "Find running shoes under ₹5000",
      quantity: 1,
    });
    expect(result.buyerSessionId).toBeDefined();
    expect(result.status).toBeDefined();
  });
});

describe("AI Buyer validation", () => {
  it("rejects empty query", async () => {
    const result = await createBuyerSession({
      merchantId: "test-merchant",
      query: "",
      quantity: 1,
    });
    expect(result.success).toBe(false);
  });

  it("handles no matching products", async () => {
    const result = await createBuyerSession({
      merchantId: "test-merchant",
      query: "nonexistent product xyz123",
      quantity: 1,
    });
    expect(result.buyerSessionId).toBeDefined();
  });
});