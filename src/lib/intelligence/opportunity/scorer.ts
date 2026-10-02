/**
 * Opportunity scorer: transparent 0-100 score computation
 * All sub-components are deterministic and documented
 * No LLM-driven scoring — all formulas are rule-based
 *
 * Score formula (Step 9 of Phase 2 architecture):
 *   opportunityScore = 0.40 * revenueScore + 0.30 * confidence + 0.20 * urgencyScore + 0.10 * customerValueScore
 *
 * All monetary values in integer paise. No floating-point for money.
 */

import { OpportunityType, ScoreComponents, OpportunityScoreResult } from "./detector";
export { formatMoney } from "@/lib/product/format";

/**
 * Compute revenue score (0-100) based on estimated revenue impact
 * Formula: min(100, (estimatedRevenueMinor / 1000000) * 100)
 */
function computeRevenueScore(estimatedRevenueMinor: number): number {
  const score = (estimatedRevenueMinor / 1000000) * 100;
  return Math.min(100, Math.max(0, Math.round(score)));
}

/**
 * Compute confidence (0-100) based on evidence quality and historical conversion
 */
function computeConfidence(affectedCustomerCount: number, evidenceQuality: number): number {
  const base = Math.max(0, Math.min(100, evidenceQuality * 100));
  const countFactor = Math.min(1, affectedCustomerCount / 100) * 25;
  const qualityFactor = Math.max(0, evidenceQuality - 0.5) * 50;
  const raw = base + countFactor + qualityFactor;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

/**
 * Compute urgency score (0-100) based on time-sensitive triggers
 */
function computeUrgencyScore(daysTrigger: number, threshold: number): number {
  if (daysTrigger <= 0) return 100;
  const halfLife = threshold || 30;
  const decayFactor = Math.min(1, daysTrigger / (halfLife * 2));
  return Math.max(0, Math.round(100 * (1 - decayFactor)));
}

/**
 * Compute customer value score (0-100) based on RFM segment
 */
function computeCustomerValueScore(rfmSegment: string): number {
  const scores: Record<string, number> = {
    HIGH_VALUE_LOYAL: 100,
    HIGH_VALUE_INACTIVE: 80,
    ACTIVE_GROWING: 60,
    NEW_CUSTOMER: 40,
    LOW_ENGAGEMENT: 20,
    AT_RISK: 50,
    UNKNOWN: 30,
  };
  return scores[rfmSegment] || 30;
}

/**
 * Compute full opportunity score with all sub-components
 */
export function computeOpportunityScore(
  components: ScoreComponents
): OpportunityScoreResult {
  const { revenueScore, confidence, urgencyScore, customerValueScore } = components;

  // Weighted combination (documented formula)
  const opportunityScore = Math.round(
    0.40 * revenueScore +
      0.30 * confidence +
      0.20 * urgencyScore +
      0.10 * customerValueScore
  );

  return {
    opportunityScore,
    revenueScore,
    confidence,
    urgencyScore,
    customerValueScore,
    evidence: `Revenue score ${revenueScore}; Confidence ${confidence}%; Urgency ×${Math.round(urgencyScore / 25)}x; Value ${customerValueScore}pt`,
  };
}

/**
 * Generate opportunity explanation (evidence-based, not LLM-hallucinated)
 */
export function generateOpportunityExplanation(
  type: OpportunityType,
  scoreResult: OpportunityScoreResult,
  rfmSegment: string,
  evidence: Array<{ feature: string; value: string }>
): string {
  const evidenceSummary = evidence
    .slice()
    .sort((a, b) => b.feature.localeCompare(a.feature))
    .slice(0, 5)
    .map((e) => `${e.feature}: ${e.value}`)
    .join("; ");

  const parts: string[] = [];

  // Type-specific opening
  switch (type) {
    case "HIGH_VALUE_INACTIVE":
      parts.push("Customer is high-value but inactive");
      break;
    case "CART_ABANDONMENT":
      parts.push("Customer has PENDING order older than 3 days");
      break;
    case "UPSELL":
      parts.push("Customer has high AOV — upgrade opportunity");
      break;
    case "CROSS_SELL":
      parts.push("Customer purchases from limited categories");
      break;
    case "LOW_CONVERSION":
      parts.push("Store-wide conversion rate below threshold");
      break;
    default:
      parts.push("Opportunity detected based on customer behavior");
  }

  parts.push(`Opportunity score: ${scoreResult.opportunityScore}/100`);
  parts.push(`Confidence: ${scoreResult.confidence}%`);
  parts.push(`Customer value: ${computeCustomerValueScore(rfmSegment)}pts`);
  parts.push(`Key factors: ${evidenceSummary}`);

  return parts.join(". ") + ".";
}