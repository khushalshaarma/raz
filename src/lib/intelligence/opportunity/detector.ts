/**
 * Opportunity detector rule-based module
 * All detection rules are deterministic — same inputs always produce same outputs
 * No LLM involvement in detection logic
 */

/** Opportunity type enum */
export type OpportunityType =
  | "HIGH_VALUE_INACTIVE"
  | "CART_ABANDONMENT"
  | "UPSELL"
  | "CROSS_SELL"
  | "LOW_CONVERSION";

/** Evidence item for opportunity detection */
export interface OpportunityEvidence {
  feature: string;
  value: string;
  weight: number; // 0-1 how much this feature contributed
}

/** Opportunity created from detection */
export interface OpportunityCreateInput {
  merchantId: string;
  type: OpportunityType;
  title: string;
  description: string;
  evidence: OpportunityEvidence[];
  affectedCustomerCount: number;
}

/** Result of opportunity detection */
export interface DetectedOpportunity {
  id: string;
  merchantId: string;
  type: OpportunityType;
  title: string;
  description: string;
  estimatedRevenueMinor: number;
  confidence: number;
  status: OpportunityStatus;
  evidence: OpportunityEvidence[];
  affectedCustomerCount: number;
  createdAt: Date;
  triggeredAt: Date;
}

/** Opportunity status */
export type OpportunityStatus = "DETECTED" | "REVIEWING" | "ACTIONED" | "DISMISSED" | "EXPIRED";

/** Score components for opportunity scoring */
export interface ScoreComponents {
  revenueScore: number;   // 0-100, weighted 40%
  confidence: number;     // 0-100, weighted 30%
  urgencyScore: number;   // 0-100, weighted 20%
  customerValueScore: number; // 0-100, weighted 10%
}

/** Full opportunity score result */
export interface OpportunityScoreResult {
  opportunityScore: number;     // 0-100 final score
  revenueScore: number;         // 0-100 sub-component
  confidence: number;           // 0-100 sub-component
  urgencyScore: number;         // 0-100 sub-component
  customerValueScore: number;   // 0-100 sub-component
  evidence: string;             // summary of top contributing factors
}