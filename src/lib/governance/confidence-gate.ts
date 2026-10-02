import { prisma } from "@/lib/prisma";

export interface ConfidenceGateResult {
  decision: "PASS" | "REQUIRE_APPROVAL" | "BLOCK";
  confidenceScore: number;
  confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
  policyId: string | null;
  reasonCode: string;
  explanation: string;
}

export interface ConfidenceGateInput {
  confidenceScore: number;
  policyId?: string;
  overrideConfidenceThresholdPass?: number;
  overrideConfidenceThresholdApproved?: number;
}

export async function evaluateConfidenceGate(
  input: ConfidenceGateInput
): Promise<ConfidenceGateResult> {
  const { confidenceScore, policyId: policyIdInput, overrideConfidenceThresholdPass, overrideConfidenceThresholdApproved } = input;

  let thresholdPass = overrideConfidenceThresholdPass ?? 70;
  let thresholdApproved = overrideConfidenceThresholdApproved ?? 60;

  if (policyIdInput) {
    try {
      const { prisma } = await import("@/lib/prisma");
      const policy = await prisma.policy.findUnique({ where: { id: policyIdInput } });
      if (policy && policy.isActive && policy.conditionType === "CONFIDENCE_SCORE") {
        if (policy.conditionOperator === "GTE") {
          thresholdPass = policy.conditionValue;
        } else if (policy.conditionOperator === "LTE") {
          thresholdApproved = policy.conditionValue;
        } else if (policy.conditionOperator === "EQ") {
          thresholdPass = policy.conditionValue;
          thresholdApproved = policy.conditionValue;
        }
      }
    } catch (error) { /* Fall back to defaults */ }
  }

  let confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
  let decision: "PASS" | "REQUIRE_APPROVAL" | "BLOCK";
  let reasonCode = "";

  if (confidenceScore >= thresholdPass) {
    confidenceLevel = "HIGH"; decision = "PASS"; reasonCode = "CONFIDENCE_HIGH";
  } else if (confidenceScore >= thresholdApproved) {
    confidenceLevel = "MEDIUM"; decision = "REQUIRE_APPROVAL"; reasonCode = "CONFIDENCE_MEDIUM";
  } else {
    confidenceLevel = "LOW"; decision = "BLOCK"; reasonCode = "CONFIDENCE_LOW";
  }

  const explanation = `Confidence score: ${confidenceScore}/100 (${confidenceLevel}). Thresholds: PASS >= ${thresholdPass}, REQUIRE_APPROVAL [${thresholdApproved}-${thresholdPass}), BLOCK < ${thresholdApproved}.`;

  return { decision, confidenceScore, confidenceLevel, policyId: policyIdInput || null, reasonCode, explanation };
}
