/** Re-export all strategy-related types and functions */
export type {
  StrategyType,
  StrategyCandidate,
  StrategyFinancials,
} from "@/lib/intelligence/strategy/generator";

/** Strategy generation functions */
export {
  generateStrategiesForHighValueInactive,
  generateStrategiesForCartAbandonment,
  generateStrategiesForUpsell,
  generateStrategiesForCrossSell,
} from "@/lib/intelligence/strategy/generator";

/** Strategy ranking functions */
export function rankStrategies(
  strategies: import("@/lib/intelligence/strategy/generator").StrategyCandidate[]
): import("@/lib/intelligence/strategy/generator").StrategyCandidate[] {
  return [...strategies].sort(
    (a, b) => b.financials.estimatedROI - a.financials.estimatedROI
  );
}

export function selectTopStrategies(
  strategies: import("@/lib/intelligence/strategy/generator").StrategyCandidate[],
  maxCount = 4
): import("@/lib/intelligence/strategy/generator").StrategyCandidate[] {
  return rankStrategies(strategies).slice(0, maxCount);
}