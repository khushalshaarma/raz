/**
 * Risk Engine (Phase 3 — Decision Intelligence)
 *
 * Deterministic risk analysis based on documented formulas.
 * No LLM-driven risk prediction — all from deterministic calculations.
 *
 * Risk represents business uncertainty/downside from 0 (no risk) to 100 (maximum risk).
 *
 * Formula: riskScore = uncertaintyPenalty + costDownsidePenalty + dataQualityPenalty + incentiveSizePenalty
 * Normalized to 0-100. Lower = safer.
 */

export interface RiskAnalysis {
  riskScore: number; // 0-100
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  evidence: Array<{ feature: string; value: string }>;
}

/**
 * Run risk analysis for a scenario.
 *
 * Inputs:
 * - expectedNetImpact: expected net impact in paise (can be negative)
 * - expectedCost: expected cost in paise (>= 0)
 * - expectedRevenue: expected revenue in paise (>= 0)
 * - downsideNetImpact: worst reasonable net impact in paise (can be negative)
 * - downsideCost: worst reasonable cost in paise (>= 0)
 * - downsideRevenue: worst reasonable revenue in paise (>= 0)
 * - confidence: confidence score 0-100
 * - dataQuality: data quality score 0-100
 * - sampleSize: number of eligible customers or orders
 * - historicalVariance: optional historical variance 0-100
 *
 * Output: riskScore 0-100, riskLevel LOW/MEDIUM/HIGH, evidence
 */
export function runRiskAnalysis(
  expectedNetImpact: number,
  expectedCost: number,
  expectedRevenue: number,
  downsideNetImpact: number,
  downsideCost: number,
  downsideRevenue: number,
  confidence: number,
  dataQuality: number,
  sampleSize: number,
  historicalVariance?: number
): RiskAnalysis {
  // Guard: if cost is 0 and revenue is 0, risk is LOW (nothing to lose)
  if (expectedCost === 0 && expectedRevenue === 0) {
    return {
      riskScore: 0,
      riskLevel: "LOW",
      evidence: [
        { feature: "Cost", value: "0" },
        { feature: "Revenue", value: "0" },
        { feature: "Data Quality", value: `${dataQuality}/100` },
        { feature: "Sample Size", value: sampleSize.toString() },
      ],
    };
  }

  // Guard: if expected cost is 0 (free strategy), risk is reduced
  // but downside risk remains
  const costPenalty = expectedCost > 0 ? 100 - Math.min(100, (expectedRevenue / expectedCost) * 100) : 20;

  // Uncertainty penalty based on confidence and variance
  // Lower confidence + higher variance = higher risk
  const confidencePenalty = 100 - confidence; // 0-100, inverse of confidence
  const variancePenalty = historicalVariance !== undefined ? historicalVariance : Math.max(0, 100 - dataQuality);
  const uncertaintyPenalty = Math.min(100, confidencePenalty + variancePenalty - 50); // range ~0-100

  // Cost downside penalty: if downside cost exceeds expected cost
  const costDownsidePenalty = downsideCost > expectedCost
    ? Math.min(100, Math.round(((downsideCost - expectedCost) / expectedCost) * 100))
    : 0;

  // Data quality penalty: lower data quality = higher risk
  const dataQualityPenalty = 100 - dataQuality; // 0-100

  // Sample size penalty: very small sample = higher risk
  const sampleSizePenalty = sampleSize < 10 ? 30 : sampleSize < 30 ? 15 : 0;

  // Incentive/size penalty: very large incentives carry more risk
  const incentiveSizePenalty = expectedCost > 500000 ? 10 : 0; // ₹5K+ threshold

  // Total risk score: normalize to 0-100
  const rawRiskScore = uncertaintyPenalty + costDownsidePenalty + dataQualityPenalty + sampleSizePenalty + incentiveSizePenalty;

  // Normalize to 0-100 range
  // Max possible: uncertainty(100) + costDownside(~100) + dataQuality(100) + sampleSize(30) + incentive(10) = 340
  // We'll scale down proportionally
  const maxPossible = 340;
  const normalizedRiskScore = Math.max(0, Math.min(100, Math.round((rawRiskScore / maxPossible) * 100)));

  // Determine risk level
  let riskLevel: "LOW" | "MEDIUM" | "HIGH";
  if (normalizedRiskScore >= 70) {
    riskLevel = "HIGH";
  } else if (normalizedRiskScore >= 40) {
    riskLevel = "MEDIUM";
  } else {
    riskLevel = "LOW";
  }

  // Build evidence
  const evidence: Array<{ feature: string; value: string }> = [
    { feature: "Data Quality", value: `${dataQuality}/100` },
    { feature: "Confidence", value: `${confidence}%` },
    { feature: "Sample Size", value: sampleSize.toString() },
  ];

  if (expectedCost > 0) {
    evidence.push({
      feature: "Expected Revenue",
      value: formatMoneyINR(expectedRevenue),
    });
    evidence.push({
      feature: "Expected Cost",
      value: formatMoneyINR(expectedCost),
    });
  }

  if (downsideCost > 0) {
    evidence.push({
      feature: "Downside Cost",
      value: formatMoneyINR(downsideCost),
    });
    evidence.push({
      feature: "Downside Revenue",
      value: formatMoneyINR(downsideRevenue),
    });
  }

  if (historicalVariance !== undefined) {
    evidence.push({
      feature: "Historical Variance",
      value: `${historicalVariance}%`,
    });
  }

  return {
    riskScore: normalizedRiskScore,
    riskLevel,
    evidence,
  };
}

/** Format number as INR rupees string */
function formatMoneyINR(paise: number): string {
  const rupees = paise / 100;
  if (rupees >= 100000) {
    // Crores
    return `${(rupees / 10000000).toFixed(2)} Cr`;
  }
  if (rupees >= 1000) {
    // Lakhs
    return `${(rupees / 100000).toFixed(2)} L`;
  }
  // Rupees
  return `₹${rupees.toFixed(2)}`;
}

/** End of risk engine module */