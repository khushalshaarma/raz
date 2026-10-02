export type AIProviderType = "deterministic" | "openai";

export type AIAction =
  | "PRODUCT_DISCOVERY"
  | "PRODUCT_SELECTION"
  | "PURCHASE_PROPOSAL"
  | "PRICE_COMPARISON"
  | "CATEGORY_FILTER"
  | "BUNDLE_RECOMMENDATION"
  | "REORDER_SUGGESTION"
  | "INVENTORY_ALERT"
  | "DIRECT_PAYMENT"
  | "RAZORPAY_EXECUTE"
  | "ISSUE_REFUND"
  | "CREATE_ORDER"
  | "MODIFY_POLICY"
  | "DELETE_DATA";

export type AIIntent =
  | "FIND_PRODUCTS"
  | "COMPARE_PRODUCTS"
  | "PROPOSE_PURCHASE"
  | "ANALYZE_CATALOG"
  | "IDENTIFY_OPPORTUNITIES";

export type AIConstraint =
  | "MAX_PRICE"
  | "MIN_PRICE"
  | "CATEGORY"
  | "IN_STOCK"
  | "BRAND"
  | "RATING"
  | "CUSTOM";

export type AIProposalStatus = "PROPOSED" | "VALIDATED" | "REJECTED" | "EXPIRED";

export type AIConfidenceLevel = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";

export interface AIReasoningMetadata {
  sources: string[];
  methodology: string;
  dataPoints: number;
  confidenceScore: number;
  reasoningSummary: string;
}

export interface AIConfidence {
  level: AIConfidenceLevel;
  score: number;
  reasoning: string;
}

export interface AIConstraintFilter {
  type: AIConstraint;
  operator: string;
  value: string | number | string[];
}

export interface AIEntity {
  type: "PRODUCT" | "CATEGORY" | "MERCHANT" | "CUSTOMER" | "BRAND";
  id: string;
  name: string;
  attributes: Record<string, unknown>;
}

export interface AIProposal {
  id: string;
  intent: AIIntent;
  action: AIAction;
  entities: AIEntity[];
  parameters: Record<string, unknown>;
  reasoningSummary: string;
  confidence: number;
  confidenceLevel: AIConfidenceLevel;
  constraints: AIConstraintFilter[];
  requiresApproval: boolean;
  status: AIProposalStatus;
  createdAt: Date;
  metadata: AIReasoningMetadata;
}

export interface AIRequest {
  merchantId: string;
  query: string;
  intent?: AIIntent;
  constraints?: AIConstraintFilter[];
  maxResults?: number;
  context?: Record<string, unknown>;
  requireApproval?: boolean;
}

export interface AIProviderResult<T = unknown> {
  success: boolean;
  data: T;
  confidence: AIConfidence;
  reasoning: AIReasoningMetadata;
  provider: AIProviderType;
  durationMs: number;
  errors: string[];
}

export interface AIProvider {
  readonly name: string;
  readonly type: AIProviderType;
  generateStructured<T>(
    prompt: string,
    schema: unknown,
    options?: AIGenerateOptions
  ): Promise<AIProviderResult<T>>;
  validateOutput<T>(output: unknown, schema: unknown): boolean;
}

export interface AIGenerateOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
  merchantId?: string;
  context?: Record<string, unknown>;
}

export interface AIProviderConfig {
  provider: AIProviderType;
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  organizationId?: string;
}

export function isAIProposal(value: unknown): value is AIProposal {
  if (typeof value !== "object" || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.id === "string" &&
    typeof p.intent === "string" &&
    typeof p.action === "string" &&
    typeof p.confidence === "number" &&
    typeof p.requiresApproval === "boolean" &&
    Array.isArray(p.entities) &&
    Array.isArray(p.reasoningSummary) || typeof p.reasoningSummary === "string"
  );
}

export function createAIProposalId(): string {
  return `ai-prop-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function validateAIProposal(proposal: AIProposal): string[] {
  const errors: string[] = [];

  if (!proposal.id || proposal.id.length === 0) {
    errors.push("Proposal missing id");
  }
  if (!proposal.intent) {
    errors.push("Proposal missing intent");
  }
  if (!proposal.action) {
    errors.push("Proposal missing action");
  }
  if (proposal.confidence < 0 || proposal.confidence > 100) {
    errors.push(`Proposal confidence must be 0-100, got ${proposal.confidence}`);
  }
  if (!proposal.reasoningSummary || proposal.reasoningSummary.length === 0) {
    errors.push("Proposal missing reasoningSummary");
  }
  if (proposal.metadata.confidenceScore < 0 || proposal.metadata.confidenceScore > 100) {
    errors.push("Proposal metadata confidenceScore must be 0-100");
  }
  if (!proposal.status) {
    errors.push("Proposal missing status");
  }

  return errors;
}
