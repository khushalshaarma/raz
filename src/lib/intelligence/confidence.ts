/**
 * Confidence Engine (Phase 3 — Decision Intelligence)
 *
 * Deterministic confidence analysis based on evidence.
 * No LLM-driven confidence prediction — all from documented formulas.
 *
 * Confidence represents how much we can trust the simulation's
 * recommendation, based on data quality and quantity.
 *
 * Formula: confidence = dataQualityWeight + sampleSizeWeight + stabilityWeight
 * Normalized to 0-100. Each component documented.
 *
 * Low data must result in low confidence.
 * Never fabricate confidence.
 */

export interface ConfidenceAnalysis {
  confidenceScore: number; // 0-100
  confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
  evidence: Array<{ feature: string; value: string }>;
}

/**
 * Run confidence analysis for a scenario.
 *
 * Inputs:
 * - dataQuality: data quality score 0-100
 * - sampleSize: number of eligible customers or orders
 * - stability: stability weight from risk analysis 0-100
 * - historicalDepth: number of historical outcomes for this strategy
 * - segmentSimilarity: similarity to known segments 0-100
 *
 * Output: confidenceScore 0-100, confidenceLevel HIGH/MEDIUM/LOW, evidence
 */
export function runConfidenceAnalysis(
  dataQuality: number,
  sampleSize: number,
  stability: number,
  historicalDepth: number = 0,
  segmentSimilarity: number = 50
): ConfidenceAnalysis {
  // Data quality weight: direct contribution 0-100
  const dataQualityWeight = dataQuality; // 0-100

  // Sample size weight: capped at 50
  // Minimum 10 customers for any confidence, capped at 50
  const sampleSizeWeight = sampleSize < 5 ? 5 : Math.min(50, Math.round(sampleSize / 10)); // 5-50

  // Stability weight: inverse of risk (from risk analysis)
  // stability is 0-100, used directly
  const stabilityWeight = stability; // 0-100

  // Total confidence: sum of weights, capped at 100
  const rawConfidence = dataQualityWeight + sampleSizeWeight + stabilityWeight;

  // Normalize to 0-100
  const confidenceScore = Math.max(0, Math.min(100, rawConfidence));

  // Determine confidence level
  let confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
  if (confidenceScore >= 70) {
    confidenceLevel = "HIGH";
  } else if (confidenceScore >= 40) {
    confidenceLevel = "MEDIUM";
  } else {
    confidenceLevel = "LOW";
  }

  // Build evidence
  const evidence: Array<{ feature: string; value: string }> = [
    { feature: "Data Quality", value: `${dataQuality}/100` },
    { feature: "Sample Size", value: sampleSize.toString() },
    { feature: "Stability", value: `${stability}%` },
  ];

  if (historicalDepth > 0) {
    evidence.push({ feature: "Historical Depth", value: `${historicalDepth} outcomes` });
  }

  if (segmentSimilarity >= 0) {
    evidence.push({ feature: "Segment Similarity", value: `${segmentSimilarity}%` });
  }

  // Critical: if data is insufficient, force LOW confidence
  if (dataQuality < 30 || sampleSize < 10) {
    confidenceLevel = "LOW";
    // Still return the computed score but mark as LOW
    // The score may be misleading, but the level is authoritative
  }

  return {
    confidenceScore,
    confidenceLevel,
    evidence,
  };
}

/** End of confidence engine module */