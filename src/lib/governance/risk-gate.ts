import { prisma } from "@/lib/prisma";
import { runRiskAnalysis } from "@/lib/intelligence/risk";

export interface RiskGateResult {
  decision: "PASS" | "REQUIRE_APPROVAL" | "BLOCK";
  riskScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  policyId: string | null;
  reasonCode: string;
  explanation: string;
}

export interface RiskGateInput {
  riskScore: number;
  policyId?: string;
  overrideRiskThresholdLow?: number;
  overrideRiskThresholdHigh?: number;
}

export async function evaluateRiskGate(
  input: RiskGateInput
): Promise<RiskGateResult> {
  const { riskScore, policyId: policyIdInput, overrideRiskThresholdLow, overrideRiskThresholdHigh } = input;

  let thresholdLow = overrideRiskThresholdLow ?? 40;
  let thresholdHigh = overrideRiskThresholdHigh ?? 70;

  if (policyIdInput) {
    try {
      const { prisma } = await import("@/lib/prisma");
      const policy = await prisma.policy.findUnique({ where: { id: policyIdInput } });
      if (policy && policy.isActive && policy.conditionType === "RISK_SCORE") {
        if (policy.conditionOperator === "GTE") {
          thresholdHigh = policy.conditionValue;
        } else if (policy.conditionOperator === "LTE") {
          thresholdLow = policy.conditionValue;
        } else if (policy.conditionOperator === "EQ") {
          thresholdHigh = policy.conditionValue;
          thresholdLow = policy.conditionValue;
        }
      }
    } catch (error) { /* Fall back to defaults */ }
  }

  let riskLevel: "LOW" | "MEDIUM" | "HIGH";
  let decision: "PASS" | "REQUIRE_APPROVAL" | "BLOCK";
  let reasonCode = "";

  if (riskScore >= thresholdHigh) {
    riskLevel = "HIGH"; decision = "BLOCK"; reasonCode = "RISK_TOO_HIGH";
  } else if (riskScore >= thresholdLow) {
    riskLevel = "MEDIUM"; decision = "REQUIRE_APPROVAL"; reasonCode = "RISK_MEDIUM";
  } else {
    riskLevel = "LOW"; decision = "PASS"; reasonCode = "RISK_LOW";
  }

  const explanation = `Risk score: ${riskScore}/100 (${riskLevel}). Thresholds: PASS < ${thresholdLow}, REQUIRE_APPROVAL [${thresholdLow}-${thresholdHigh}), BLOCK >= ${thresholdHigh}.`;

  return { decision, riskScore, riskLevel, policyId: policyIdInput || null, reasonCode, explanation };
}
