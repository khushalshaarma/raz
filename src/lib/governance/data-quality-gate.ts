import { prisma } from "@/lib/prisma";
import { calculateDataQuality, DataQualityResult } from "@/lib/intelligence/data-quality";

export interface DataQualityGateResult {
  decision: "PASS" | "REQUIRE_APPROVAL" | "BLOCK";
  dataQualityScore: number;
  insufficient: boolean;
  minimumThreshold: number;
  policyId: string | null;
  reasonCode: string;
  explanation: string;
}

export interface DataQualityGateInput {
  customerCount: number;
  orderCount: number;
  historicalSpanDays: number;
  missingFieldsCount?: number;
  categoryCoverage?: number;
  paymentDataAvailable?: boolean;
  historicalOutcomeCount?: number;
  policyId?: string;
}

export async function evaluateDataQualityGate(
  input: DataQualityGateInput
): Promise<DataQualityGateResult> {
  const { customerCount, orderCount, historicalSpanDays, missingFieldsCount = 0, categoryCoverage = 0, paymentDataAvailable = false, historicalOutcomeCount = 0, policyId: policyIdInput } = input;

  const dqResult: DataQualityResult = await calculateDataQuality(
    customerCount, orderCount, historicalSpanDays, missingFieldsCount, categoryCoverage, paymentDataAvailable, historicalOutcomeCount
  );

  let decision: "PASS" | "REQUIRE_APPROVAL" | "BLOCK" = "PASS";
  let reasonCode = "";

  if (dqResult.dataQualityScore < dqResult.minimumThreshold) {
    decision = "BLOCK";
    reasonCode = "DATA_INSUFFICIENT";

    if (policyIdInput) {
      try {
        const { prisma } = await import("@/lib/prisma");
        const policy = await prisma.policy.findUnique({ where: { id: policyIdInput } });
        if (policy && policy.isActive) {
          if (policy.conditionType === "DATA_QUALITY") {
            const val = policy.conditionValue;
            if (policy.conditionOperator === "GTE" && val <= dqResult.dataQualityScore) {
              decision = "PASS";
              reasonCode = "POLICY_DATA_QUALITY_OK";
            } else if (policy.conditionOperator === "LTE" && val >= dqResult.dataQualityScore) {
              decision = "REQUIRE_APPROVAL";
              reasonCode = "POLICY_DATA_QUALITY_APPROVAL";
            }
          }
        }
      } catch (error) { /* Fall back to default BLOCK */ }
    }
  } else {
    decision = "PASS";
    reasonCode = "DATA_QUALITY_SUFFICIENT";

    if (policyIdInput) {
      try {
        const { prisma } = await import("@/lib/prisma");
        const policy = await prisma.policy.findUnique({ where: { id: policyIdInput } });
        if (policy && policy.isActive && policy.conditionType === "DATA_QUALITY") {
          if (policy.conditionOperator === "LTE" && policy.conditionValue >= dqResult.dataQualityScore) {
            decision = "REQUIRE_APPROVAL";
            reasonCode = "POLICY_DATA_QUALITY_REQUIRES_APPROVAL";
          }
        }
      } catch (error) { /* Fall back to PASS */ }
    }
  }

  const explanation = `Data quality score: ${dqResult.dataQualityScore}/100 (${dqResult.insufficient ? "INSUFFICIENT" : "SUPPLIED"}). Minimum threshold: ${dqResult.minimumThreshold}/100. Reason: ${reasonCode}.`;

  return {
    decision, dataQualityScore: dqResult.dataQualityScore, insufficient: dqResult.insufficient,
    minimumThreshold: dqResult.minimumThreshold, policyId: policyIdInput || null, reasonCode, explanation,
  };
}
