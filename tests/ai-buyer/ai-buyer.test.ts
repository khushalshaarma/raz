import { describe, it, expect } from "vitest";
import { getAICatalog, filterCatalog, validateCatalogProduct, mapProductToCatalogProduct } from "@/lib/ai-buyer/catalog";
import { parseBuyerIntent } from "@/lib/ai-buyer/selector";
import { calculatePricing, generateSelection, generatePurchaseProposal, validateBuyerProposal } from "@/lib/ai-buyer/proposal";
import type { AICatalogProduct } from "@/lib/ai-buyer/types";

describe("Catalog product mapping", () => {
  it("maps a product to catalog format", () => {
    const product = {
      id: "prod_1",
      name: "Running Shoes",
      description: "Comfortable running shoes",
      category: "Running Shoes",
      priceMinor: 499900,
      currency: "INR",
      stock: 12,
      sku: "RS-001",
    };
    const catalog = mapProductToCatalogProduct(product);
    expect(catalog.price).toBe(4999);
    expect(catalog.inventory).toBe(12);
    expect(catalog.availability).toBe("in_stock");
    expect(catalog.purchase.supportsCheckout).toBe(true);
    expect(catalog.purchase.paymentMethods).toContain("razorpay");
  });

  it("marks low stock correctly", () => {
    const product = { id: "p2", name: "Test", description: "Test", category: "Test", priceMinor: 100000, currency: "INR", stock: 3, sku: "T-001" };
    const catalog = mapProductToCatalogProduct(product);
    expect(catalog.availability).toBe("low_stock");
  });

  it("marks out of stock correctly", () => {
    const product = { id: "p3", name: "Test", description: "Test", category: "Test", priceMinor: 100000, currency: "INR", stock: 0, sku: "T-002" };
    const catalog = mapProductToCatalogProduct(product);
    expect(catalog.availability).toBe("out_of_stock");
  });
});

describe("Catalog filtering", () => {
  const products: AICatalogProduct[] = [
    { id: "1", name: "Running Shoes", description: "Running shoes for athletes", category: "Running Shoes", price: 4999, currency: "INR", availability: "in_stock", inventory: 12, attributes: { sku: "RS-001" }, purchase: { supportsCheckout: true, paymentMethods: ["razorpay"] } },
    { id: "2", name: "Black Backpack", description: "Durable backpack", category: "Backpacks", price: 2499, currency: "INR", availability: "in_stock", inventory: 5, attributes: { sku: "BP-001" }, purchase: { supportsCheckout: true, paymentMethods: ["razorpay"] } },
    { id: "3", name: "Smart Watch", description: "Advanced smart watch", category: "Smart Watches", price: 8999, currency: "INR", availability: "out_of_stock", inventory: 0, attributes: { sku: "SW-001" }, purchase: { supportsCheckout: true, paymentMethods: ["razorpay"] } },
  ];

  it("filters by maxPrice", () => {
    const result = filterCatalog(products, { maxPrice: 5000 });
    expect(result.length).toBe(2);
    expect(result.every((p) => p.price <= 5000)).toBe(true);
  });

  it("filters by search", () => {
    const result = filterCatalog(products, { search: "running" });
    expect(result.length).toBe(1);
    expect(result[0].name).toBe("Running Shoes");
  });

  it("filters by category", () => {
    const result = filterCatalog(products, { category: "backpack" });
    expect(result.length).toBe(1);
    expect(result[0].category).toBe("Backpacks");
  });

  it("filters out of stock when inStockOnly", () => {
    const result = filterCatalog(products, { inStockOnly: true });
    expect(result.every((p) => p.availability !== "out_of_stock")).toBe(true);
  });
});

describe("Pricing calculation", () => {
  it("calculates correct pricing", () => {
    const product = { id: "1", name: "Test", description: "Test", category: "Test", price: 4999, currency: "INR", availability: "in_stock" as const, inventory: 10, attributes: {}, purchase: { supportsCheckout: true, paymentMethods: ["razorpay"] } };
    const pricing = calculatePricing(product, 2);
    expect(pricing.unitPrice).toBe(4999);
    expect(pricing.totalAmount).toBe(9998);
    expect(pricing.currency).toBe("INR");
  });
});

describe("Product selection", () => {
  it("generates selection with reasons", () => {
    const product = { id: "1", name: "Running Shoes", description: "Test", category: "Running Shoes", price: 4999, currency: "INR", availability: "in_stock" as const, inventory: 12, attributes: {}, purchase: { supportsCheckout: true, paymentMethods: ["razorpay"] } };
    const selection = generateSelection(product, 1, 91);
    expect(selection.productId).toBe("1");
    expect(selection.quantity).toBe(1);
    expect(selection.matchReasons.length).toBeGreaterThan(0);
    expect(selection.confidence).toBe(91);
  });
});

describe("Purchase proposal generation", () => {
  it("generates a valid purchase proposal", () => {
    const product = { id: "1", name: "Running Shoes", description: "Test", category: "Running Shoes", price: 4999, currency: "INR", availability: "in_stock" as const, inventory: 12, attributes: {}, purchase: { supportsCheckout: true, paymentMethods: ["razorpay"] } };
    const selection = generateSelection(product, 1, 91);
    const pricing = calculatePricing(product, 1);
    const proposal = generatePurchaseProposal(selection, pricing, "merchant_1", true);
    expect(proposal.productId).toBe("1");
    expect(proposal.totalAmount).toBe(4999);
    expect(proposal.requiresApproval).toBe(true);
    expect(proposal.status).toBe("PENDING_APPROVAL");
    expect(proposal.currency).toBe("INR");
  });
});

describe("Buyer proposal validation", () => {
  const product = { id: "1", name: "Running Shoes", description: "Test", category: "Running Shoes", price: 4999, currency: "INR", availability: "in_stock" as const, inventory: 12, attributes: {}, purchase: { supportsCheckout: true, paymentMethods: ["razorpay"] } };

  it("validates a correct proposal", () => {
    const selection = generateSelection(product, 1, 91);
    const pricing = calculatePricing(product, 1);
    const proposal = generatePurchaseProposal(selection, pricing, "merchant_1", true);
    const result = validateBuyerProposal(proposal, product, 1);
    expect(result.valid).toBe(true);
  });

  it("rejects proposal with wrong product ID", () => {
    const selection = generateSelection(product, 1, 91);
    const pricing = calculatePricing(product, 1);
    const proposal = { ...generatePurchaseProposal(selection, pricing, "merchant_1", true), productId: "wrong_id" };
    const result = validateBuyerProposal(proposal, product, 1);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Product ID mismatch"))).toBe(true);
  });

  it("rejects proposal exceeding inventory", () => {
    const selection = generateSelection(product, 100, 91);
    const pricing = calculatePricing(product, 100);
    const proposal = generatePurchaseProposal(selection, pricing, "merchant_1", true);
    const result = validateBuyerProposal(proposal, product, 100);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("inventory"))).toBe(true);
  });
});

describe("Intent parsing", () => {
  it("parses price constraint from query", () => {
    const parsed = parseBuyerIntent({ merchantId: "m1", query: "Find me running shoes under ₹5000", quantity: 1 });
    expect(parsed.maxPrice).toBe(5000);
  });

  it("parses below price constraint", () => {
    const parsed = parseBuyerIntent({ merchantId: "m1", query: "I need a black backpack below ₹3000", quantity: 1 });
    expect(parsed.maxPrice).toBe(3000);
  });

  it("detects category from query", () => {
    const parsed = parseBuyerIntent({ merchantId: "m1", query: "Find me running shoes", quantity: 1 });
    expect(parsed.category).toBeDefined();
  });
});