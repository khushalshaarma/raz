import type { AIAction, AIIntent, AIProposal, AIConstraintFilter } from "@/lib/ai/types";

export type AIAvailability = "in_stock" | "low_stock" | "out_of_stock" | "unavailable";

export interface AICatalogProduct {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  currency: string;
  availability: AIAvailability;
  inventory: number;
  attributes: Record<string, string>;
  purchase: {
    supportsCheckout: boolean;
    paymentMethods: string[];
  };
}

export interface AICatalogResponse {
  catalogVersion: string;
  merchant: {
    id: string;
    name: string;
    currency: string;
  };
  currency: string;
  products: AICatalogProduct[];
}

export interface AIBuyerConstraint {
  category?: string;
  search?: string;
  maxPrice?: number;
  minPrice?: number;
  inStockOnly?: boolean;
  limit?: number;
  attributes?: Record<string, string>;
}

export interface AIBuyerInput {
  merchantId: string;
  query: string;
  quantity?: number;
  constraints?: AIBuyerConstraint;
}

export interface AIBuyerParsedIntent {
  intent: AIIntent;
  category?: string;
  search?: string;
  maxPrice?: number;
  minPrice?: number;
  attributes: Record<string, string>;
  quantity: number;
  inStockOnly?: boolean;
}

export interface AIBuyerSelection {
  productId: string;
  productName: string;
  quantity: number;
  matchReasons: string[];
  confidence: number;
}

export interface AIBuyerPricing {
  unitPrice: number;
  totalAmount: number;
  currency: string;
}

export interface AIBuyerProposal {
  id: string;
  intent: AIIntent;
  action: AIAction;
  merchantId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  currency: string;
  selectionSummary: string;
  reasoningSummary: string;
  confidence: number;
  requiresApproval: boolean;
  status: string;
  createdAt: Date;
}

export interface AIBuyerResult {
  success: boolean;
  buyerSessionId: string;
  status: "proposal_created" | "pending_approval" | "no_products" | "validation_failed";
  request: {
    query: string;
    quantity: number;
  };
  selection?: {
    productId: string;
    productName: string;
    quantity: number;
  };
  pricing?: {
    unitPrice: number;
    total: number;
    currency: string;
  };
  proposal?: {
    id: string;
    requiresApproval: boolean;
  };
  reason: string;
}

export interface AIBuyerAuditEntry {
  buyerSessionId: string;
  merchantId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  outcome: string;
  details: string;
  severity: string;
}

export interface CheckoutInput {
  proposalId: string;
  merchantId: string;
}

export interface CheckoutResult {
  success: boolean;
  checkoutId: string;
  status: string;
  orderId?: string;
  razorpayOrderId?: string;
  amount?: number;
  currency?: string;
  keyId?: string;
  error?: string;
}

export interface CheckoutStatus {
  checkoutId: string;
  status: string;
  amount: number;
  currency: string;
  providerReference: string;
  createdAt: Date;
  updatedAt: Date;
  actionStatus?: string;
}