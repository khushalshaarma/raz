/**
 * Decision Engine (Phase 3 — Decision Intelligence)
 *
 * Responsibilities:
 * 1. Receive simulation output (scenarios, baseline, etc.)
 * 2. Compute decision score from scenario results
 * 3. Determine recommended scenario and decision category
 * 5. Generate human-readable explanation
 * 5. Return complete decision output
 *
 * All calculations are deterministic and documented.
 * No LLM-driven financial prediction — all from documented formulas.
 */

import { ScenarioResult, BaselineResult } from "@/lib/intelligence/scenario";
import { SimulationOutput, SimulationInput } from "@/lib/intelligence/simulation-agent";
import { formatMoney } from "@/lib/intelligence/opportunity/scorer";

/** Decision categories per Phase 3 architecture */
export type DecisionCategory =
  | "STRONG_RECOMMENDATION"
  | "RECOMMEND"
  | "LOW_CONFIDENCE_RECOMMENDATION"
  | "NO_CLEAR_WINNER"
  | "DO_NOT_ACT";

/** Output from the decision engine */
export interface DecisionOutput {
  input: SimulationInput;
  baseline: BaselineResult;
  scenarios: ScenarioResult[];
  recommendedScenario: "CONSERVATIVE" | "EXPECTED" | "OPTIMISTIC";
  decisionScore: number; // 0-100
  decisionCategory: DecisionCategory;
  explanation: string; // human-readable explanation
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  confidence: number; // 0-100
  createdAt: Date;
}

/**
 * Run the decision engine for a merchant + opportunity + simulation output.
 *
 * Steps:
 * 1. Validate input (scenarios exist, baseline valid)
 * 2. Compute decision score from expected scenario
 * 3. Determine decision category
 * 4. Generate human-readable explanation
 * 5. Return complete decision output
 *
 * NO external side effects. No execution. No payment API calls.
 */
export function runDecisionAnalysis(
  input: SimulationInput,
  simulationOutput: SimulationOutput
): DecisionOutput {
  const { scenarios, baseline } = simulationOutput;

  // Find the expected scenario
  const expectedScenario = scenarios.find(
    (s: ScenarioResult) => s.scenarioType === "EXPECTED"
  );

  // Compute decision score from expected scenario
  // Formula: weighted combination of incremental impact, ROI, confidence, and risk penalty
  // Weights: impact 20%, ROI 40%, confidence 30%, risk penalty 10%
  let decisionScore = 0;
  let riskScore = 0; // Initialize so it's in scope for riskLevel calculation

  if (expectedScenario) {
    const incrementalImpact = expectedScenario.expectedNetImpactMinor; // in paise
    const expectedROI = expectedScenario.expectedROI; // ROI (0 if cost <= 0)
    const confidence = expectedScenario.confidence; // 0-100
    riskScore = expectedScenario.riskScore; // 0-100

    // Incremental impact normalized (paise → score contribution)
    // A impact of 100000 paise (~₹1000) contributes max ~20 to the score
    const normalizedImpact = Math.max(-100, Math.min(100, Math.round(incrementalImpact / 1000)));

    // Weighted combination
    // impact: 20%, ROI: 40%, confidence: 30%, risk penalty inverse: 10%
    decisionScore = Math.round(
      normalizedImpact * 0.20 +
        expectedROI * 0.40 +
        confidence * 0.30 +
        (100 - riskScore) * 0.10
    );
  }

  // Cap at 100, floor at 0
  decisionScore = Math.max(0, Math.min(100, decisionScore));

  // Determine recommended scenario
  // If expected net impact is positive, EXPECTED; otherwise CONSERVATIVE
  const recommendedScenario =
    (expectedScenario?.expectedNetImpactMinor ?? 0) >= 0 ? "EXPECTED" : "CONSERVATIVE";

  // Determine decision category
  const decisionCategory = determineDecisionCategory(
    decisionScore,
    expectedScenario,
    expectedScenario?.confidence || 0,
    expectedScenario?.riskScore || 0
  );

  // Generate human-readable explanation
  const explanation = generateExplanation({
    decisionScore,
    decisionCategory,
    recommendedScenario,
    expectedScenario,
    scenarios,
    baseline,
  });

  // Determine risk level from risk score
  const riskLevel = riskScore >= 70 ? "HIGH" : riskScore >= 40 ? "MEDIUM" : "LOW";

  return {
    input,
    baseline,
    scenarios,
    recommendedScenario,
    decisionScore,
    decisionCategory,
    explanation,
    riskLevel,
    confidence: expectedScenario?.confidence || 0,
    createdAt: new Date(),
  };
}

/**
 * Determine decision category based on decision score and other factors.
 */
function determineDecisionCategory(
  score: number,
  expectedScenario: ScenarioResult | undefined,
  confidence = 0,
  riskScore = 0
): DecisionCategory {
  // Guard: if no expected scenario, return DO_NOT_ACT
  if (!expectedScenario) {
    return "DO_NOT_ACT";
  }
  const hasPositiveImpact = expectedScenario.expectedNetImpactMinor > 0;
  const highConfidence = confidence >= 70;
  const lowRisk = riskScore < 40;

  if (score >= 80 && highConfidence && lowRisk) {
    return "STRONG_RECOMMENDATION";
  }

  if (score >= 60 && hasPositiveImpact) {
    return "RECOMMEND";
  }

  if (hasPositiveImpact && !highConfidence) {
    return "LOW_CONFIDENCE_RECOMMENDATION";
  }

  if (score < 40 || !hasPositiveImpact) {
    return "NO_CLEAR_WINNER";
  }

  return "DO_NOT_ACT";
}

/**
 * Generate a human-readable explanation of the decision.
 */
function generateExplanation(
  output: {
    decisionScore: number;
    decisionCategory: DecisionCategory;
    recommendedScenario: "CONSERVATIVE" | "EXPECTED" | "OPTIMISTIC";
    expectedScenario?: {
      expectedNetImpactMinor: number;
      expectedROI: number;
      confidence: number;
      riskScore: number;
    };
    scenarios: ScenarioResult[];
    baseline: BaselineResult;
  }
): string {
  const {
    decisionScore,
    decisionCategory,
    recommendedScenario,
    expectedScenario,
    scenarios,
    baseline,
  } = output;

  const topScenario = scenarios.find(
    (s: ScenarioResult) => s.scenarioType === recommendedScenario
  )!;
  const worstScenario = scenarios.find(
    (s: ScenarioResult) => s.scenarioType === "CONSERVATIVE"
  )!;
  const bestScenario = scenarios.find(
    (s: ScenarioResult) => s.scenarioType === "OPTIMISTIC"
  )!;

  let categoryLabel = "";
  switch (decisionCategory) {
    case "STRONG_RECOMMENDATION":
      categoryLabel = "Strong Recommendation";
      break;
    case "RECOMMEND":
      categoryLabel = "Recommend";
      break;
    case "LOW_CONFIDENCE_RECOMMENDATION":
      categoryLabel = "Low Confidence Recommendation";
      break;
    case "NO_CLEAR_WINNER":
      categoryLabel = "No Clear Winner";
      break;
    case "DO_NOT_ACT":
      categoryLabel = "Do Not Act";
      break;
  }

  const netImpact = expectedScenario?.expectedNetImpactMinor || 0;
  const incrementalImpact =
    netImpact > 0
      ? `+${formatMoney(Math.abs(netImpact))}`
      : formatMoney(Math.abs(netImpact)) + " (negative)";

  const explanation = `Decision: ${categoryLabel}\n\n` +
    `Decision Score: ${decisionScore}/100\n\n` +
    `Why this scenario?\n` +
    `- Expected incremental net impact: ${incrementalImpact}\n` +
    `- Expected ROI: ${expectedScenario?.expectedROI !== undefined ? expectedScenario.expectedROI + "x" : "undefined"}\n` +
    `- Confidence: ${expectedScenario?.confidence}%\n` +
    `- Risk level: ${riskLevelToString(expectedScenario?.riskScore || 0)}\n\n` +
    `Compared to alternatives:\n` +
    `- ${worstScenario.scenarioType} scenario: ${formatMoney(Math.abs(worstScenario.expectedNetImpactMinor))} ${worstScenario.expectedNetImpactMinor >= 0 ? "(positive)" : "(negative)"} net impact\n` +
    `- ${bestScenario.scenarioType} scenario: ${formatMoney(Math.abs(bestScenario.expectedNetImpactMinor))} ${bestScenario.expectedNetImpactMinor >= 0 ? "(positive)" : "(negative)"} net impact (optimistic)\n\n` +
    `Data quality: ${baseline.dataQuality}/100. ` +
    `Eligible customers: ${baseline.eligibleCustomers}.`;

  return explanation;
}

/** Convert riskScore (0-100) to riskLevel string */
function riskLevelToString(score: number): "LOW" | "MEDIUM" | "HIGH" {
  return score >= 70 ? "HIGH" : score >= 40 ? "MEDIUM" : "LOW";
}