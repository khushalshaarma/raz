import { prisma } from "@/lib/prisma";
import { ActionTypeFull } from "@/lib/governance/action";

export interface ApprovalResult {
  decision:
    | "NO_APPROVAL_REQUIRED"
    | "MERCHANT_APPROVAL_REQUIRED"
    | "ADMIN_APPROVAL_REQUIRED"
    | "DUAL_APPROVAL_REQUIRED"
    | "REQUIRE_APPROVAL"
    | "BLOCKED";

  requiresFourEyes: boolean;
  requiredRole: "MERCHANT" | "ADMIN" | "DUAL";
  expiresAt?: Date;
  reasonCode: string;
  explanation: string;
}

export interface ApprovalEngineInput {
  riskScore: number;
  confidenceScore: number;
  amountMinor: number;
  actionType: ActionTypeFull;
  customerCount: number;
  securityResult: {
    securityLevel: "SECURE" | "SUSPICIOUS" | "BLOCKED";
    reasonCodes: Array<string>;
  };
  policyId?: string;
  merchantAutoApproval?: boolean;
  adminOverrideAvailable?: boolean;
}

export async function evaluateApproval(
  input: ApprovalEngineInput
): Promise<ApprovalResult> {
  const {
    riskScore,
    confidenceScore,
    amountMinor,
    actionType,
    customerCount,
    securityResult,
    policyId,
    merchantAutoApproval = false,
    adminOverrideAvailable = false,
  } = input;

  if (securityResult.securityLevel === "BLOCKED") {
    return {
      decision: "BLOCKED",
      requiresFourEyes: false,
      requiredRole: "MERCHANT",
      reasonCode: "SECURITY_BLOCKED",
      explanation: "Action blocked by security agent. Cannot approve.",
    };
  }

  const highRisk = riskScore >= 70;
  const lowConfidence = confidenceScore < 60;

  if (highRisk) {
    return {
      decision: "BLOCKED",
      requiresFourEyes: false,
      requiredRole: "MERCHANT",
      reasonCode: "RISK_TOO_HIGH_FOR_APPROVAL",
      explanation: `Risk score ${riskScore} is HIGH (>=70). Cannot approve high-risk actions.`,
    };
  }

  if (lowConfidence) {
    if (policyId) {
      try {
        const policy = await prisma.policy.findUnique({ where: { id: policyId } });
        if (policy && policy.isActive && policy.conditionType === "CONFIDENCE_SCORE") {
          if (policy.conditionOperator === "LTE" && policy.conditionValue >= confidenceScore) {
            return {
              decision: "BLOCKED",
              requiresFourEyes: false,
              requiredRole: "MERCHANT",
              reasonCode: "CONFIDENCE_LOW_POLICY_APPROVAL",
              explanation: `Confidence score ${confidenceScore} is LOW. Policy requires approval.`,
            };
          }
        }
      } catch (error) {
        // Fall through to defaults
      }
    }

    const requiredRole = customerCount > 50 ? "ADMIN" : "MERCHANT";

    return {
      decision: "REQUIRE_APPROVAL",
      requiresFourEyes: true,
      requiredRole: requiredRole as "MERCHANT" | "ADMIN" | "DUAL",
      reasonCode: "CONFIDENCE_TOO_LOW",
      explanation: `Confidence score ${confidenceScore} is LOW. Approval required.`,
    };
  }

  const largeAmount = amountMinor >= 500000;
  const veryLargeAmount = amountMinor >= 2000000;

  if (veryLargeAmount) {
    return {
      decision: "DUAL_APPROVAL_REQUIRED",
      requiresFourEyes: true,
      requiredRole: "DUAL",
      reasonCode: "AMOUNT_VERY_LARGE",
      explanation: `Amount ₹${(amountMinor / 100).toFixed(2)} is very large. Dual approval required.`,
    };
  }

  if (largeAmount && !merchantAutoApproval) {
    return {
      decision: "MERCHANT_APPROVAL_REQUIRED",
      requiresFourEyes: true,
      requiredRole: "MERCHANT",
      reasonCode: "AMOUNT_LARGE",
      explanation: `Amount ₹${(amountMinor / 100).toFixed(2)} is large. Merchant approval required.`,
    };
  }

  if (customerCount >= 100) {
    return {
      decision: "ADMIN_APPROVAL_REQUIRED",
      requiresFourEyes: true,
      requiredRole: "ADMIN",
      reasonCode: "LARGE_CUSTOMER_BASE",
      explanation: `Customer count ${customerCount} is large. Admin approval required.`,
    };
  }

  if (customerCount >= 20) {
    return {
      decision: "MERCHANT_APPROVAL_REQUIRED",
      requiresFourEyes: true,
      requiredRole: "MERCHANT",
      reasonCode: "MODERATE_CUSTOMER_BASE",
      explanation: `Customer count ${customerCount}. Merchant approval with four-eyes required.`,
    };
  }

  if (securityResult.securityLevel === "SUSPICIOUS") {
    return {
      decision: "REQUIRE_APPROVAL",
      requiresFourEyes: true,
      requiredRole: "ADMIN",
      reasonCode: "SECURITY_SUSPICIOUS",
      explanation: "Security agent flagged action as SUSPICIOUS. Admin approval required.",
    };
  }

  return {
    decision: "NO_APPROVAL_REQUIRED",
    requiresFourEyes: false,
    requiredRole: "MERCHANT",
    reasonCode: "NO_APPROVAL_NEEDED",
    explanation: "No approval required. Action can proceed.",
  };
}
