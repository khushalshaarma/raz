import { createAIProposalId, type AIProposalStatus } from "@/lib/ai/types";
import { validateAIOutput, ensureNoDirectExecution } from "@/lib/ai/validator";
import type { AICatalogProduct, AIBuyerSelection, AIBuyerPricing, AIBuyerProposal } from "./types";

export function calculatePricing(
  product: AICatalogProduct,
  quantity: number
): AIBuyerPricing {
  const unitPrice = product.price;
  const totalAmount = Math.round(unitPrice * quantity * 100) / 100;
  return {
    unitPrice,
    totalAmount,
    currency: product.currency,
  };
}

export function generateSelection(
  product: AICatalogProduct,
  quantity: number,
  confidence: number
): AIBuyerSelection {
  const reasons: string[] = [];

  if (product.availability === "in_stock") {
    reasons.push("Currently in stock");
  } else if (product.availability === "low_stock") {
    reasons.push("Low stock — order soon");
  }

  reasons.push(`Price is ₹${product.price.toLocaleString("en-IN")}`);
  reasons.push(`Category: ${product.category}`);

  return {
    productId: product.id,
    productName: product.name,
    quantity,
    matchReasons: reasons,
    confidence,
  };
}

export function generatePurchaseProposal(
  selection: AIBuyerSelection,
  pricing: AIBuyerPricing,
  merchantId: string,
  requiresApproval: boolean
): AIBuyerProposal {
  const proposal: AIBuyerProposal = {
    id: createAIProposalId(),
    intent: "PROPOSE_PURCHASE",
    action: "PURCHASE_PROPOSAL",
    merchantId,
    productId: selection.productId,
    productName: selection.productName,
    quantity: selection.quantity,
    unitPrice: pricing.unitPrice,
    totalAmount: pricing.totalAmount,
    currency: pricing.currency,
    selectionSummary: selection.matchReasons.join("; "),
    reasoningSummary: selection.matchReasons.join("; "),
    confidence: selection.confidence,
    requiresApproval,
    status: requiresApproval ? ("PENDING_APPROVAL" as AIProposalStatus) : ("PROPOSED" as AIProposalStatus),
    createdAt: new Date(),
  };

  return proposal;
}

export function validateBuyerProposal(
  proposal: AIBuyerProposal,
  catalogProduct: AICatalogProduct,
  quantity: number
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  const outputValidation = validateAIOutput(proposal);
  errors.push(...outputValidation.errors);

  const executionValidation = ensureNoDirectExecution({
    id: proposal.id,
    intent: proposal.intent,
    action: proposal.action,
    entities: [],
    parameters: {},
    reasoningSummary: proposal.selectionSummary,
    confidence: proposal.confidence,
    confidenceLevel: "HIGH",
    constraints: [],
    requiresApproval: proposal.requiresApproval,
    status: proposal.status as AIProposalStatus,
    createdAt: new Date(),
    metadata: {
      sources: [],
      methodology: "test",
      dataPoints: 1,
      confidenceScore: proposal.confidence,
      reasoningSummary: proposal.selectionSummary,
    },
  });
  errors.push(...executionValidation.errors);

  if (proposal.productId !== catalogProduct.id) {
    errors.push("Product ID mismatch: proposal product does not match catalog");
  }

  if (Math.abs(proposal.unitPrice - catalogProduct.price) > 0.01) {
    errors.push(
      `Price mismatch: proposal unitPrice ${proposal.unitPrice} vs catalog price ${catalogProduct.price}`
    );
  }

  const expectedTotal = Math.round(catalogProduct.price * quantity * 100) / 100;
  if (Math.abs(proposal.totalAmount - expectedTotal) > 0.01) {
    errors.push("Total amount does not match unitPrice × quantity from server catalog");
  }

  if (quantity > catalogProduct.inventory) {
    errors.push(`Requested quantity ${quantity} exceeds available inventory ${catalogProduct.inventory}`);
  }

  if (quantity < 1) {
    errors.push("Quantity must be at least 1");
  }

  if (proposal.totalAmount > 10000) {
    warnings.push("Total amount exceeds approval threshold");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}