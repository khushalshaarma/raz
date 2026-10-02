import { sanitizeAIInput } from "@/lib/ai/validator";
import type { AIBuyerInput, AIBuyerParsedIntent } from "./types";

export function parseBuyerIntent(input: AIBuyerInput): AIBuyerParsedIntent {
  const sanitized = sanitizeAIInput({
    merchantId: input.merchantId,
    query: input.query,
    context: {},
  });

  const query = sanitized.query.toLowerCase();
  const constraints: AIBuyerParsedIntent = {
    intent: "FIND_PRODUCTS",
    attributes: {},
    quantity: input.quantity || 1,
  };

  const maxPriceMatch = query.match(/under\s*₹?\s*(\d+)/);
  if (maxPriceMatch) {
    constraints.maxPrice = parseInt(maxPriceMatch[1], 10);
    constraints.intent = "PROPOSE_PURCHASE";
  }

  const belowMatch = query.match(/below\s*₹?\s*(\d+)/);
  if (belowMatch) {
    constraints.maxPrice = parseInt(belowMatch[1], 10);
    constraints.intent = "PROPOSE_PURCHASE";
  }

  const lessThanMatch = query.match(/less than\s*₹?\s*(\d+)/);
  if (lessThanMatch) {
    constraints.maxPrice = parseInt(lessThanMatch[1], 10);
    constraints.intent = "PROPOSE_PURCHASE";
  }

  const categoryMatch = query.match(/(?:find|looking for|need)\s+(\w+(?:\s+\w+)*)/i);
  if (categoryMatch && !maxPriceMatch) {
    constraints.category = categoryMatch[1];
    constraints.intent = "FIND_PRODUCTS";
  }

  const buyMatch = query.match(/(?:find|looking for)\s+(\w+(?:\s+\w+)*)/i);
  if (buyMatch) {
    const potentialCategory = buyMatch[1];
    if (!constraints.category) {
      constraints.category = potentialCategory;
    }
  }

  if (query.includes("running shoe") || query.includes("shoe")) {
    constraints.category = "Running Shoes";
  }
  if (query.includes("backpack")) {
    constraints.category = "Backpacks";
  }
  if (query.includes("smart watch") || query.includes("watch")) {
    constraints.category = "Smart Watches";
  }
  if (query.includes("college") || query.includes("accessory")) {
    constraints.category = "College Accessories";
  }

  if (constraints.maxPrice !== undefined) {
    constraints.intent = "PROPOSE_PURCHASE";
  }

  return constraints;
}

export function filterByConstraints(
  products: { id: string; name: string; category: string; price: number; inventory: number; availability: string }[],
  parsed: AIBuyerParsedIntent
) {
  let filtered = products;

  if (parsed.category) {
    filtered = filtered.filter(
      (p) =>
        p.category.toLowerCase().includes(parsed.category!.toLowerCase()) ||
        p.name.toLowerCase().includes(parsed.category!.toLowerCase())
    );
  }

  if (parsed.maxPrice !== undefined) {
    const maxP = parsed.maxPrice;
    filtered = filtered.filter((p) => p.price <= maxP);
  }

  if (parsed.minPrice !== undefined) {
    const minP = parsed.minPrice;
    filtered = filtered.filter((p) => p.price >= minP);
  }

  if (parsed.inStockOnly) {
    filtered = filtered.filter((p) => p.availability !== "out_of_stock");
  }

  return filtered;
}