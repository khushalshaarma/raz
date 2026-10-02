/**
 * Simulation Agent (Phase 3 — Decision Intelligence)
 *
 * Responsibilities:
 * 1. Receive opportunity + strategy
 * 2. Load relevant merchant/customer evidence (Phase 2 data)
 * 3. Build scenario assumptions from baseline + config
 * 4. Run scenario engine (CONSERVATIVE / EXPECTED / OPTIMISTIC)
 * 5. Calculate financial impact, conversions, ROI
 * 6. Calculate risk score and confidence
 * 7. Store scenario results (via Simulation model)
 * 8. Emit SimulationCompleted event
 *
 * The agent MUST NOT execute anything — it only produces SIMULATED DECISIONS.
 */

import { runScenarioEngine, ScenarioConfig, ScenarioResult, BaselineResult } from "@/lib/intelligence/scenario";
import { OpportunityType, OpportunityStatus } from "@/lib/intelligence/opportunity";
import { StrategyType, StrategyCandidate } from "@/lib/intelligence/strategy";
import { formatMoney } from "@/lib/intelligence/opportunity/scorer";

/** Input to the simulation agent */
export interface SimulationInput {
  merchantId: string;
  opportunityType: OpportunityType;
  strategyId: string; // internal strategy identifier
  strategy: StrategyCandidate; // full strategy with financials/assumptions
  config?: ScenarioConfig; // optional: overrides defaults
}

/** Output from the simulation agent */
export interface SimulationOutput {
  input: SimulationInput;
  baseline: BaselineResult;
  scenarios: ScenarioResult[];
  recommendedScenario: "CONSERVATIVE" | "EXPECTED" | "OPTIMISTIC";
  decisionScore: number; // 0-100, weighted score considering incremental impact, ROI, confidence, risk
  explanation: string; // human-readable explanation of the recommendation
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  confidence: number; // 0-100
  createdAt: Date;
}

/** Event type for agent communication */
export type SimulationEvent =
  | "SimulationRequested"
  | "SimulationCompleted"
  | "DecisionGenerated"
  | "DecisionSelected";

/**
 * Run the full simulation for a merchant + opportunity + strategy.
 *
 * Steps:
 * 1. Validate input (merchant exists, opportunity detected, strategy valid)
 * 2. Run scenario engine to get baseline + 3 scenarios
 * 3. Compute decision score from scenario results
 * 4. Generate human-readable explanation
 * 5. Return complete simulation output
 *
 * NO external side effects. No Razorpay. No payment execution. No campaign sending.
 */
export async function runSimulationAgent(
  input: SimulationInput
): Promise<SimulationOutput> {
  const { opportunityType, strategy, config } = input;

  // Step 1: Run scenario engine
  const engineResult = await runScenarioEngine(input.merchantId, opportunityType, config);

  // Type guard: check if engineResult has an error property
  if ("error" in engineResult) {
    // Insufficient data case — return with LOW confidence / HIGH risk
    return {
      input,
      baseline: {
        eligibleCustomers: 0,
        historicalConversionRate: 0,
        historicalAOVMinor: 0,
        historicalRevenueMinor: 0,
        historicalCostMinor: 0,
        baselineNetImpactMinor: 0,
        baselineConversions: 0,
        dataQuality: 0,
      },
      scenarios: [
        {
          scenarioType: "CONSERVATIVE",
          eligibleCustomers: 0,
          expectedConversionRate: 0,
          expectedConversions: 0,
          expectedRevenueMinor: 0,
          expectedCostMinor: 0,
          expectedNetImpactMinor: 0,
          expectedROI: 0,
          confidence: 10,
          riskScore: 100,
          riskLevel: "HIGH",
          downsideRevenueMinor: 0,
          downsideCostMinor: 0,
          downsideNetImpactMinor: 0,
          evidence: [{ feature: "Data Availability", value: "Insufficient historical data" }],
        },
        {
          scenarioType: "EXPECTED",
          eligibleCustomers: 0,
          expectedConversionRate: 0,
          expectedConversions: 0,
          expectedRevenueMinor: 0,
          expectedCostMinor: 0,
          expectedNetImpactMinor: 0,
          expectedROI: 0,
          confidence: 10,
          riskScore: 100,
          riskLevel: "HIGH",
          downsideRevenueMinor: 0,
          downsideCostMinor: 0,
          downsideNetImpactMinor: 0,
          evidence: [{ feature: "Data Availability", value: "Insufficient historical data" }],
        },
        {
          scenarioType: "OPTIMISTIC",
          eligibleCustomers: 0,
          expectedConversionRate: 0,
          expectedConversions: 0,
          expectedRevenueMinor: 0,
          expectedCostMinor: 0,
          expectedNetImpactMinor: 0,
          expectedROI: 0,
          confidence: 10,
          riskScore: 100,
          riskLevel: "HIGH",
          downsideRevenueMinor: 0,
          downsideCostMinor: 0,
          downsideNetImpactMinor: 0,
          evidence: [{ feature: "Data Availability", value: "Insufficient historical data" }],
        },
      ],
      decisionScore: 0,
      explanation:
        "Insufficient historical data to run simulation. No clear winner. Recommend reviewing data collection or selecting a different opportunity.",
      recommendedScenario: "CONSERVATIVE",
      riskLevel: "HIGH",
      confidence: 10,
      createdAt: new Date(),
    };
  }

  const { baseline, scenarios } = engineResult;

  // Step 2: Compute decision score from scenarios
  // Formula: weighted combination of incremental impact, ROI, confidence, and risk penalty
  const expectedScenario = scenarios.find((s: ScenarioResult) => s.scenarioType === "EXPECTED");
  const expectedNetImpact = expectedScenario!.expectedNetImpactMinor;
  const expectedROI = expectedScenario!.expectedROI;
  const confidence = expectedScenario!.confidence;
  const riskScore = expectedScenario!.riskScore;

  // Incremental impact: expected net impact minus a small baseline penalty
  // (baseline represents "do nothing", so incremental = expected net impact)
  const incrementalImpact = expectedNetImpact;

  // ROI weight (40%), confidence weight (30%), impact weight (20%), risk penalty (10%)
  const roiWeight = 0.40;
  const confidenceWeight = 0.30;
  const impactWeight = 0.20;
  const riskPenalty = riskScore / 100; // 0-1, subtracted

  let decisionScore = Math.round(
    incrementalImpact * impactWeight / 100000 * 100 + // normalize impact
    confidence * confidenceWeight +
    (100 - riskScore) * 0.10 // risk penalty inverse
  );

  // Cap at 100, floor at 0
  decisionScore = Math.max(0, Math.min(100, decisionScore));

  // Step 3: Determine recommended scenario
  const recommendedScenario = expectedNetImpact >= 0 ? "EXPECTED" : "CONSERVATIVE";

  // Step 4: Generate human-readable explanation
  const topScenario = scenarios.find((s: ScenarioResult) => s.scenarioType === recommendedScenario)!;
  const worstScenario = scenarios.find((s: ScenarioResult) => s.scenarioType === "CONSERVATIVE")!;
  const bestScenario = scenarios.find((s: ScenarioResult) => s.scenarioType === "OPTIMISTIC")!;

  const explanation = `Recommendation: ${recommendedScenario} scenario\n\n` +
    `Decision Score: ${decisionScore}/100\n\n` +
    `Why this scenario?\n` +
    `- Expected incremental net impact: ${formatMoney(Math.abs(expectedNetImpact))} ${
      expectedNetImpact >= 0 ? "(positive)" : "(negative)"
    }\n` +
    `- Expected ROI: ${expectedROI > 0 ? expectedROI + "x" : "undefined"}\n` +
    `- Confidence: ${confidence}%\n` +
    `- Risk level: ${riskLevelToString(riskScore)}\n\n` +
    `Compared to alternatives:\n` +
    `- ${worstScenario.scenarioType} scenario: ${formatMoney(Math.abs(worstScenario.expectedNetImpactMinor))} ${
      worstScenario.expectedNetImpactMinor >= 0 ? "(positive)" : "(negative)"
    } net impact\n` +
    `- ${bestScenario.scenarioType} scenario: ${formatMoney(Math.abs(bestScenario.expectedNetImpactMinor))} ${
      bestScenario.expectedNetImpactMinor >= 0 ? "(positive)" : "(negative)"
    } net impact (optimistic)\n\n` +
    `Data quality: ${baseline.dataQuality}/100. ` +
    `Eligible customers: ${baseline.eligibleCustomers}.`;

  // Step 5: Return complete output
  return {
    input,
    baseline,
    scenarios,
    recommendedScenario,
    decisionScore,
    explanation,
    riskLevel: riskLevelToString(riskScore),
    confidence,
    createdAt: new Date(),
  };
}

/** Convert riskScore (0-100) to riskLevel string */
function riskLevelToString(score: number): "LOW" | "MEDIUM" | "HIGH" {
  return score >= 70 ? "HIGH" : score >= 40 ? "MEDIUM" : "LOW";
}

/** End of simulation-agent module */