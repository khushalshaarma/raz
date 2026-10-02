/**
 * Data Quality (Phase 3 — Decision Intelligence)
 *
 * Reusable data quality calculation.
 * Deterministic and auditable.
 *
 * Inputs:
 * - number of customers
 * - number of orders
 * - historical time span (days)
 * - missing fields count
 * - category coverage (categories with at least one order / total categories)
 * - payment data availability (1 = available, 0 = not available)
 * - strategy outcome history count (comparable historical outcomes)
 *
 * Output:
 * - dataQualityScore: 0-100
 * - Insufficient data warning if below threshold
 */

export interface DataQualityResult {
  dataQualityScore: number; // 0-100
  insufficient: boolean; // true if below minimum threshold
  minimumThreshold: number; // 30 = minimum for any simulation to proceed
  evidence: Array<{ feature: string; value: string }>;
}

/**
 * Calculate data quality score from merchant metrics.
 *
 * Formula components:
 * - Customer count weight: logarithmic scale, diminishing returns
 * - Order count weight: logarithmic scale, diminishing returns
 * - Time span weight: recency/coverage factor
 * - Missing fields penalty: each missing field reduces score
 * - Category coverage weight: proportion of categories with data
 * - Payment data penalty: if no payment data, reduce score
 * - Historical outcome weight: number of comparable outcomes
 *
 * Minimum threshold: 30/100 — below this, simulation should not proceed
 * without merchant notification.
 *
 * Example:
 *   50 customers, 100 orders, 6 months span, 2 missing fields,
 *   3 categories covered / 5 total, payment available, 5 outcomes
 *   → dataQualityScore: ~58/100
 */
export function calculateDataQuality(
  customerCount: number,
  orderCount: number,
  historicalSpanDays: number,
  missingFieldsCount: number = 0,
  categoryCoverage: number = 0, // 0-1, proportion of categories with data
  paymentDataAvailable: boolean = false,
  historicalOutcomeCount: number = 0
): DataQualityResult {
  // Minimum threshold for proceeding
  const minimumThreshold = 30;

  // Customer count weight: logarithmic, capped at 30
  // 10 customers → ~15, 50 customers → ~25, 100+ → ~30
  const customerWeight = Math.min(30, Math.round(15 + 15 * Math.log10(Math.max(1, customerCount) / 10)));

  // Order count weight: logarithmic, capped at 40
  // 10 orders → ~15, 50 orders → ~30, 100+ → ~40
  const orderWeight = Math.min(40, Math.round(15 + 25 * Math.log10(Math.max(1, orderCount) / 10)));

  // Historical time span weight: 0-20, based on days
  // 30 days → ~5, 90 days → ~15, 180+ → ~20
  const spanWeight = Math.min(20, Math.round(5 + 15 * Math.min(1, historicalSpanDays / 180)));

  // Missing fields penalty: -5 per field, minimum 0
  const missingPenalty = Math.max(0, 10 - missingFieldsCount * 5);

  // Category coverage weight: 0-10, proportional
  const categoryWeight = Math.round(10 * Math.max(0, Math.min(1, categoryCoverage)));

  // Payment data availability: 0 or +5
  const paymentWeight = paymentDataAvailable ? 5 : 0;

  // Historical outcome weight: 0-5, capped
  // 5+ outcomes → ~3, 1 outcome → ~1
  const outcomeWeight = Math.min(5, Math.max(0, Math.round(1 + 2 * Math.min(1, historicalOutcomeCount / 5))));

  // Total raw score
  const rawScore = customerWeight + orderWeight + spanWeight + missingPenalty + categoryWeight + paymentWeight + outcomeWeight;

  // Normalize to 0-100
  // Max possible: 30 + 40 + 20 + 10 + 10 + 5 + 5 = 120
  const maxPossible = 120;
  const dataQualityScore = Math.max(0, Math.min(100, Math.round((rawScore / maxPossible) * 100)));

  // Determine if insufficient
  const insufficient = dataQualityScore < minimumThreshold;

  // Build evidence
  const evidence: Array<{ feature: string; value: string }> = [
    { feature: "Customers", value: customerCount.toString() },
    { feature: "Orders", value: orderCount.toString() },
    { feature: "Span (days)", value: historicalSpanDays.toString() },
    { feature: "Missing Fields", value: missingFieldsCount.toString() },
    { feature: "Category Coverage", value: `${(categoryCoverage * 100).toFixed(0)}%` },
    { feature: "Payment Data", value: paymentDataAvailable ? "Yes" : "No" },
    { feature: "Historical Outcomes", value: historicalOutcomeCount.toString() },
  ];

  return {
    dataQualityScore,
    insufficient,
    minimumThreshold,
    evidence,
  };
}

/** End of data quality module */