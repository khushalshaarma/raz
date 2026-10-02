import { initializeAIProvider, getAIProviderConfig } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { sanitizeAIInput } from "@/lib/ai/validator";
import { parseBuyerIntent } from "./selector";
import { getAICatalog, validateCatalogProduct } from "./catalog";
import { calculatePricing, generateSelection, generatePurchaseProposal, validateBuyerProposal } from "./proposal";
import { createAIProposalId } from "@/lib/ai/types";
import type { AIBuyerInput, AIBuyerResult, AIBuyerParsedIntent, AIBuyerProposal } from "./types";

export async function createBuyerSession(input: AIBuyerInput): Promise<AIBuyerResult> {
  const buyerSessionId = `ai-buy-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

  try {
    const sanitized = sanitizeAIInput({
      merchantId: input.merchantId,
      query: input.query,
      context: {},
    });

    const parsedIntent = parseBuyerIntent({ ...input, query: sanitized.query });

    const catalog = await getAICatalog(input.merchantId, {
      category: parsedIntent.category,
      search: parsedIntent.search,
      maxPrice: parsedIntent.maxPrice,
      minPrice: parsedIntent.minPrice,
      inStockOnly: parsedIntent.inStockOnly,
    });

    if (catalog.products.length === 0) {
      return {
        success: false,
        buyerSessionId,
        status: "no_products",
        request: { query: sanitized.query, quantity: parsedIntent.quantity },
        reason: "No products found matching your criteria",
      };
    }

    const provider = initializeAIProvider();
    const { type } = getAIProviderConfig();

    let selection;

    if (type === "deterministic" || !provider.generateStructured) {
      const topProduct = catalog.products[0];
      const confidence = topProduct ? 80 : 0;
      selection = generateSelection(topProduct, parsedIntent.quantity, confidence);
    } else {
      try {
        const prompt = `Select the best product for: ${sanitized.query}. Available products: ${JSON.stringify(catalog.products.map(p => ({id: p.id, name: p.name, category: p.category, price: p.price, availability: p.availability})))}`;
        const result = await provider.generateStructured(
          prompt,
          { type: "object", properties: { productId: { type: "string" } } }
        );

        const data = result.data as { productId?: string } | null;
        const productId = data?.productId || catalog.products[0].id;
        const matchedProduct = catalog.products.find((p) => p.id === productId) || catalog.products[0];
        const confidence = result.confidence.score;
        selection = generateSelection(matchedProduct, parsedIntent.quantity, confidence);
      } catch {
        const topProduct = catalog.products[0];
        selection = generateSelection(topProduct, parsedIntent.quantity, 75);
      }
    }

    const validatedProduct = validateCatalogProduct(catalog, selection.productId);
    if (!validatedProduct) {
      return {
        success: false,
        buyerSessionId,
        status: "validation_failed",
        request: { query: sanitized.query, quantity: parsedIntent.quantity },
        reason: "Selected product not found in catalog — product ID validation failed",
      };
    }

    const pricing = calculatePricing(validatedProduct, selection.quantity);
    const proposal = generatePurchaseProposal(selection, pricing, input.merchantId, true);

    const validation = validateBuyerProposal(proposal, validatedProduct, selection.quantity);

    if (!validation.valid) {
      return {
        success: false,
        buyerSessionId,
        status: "validation_failed",
        request: { query: sanitized.query, quantity: parsedIntent.quantity },
        reason: `Proposal validation failed: ${validation.errors.join("; ")}`,
      };
    }

    const { prisma } = await import("@/lib/prisma");

    const actionRequest = await prisma.actionRequest.create({
      data: {
        merchantId: input.merchantId,
        // Deliberately no `requestedBy`: this request originates from the AI
        // buyer agent, not from a human. Leaving it null records that
        // provenance honestly so the approval-time four-eyes check can tell
        // "machine-originated" apart from "requested by a human who must not
        // approve it themselves".
        opportunityType: "AI_BUYER_PURCHASE",
        strategyId: proposal.id,
        strategyName: proposal.productName,
        amountMinor: Math.round(proposal.totalAmount * 100),
        currency: proposal.currency,
        confidence: Math.round(proposal.confidence),
        status: proposal.requiresApproval ? "PENDING" : "APPROVED",
        reason: proposal.selectionSummary,
        customerId: null,
        recommendedScenario: "",
        decisionScore: Math.round(proposal.confidence),
        riskLevel: "LOW",
        evidence: JSON.stringify({ productId: proposal.productId, quantity: proposal.quantity, totalAmount: proposal.totalAmount }),
      },
    });

    const auditLog = await prisma.auditLog.create({
      data: {
        merchantId: input.merchantId,
        action: "AI_BUYER_PROPOSAL",
        resourceType: "ACTION_REQUEST",
        resourceId: actionRequest.id,
        outcome: proposal.requiresApproval ? "PENDING_APPROVAL" : "APPROVED",
        details: JSON.stringify({
          buyerSessionId,
          productId: proposal.productId,
          productName: proposal.productName,
          totalAmount: proposal.totalAmount,
          confidence: proposal.confidence,
          provider: type,
        }),
        severity: "INFO",
      },
    });

    const requiresApproval = proposal.requiresApproval || validation.warnings.length > 0;

    return {
      success: true,
      buyerSessionId,
      status: requiresApproval ? "pending_approval" : "proposal_created",
      request: { query: sanitized.query, quantity: parsedIntent.quantity },
      selection: {
        productId: selection.productId,
        productName: selection.productName,
        quantity: selection.quantity,
      },
      pricing: {
        unitPrice: pricing.unitPrice,
        total: pricing.totalAmount,
        currency: pricing.currency,
      },
      proposal: {
        id: proposal.id,
        requiresApproval,
      },
      reason: validation.warnings.length > 0
        ? `Proposal created with warnings: ${validation.warnings.join("; ")}`
        : selection.matchReasons.join("; "),
    };
  } catch (error) {
    console.error("AI Buyer error:", error);
    return {
      success: false,
      buyerSessionId,
      status: "validation_failed",
      request: { query: input.query, quantity: input.quantity || 1 },
      reason: "AI Buyer processing failed",
    };
  }
}

export async function getBuyerSession(
  buyerSessionId: string,
  merchantId: string
): Promise<AIBuyerProposal | null> {
  const { prisma } = await import("@/lib/prisma");
  const actionRequest = await prisma.actionRequest.findFirst({
    where: { merchantId, strategyId: buyerSessionId },
  });
  if (!actionRequest) return null;
  return {
    id: actionRequest.id,
    intent: "PROPOSE_PURCHASE",
    action: "PURCHASE_PROPOSAL",
    merchantId: actionRequest.merchantId,
    productId: "",
    productName: actionRequest.strategyName,
    quantity: 1,
    unitPrice: actionRequest.amountMinor / 100,
    totalAmount: actionRequest.amountMinor / 100,
    currency: actionRequest.currency,
    selectionSummary: actionRequest.reason || "",
    reasoningSummary: actionRequest.reason || "",
    confidence: actionRequest.confidence / 100,
    requiresApproval: actionRequest.status === "PENDING",
    status: actionRequest.status,
    createdAt: actionRequest.createdAt,
  };
}

export async function getBuyerActivity(
  merchantId: string
): Promise<Array<{ time: string; query: string; productName: string; status: string; amount: number }>> {
  const { prisma } = await import("@/lib/prisma");
  const requests = await prisma.actionRequest.findMany({
    where: { merchantId, opportunityType: "AI_BUYER_PURCHASE" },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return requests.map((req) => ({
    time: req.createdAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    query: req.reason || "Unknown",
    productName: req.strategyName,
    status: req.status,
    amount: req.amountMinor / 100,
  }));
}