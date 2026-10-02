/** Re-export all opportunity-related types and functions */
export type {
  OpportunityType,
  OpportunityStatus,
  OpportunityEvidence,
  OpportunityCreateInput,
  DetectedOpportunity,
  ScoreComponents,
  OpportunityScoreResult,
} from "@/lib/intelligence/opportunity/detector";

/** Strategy types - from strategy module */
export type {
  StrategyType,
  StrategyCandidate,
  StrategyFinancials,
} from "@/lib/intelligence/strategy/generator";

/** Core scoring function */
export { computeOpportunityScore, generateOpportunityExplanation, formatMoney } from "@/lib/intelligence/opportunity/scorer";
/** Strategy generation functions */
export {
  generateStrategiesForHighValueInactive,
  generateStrategiesForCartAbandonment,
  generateStrategiesForUpsell,
  generateStrategiesForCrossSell,
} from "@/lib/intelligence/strategy/generator";
/** Strategy ranking functions */
export { rankStrategies, selectTopStrategies } from "@/lib/intelligence/strategy";