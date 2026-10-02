import { prisma } from "@/lib/prisma";
import { Policy } from "@prisma/client";

export type ConditionOperator = "GTE" | "LTE" | "EQ" | "NEQ" | "GT" | "LT";
export type ConditionType =
  | "DATA_QUALITY" | "RISK_SCORE" | "CONFIDENCE_SCORE"
  | "VELOCITY" | "SPEND" | "CUSTOMER_SEGMENT" | "CUSTOM";

export interface PolicyEvaluationResult {
  decision: "ALLOW" | "BLOCK" | "REQUIRE_APPROVAL";
  policyId: string | null;
  policyVersion: number;
  matchedRules: Array<{ ruleKey: string; ruleValue: number; operator: ConditionOperator }>;
  violations: Array<{ ruleKey: string; reasonCode: string }>;
  reasonCodes: Array<string>;
  evaluatedAt: Date;
  isActive: boolean;
}

export interface PolicyEvaluationContext {
  riskScore: number;
  confidenceScore: number;
  dataQualityScore: number;
  velocity: number;
  spendMinor: number;
  customerSegment?: string;
  custom?: Record<string, number | string | boolean>;
}

export async function evaluatePolicy(
  policyId: string,
  context: PolicyEvaluationContext
): Promise<PolicyEvaluationResult> {
  const { prisma } = await import("@/lib/prisma");
  const policy = await prisma.policy.findUnique({ where: { id: policyId } });
  if (!policy || !policy.isActive) {
    return {
      decision: "BLOCK", policyId: null, policyVersion: 0,
      matchedRules: [], violations: [], reasonCodes: ["POLICY_NOT_FOUND"],
      evaluatedAt: new Date(), isActive: false,
    };
  }

  let finalDecision: "ALLOW" | "BLOCK" | "REQUIRE_APPROVAL" = "ALLOW";
  let accumulatedViolations: Array<{ ruleKey: string; reasonCode: string }> = [];
  let matchedRules: Array<{ ruleKey: string; ruleValue: number; operator: ConditionOperator }> = [];
  const reasonCodes: Array<string> = [];

  // Use the Policy's own condition fields
  const ruleResult = evaluatePolicyRule(policy, context);
  matchedRules.push({
    ruleKey: policy.conditionType,
    ruleValue: policy.conditionValue,
    operator: policy.conditionOperator as ConditionOperator,
  });

  if (ruleResult.decision === "NEUTRAL") {
    reasonCodes.push(`RULE_SKIP_${policy.conditionType}`);
  } else if (ruleResult.decision === "ALLOW") {
    reasonCodes.push(ruleResult.reasonCode);
  } else if (ruleResult.decision === "BLOCK") {
    reasonCodes.push(ruleResult.reasonCode);
  }

  if (policy.conditionType === "CUSTOM") {
    finalDecision = "BLOCK";
  } else {
    finalDecision = policy.action as "ALLOW" | "BLOCK" | "REQUIRE_APPROVAL";
  }

  return {
    decision: finalDecision,
    policyId: policy.id,
    policyVersion: policy.version ?? 1,
    matchedRules,
    violations: accumulatedViolations,
    reasonCodes,
    evaluatedAt: new Date(),
    isActive: policy.isActive,
  };
}

function evaluatePolicyRule(
  policy: Policy,
  context: PolicyEvaluationContext
): { decision: "ALLOW" | "BLOCK" | "REQUIRE_APPROVAL" | "NEUTRAL"; reasonCode: string } {
  const ruleKey = policy.conditionType;
  const ruleOperator = policy.conditionOperator as ConditionOperator;
  const ruleValue = policy.conditionValue;
  const value = getContextValue(ruleKey, context);

  if (value === undefined) {
    return { decision: "NEUTRAL", reasonCode: `NO_VALUE_FOR_${ruleKey}` };
  }

  if (ruleOperator === undefined) {
    return { decision: "NEUTRAL", reasonCode: `UNSUPPORTED_OPERATOR` };
  }

  if (ruleKey === "CUSTOM") {
    return { decision: "BLOCK", reasonCode: "CUSTOM_CONDITION_BLOCK" };
  }

  let conditionMet = false;
  let reasonCode = "";

  switch (ruleOperator) {
    case "GTE": conditionMet = value >= ruleValue; reasonCode = conditionMet ? "POLICY_ALLOW" : "POLICY_BLOCK"; break;
    case "LTE": conditionMet = value <= ruleValue; reasonCode = conditionMet ? "POLICY_ALLOW" : "POLICY_BLOCK"; break;
    case "EQ": conditionMet = value === ruleValue; reasonCode = conditionMet ? "POLICY_ALLOW" : "POLICY_BLOCK"; break;
    case "NEQ": conditionMet = value !== ruleValue; reasonCode = conditionMet ? "POLICY_ALLOW" : "POLICY_BLOCK"; break;
    case "GT": conditionMet = value > ruleValue; reasonCode = conditionMet ? "POLICY_ALLOW" : "POLICY_BLOCK"; break;
    case "LT": conditionMet = value < ruleValue; reasonCode = conditionMet ? "POLICY_ALLOW" : "POLICY_BLOCK"; break;
    default: return { decision: "NEUTRAL", reasonCode: `UNKNOWN_OPERATOR_${ruleOperator}` };
  }

  return {
    decision: conditionMet ? "ALLOW" : "BLOCK",
    reasonCode,
  };
}

function getContextValue(ruleKey: string, context: PolicyEvaluationContext): number | undefined {
  switch (ruleKey) {
    case "RISK_SCORE": return context.riskScore;
    case "CONFIDENCE_SCORE": return context.confidenceScore;
    case "DATA_QUALITY": return context.dataQualityScore;
    case "VELOCITY": return context.velocity;
    case "SPEND": return context.spendMinor;
    case "CUSTOMER_SEGMENT":
      if (context.customerSegment) {
        const segmentMap: Record<string, number> = { "VIP": 100, "PREMIUM": 75, "STANDARD": 50, "ECONOMY": 25 };
        return segmentMap[context.customerSegment] ?? 0;
      }
      return undefined;
    case "CUSTOM":
      if (context.custom && ruleKey in context.custom) {
        const val = context.custom[ruleKey as keyof typeof context.custom];
        return typeof val === "number" ? val : undefined;
      }
      return undefined;
    default: return undefined;
  }
}
