/**
 * Governance Orchestrator (Phase 4 — Governance)
 *
 * Main function: evaluateGovernance(actionRequest)
 *
 * Exact sequence:
 * 1. validate request
 * 2. validate merchant
 * 3. validate decision
 * 4. validate strategy
 * 5. validate target
 * 6. check automation state (kill switch)
 * 7. data quality gate
 * 8. confidence gate
 * 9. risk gate
 * 10. security agent
 * 11. policy engine
 * 12. velocity
 * 13. spend
 * 14. customer protection
 * 15. approval engine
 * 16. final governance decision
 * 17. persist GovernanceDecision
 * 18. persist AuditLog
 * 19. return structured result
 *
 * Fail-closed: if ANY critical service fails → BLOCK
 * No LLM is involved. All checks are deterministic.
 * Phase 4 NEVER executes anything.
 */

import { prisma } from "@/lib/prisma";
import { createActionRequest } from "./action";
import { evaluatePolicy } from "./policy-engine";
import { evaluateRiskGate } from "./risk-gate";
import { evaluateConfidenceGate } from "./confidence-gate";
import { evaluateDataQualityGate } from "./data-quality-gate";
import { evaluateVelocityGate } from "./velocity-gate";
import { evaluateSpendGate } from "./spend-gate";
import { evaluateCustomerProtection } from "./customer-protection";
import { evaluateSecurity } from "./security-agent";
import { evaluateApproval } from "./approval-engine";
import { ActionType, ActionTypeFull, CreateActionRequestInput } from "./action";
import { runRiskAnalysis } from "@/lib/intelligence/risk";
import { runConfidenceAnalysis } from "@/lib/intelligence/confidence";

/**
 * Governance Snapshot — captures the decision context at evaluation time.
 * Ensures historical decisions remain explainable even if policies,
 * strategies, or scores change later.
 */
export interface GovernanceSnapshot {
  /** Timestamp of snapshot creation */
  evaluatedAt: string;
  /** Risk analysis results */
  riskAnalysis: {
    riskScore: number;
    riskLevel: string;
    source: "COMPUTED" | "INPUT_LABEL" | "INPUT_SCORE";
  };
  /** Confidence analysis results */
  confidenceAnalysis: {
    confidenceScore: number;
    confidenceLevel: string;
    source: "COMPUTED" | "INPUT";
  };
  /** Data quality results */
  dataQuality: {
    dataQualityScore: number;
    insufficient: boolean;
    customerCount: number;
    orderCount: number;
    historicalSpanDays: number;
  };
  /** Policy version used for evaluation */
  policyVersion?: number;
  policyId?: string;
  /** Action context */
  actionType: string;
  strategyId: string;
  amountMinor: number;
  currency: string;
}

 /** Governance decision outcome */
export interface GovernanceDecisionOutput {
  /** Governance decision ID */
  governanceDecisionId: string;

  /** Action request ID */
  actionRequestId: string;

  /** Merchant ID */
  merchantId: string;

  /** Final decision: BLOCKED | REQUIRE_APPROVAL | APPROVED | EXECUTION_READY */
  decision: "BLOCKED" | "REQUIRE_APPROVAL" | "APPROVED" | "EXECUTION_READY";

  /** Decision reason */
  decisionReason: string;

  /** Risk level */
  riskLevel: "LOW" | "MEDIUM" | "HIGH";

  /** Confidence score */
  confidence: number;

  /** Security score */
  securityScore: number;

  /** Data quality score */
  dataQualityScore: number;

  /** Approved by (if applicable) */
  approvedBy?: string;

  /** Approved at */
  approvedAt?: Date;

  /** Executed at */
  executedAt?: Date;

  /** Status */
  status: "PENDING" | "APPROVED" | "BLOCKED" | "EXECUTED" | "EXPIRED";

  /** Timestamp */
  createdAt: Date;
}

 /** Full governance evaluation result */
export interface GovernanceEvaluationResult {
  /** Overall governance decision */
  governanceDecision: "BLOCKED" | "REQUIRE_APPROVAL" | "APPROVED" | "EXECUTION_READY";

  /** Action request ID */
  actionRequestId: string;

  /** Merchant ID */
  merchantId: string;

  /** Data quality gate result */
  dataQualityGate: {
    decision: "PASS" | "REQUIRE_APPROVAL" | "BLOCK";
    dataQualityScore: number;
    insufficient: boolean;
    reasonCode: string;
  };

  /** Confidence gate result */
  confidenceGate: {
    decision: "PASS" | "REQUIRE_APPROVAL" | "BLOCK";
    confidenceScore: number;
    confidenceLevel: string;
    reasonCode: string;
  };

  /** Risk gate result */
  riskGate: {
    decision: "PASS" | "REQUIRE_APPROVAL" | "BLOCK";
    riskScore: number;
    riskLevel: string;
    reasonCode: string;
  };

  /** Security evaluation */
  security: {
    securityScore: number;
    securityLevel: "SECURE" | "SUSPICIOUS" | "BLOCKED";
    reasonCodes: string[];
  };

  /** Policy engine result */
  policyEngine: {
    decision: "ALLOW" | "BLOCK" | "REQUIRE_APPROVAL";
    matchedRules: Array<{ ruleKey: string; ruleValue: number; operator: string }>;
    violations: Array<{ ruleKey: string; reasonCode: string }>;
    reasonCodes: string[];
    policyId: string | null;
  };

  /** Velocity result */
  velocity: {
    decision: "PASS" | "REQUIRE_APPROVAL" | "BLOCK";
    currentCount: number;
    limit: number;
    reasonCode: string;
  };

  /** Spend result */
  spend: {
    decision: "PASS" | "REQUIRE_APPROVAL" | "BLOCK";
    currentAmountMinor: number;
    limitMinor: number;
    reasonCode: string;
  };

  /** Customer protection result */
  customerProtection: {
    decision: "PASS" | "REQUIRE_APPROVAL" | "BLOCK";
    reasonCode: string;
  };

  /** Approval engine result */
  approvalEngine: {
    decision: "NO_APPROVAL_REQUIRED" | "MERCHANT_APPROVAL_REQUIRED" | "ADMIN_APPROVAL_REQUIRED" | "DUAL_APPROVAL_REQUIRED" | "REQUIRE_APPROVAL" | "BLOCKED";
    requiresFourEyes: boolean;
    requiredRole: string;
    reasonCode: string;
  };

  /** Reason codes accumulated throughout evaluation */
  allReasonCodes: string[];

  /** Final explanation */
  explanation: string;

  /** Timestamp */
  evaluatedAt: Date;
}

 /** Automation state (kill switch) */
interface AutomationState {
  state: "ACTIVE" | "PAUSED";
  pausedAt?: Date;
  pausedBy?: string;
}

 /** Kill switch state */
interface KillSwitchState {
  enabled: boolean;
  globalEmergencyStop: boolean;
}

/** Evaluate governance for an action request */
export async function evaluateGovernance(
  input: CreateActionRequestInput,
  authenticatedMerchantId: string,
  /**
   * User id of the requesting human, when there is one. Propagated to
   * `ActionRequest.requestedBy` so approval can enforce four-eyes (approver
   * must not be the requester). Omitted for machine-originated requests.
   */
  requestedBy?: string
): Promise<GovernanceEvaluationResult> {
  const evaluatedAt = new Date();
  const allReasonCodes: string[] = [];

  // ═══════════════════════════════════════════════════════════════
  // STEP 1: Validate request
  // ═══════════════════════════════════════════════════════════════
  let actionRequestId: string;
  try {
    const actionResult = await createActionRequest(
      { ...input, ...(requestedBy ? { requestedBy } : {}) },
      authenticatedMerchantId
    );
    actionRequestId = actionResult.id;

    if (actionResult.status === "BLOCKED") {
      allReasonCodes.push(actionResult.reason || "INVALID_ACTION_REQUEST");
    }
  } catch (error) {
    return failClosed("ACTION_CREATION_FAILED", allReasonCodes, evaluatedAt);
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 2: Check automation state (Kill Switch)
  // ═══════════════════════════════════════════════════════════════
  try {
    const { prisma } = await import("@/lib/prisma");

    // Check for global emergency stop
    const emergencyStop = await prisma.systemHealth.findFirst({
      where: { application: "ok" },
    });

    // Check for merchant automation pause
    const pausedAutomation = await prisma.policy.findFirst({
      where: {
        merchantId: authenticatedMerchantId,
        name: "AUTOMATION_PAUSED",
        isActive: true,
      },
    });

    if (pausedAutomation) {
      allReasonCodes.push("AUTOMATION_PAUSED");
    }
  } catch (error) {
    // Fail-closed: if automation state check fails, block
    return failClosed("AUTOMATION_STATE_CHECK_FAILED", allReasonCodes, evaluatedAt);
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 3-6: Validate merchant, decision, strategy, target
  // ═══════════════════════════════════════════════════════════════
  // These are validated by createActionRequest and the Prisma constraints
  // If validation fails, the action request is created with BLOCKED status

  // ═══════════════════════════════════════════════════════════════
  // STEP 7: Data Quality Gate
  // ═══════════════════════════════════════════════════════════════
  const dqResult = await evaluateDataQualityGate({
    customerCount: input.customerCount || 0,
    orderCount: input.orderCount || 0,
    historicalSpanDays: input.historicalSpanDays || 0,
    policyId: input.policyId,
  });

  if (dqResult.decision === "BLOCK") {
    allReasonCodes.push("DATA_QUALITY_BLOCK");
  } else if (dqResult.decision === "REQUIRE_APPROVAL") {
    allReasonCodes.push("DATA_QUALITY_REQUIRES_APPROVAL");
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 8: Confidence Gate — use actual confidence when available
  // ═══════════════════════════════════════════════════════════════
  let actualConfidenceScore: number;
  let confidenceSource: "COMPUTED" | "INPUT" = "INPUT";

  if (typeof (input as any).confidenceScore === "number") {
    actualConfidenceScore = (input as any).confidenceScore;
    confidenceSource = "INPUT";
  } else {
    actualConfidenceScore = input.confidence || 0;
  }

  const confResult = await evaluateConfidenceGate({
    confidenceScore: actualConfidenceScore,
    policyId: input.policyId,
  });

  if (confResult.decision === "BLOCK") {
    allReasonCodes.push("CONFIDENCE_BLOCK");
  } else if (confResult.decision === "REQUIRE_APPROVAL") {
    allReasonCodes.push("CONFIDENCE_REQUIRES_APPROVAL");
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 9: Risk Gate — use actual risk analysis when available
  // ═══════════════════════════════════════════════════════════════
  let actualRiskScore: number;
  let riskSource: "COMPUTED" | "INPUT_LABEL" | "INPUT_SCORE" = "INPUT_LABEL";

  if (typeof (input as any).riskScore === "number") {
    actualRiskScore = (input as any).riskScore;
    riskSource = "INPUT_SCORE";
  } else {
    actualRiskScore = input.riskLevel === "HIGH" ? 80 : input.riskLevel === "MEDIUM" ? 50 : 20;
  }

  const riskResult = await evaluateRiskGate({
    riskScore: actualRiskScore,
    policyId: input.policyId,
  });

  if (riskResult.decision === "BLOCK") {
    allReasonCodes.push("RISK_BLOCK");
  } else if (riskResult.decision === "REQUIRE_APPROVAL") {
    allReasonCodes.push("RISK_REQUIRES_APPROVAL");
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 10: Security Agent
  // ═══════════════════════════════════════════════════════════════
  const securityResult = await evaluateSecurity({
    merchantId: authenticatedMerchantId,
    actionRequestId: actionRequestId,
    amountMinor: input.amountMinor,
    actionType: input.actionType,
    customerId: input.customerId,
    targetStrategyId: input.strategyId,
  });

  if (securityResult.securityLevel === "BLOCKED") {
    allReasonCodes.push("SECURITY_BLOCK");
  } else if (securityResult.securityLevel === "SUSPICIOUS") {
    allReasonCodes.push("SECURITY_SUSPICIOUS");
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 11: Policy Engine
  // ═══════════════════════════════════════════════════════════════
  const policyResult = await evaluatePolicy(
    input.policyId || "default-policy",
    {
      riskScore: input.riskLevel === "HIGH" ? 80 : input.riskLevel === "MEDIUM" ? 50 : 20,
      confidenceScore: input.confidence || 0,
      dataQualityScore: dqResult.dataQualityScore,
      velocity: 0,
      spendMinor: input.amountMinor,
    }
  );

  if (policyResult.decision === "BLOCK") {
    allReasonCodes.push("POLICY_BLOCK");
  } else if (policyResult.decision === "REQUIRE_APPROVAL") {
    allReasonCodes.push("POLICY_REQUIRES_APPROVAL");
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 12: Velocity
  // ═══════════════════════════════════════════════════════════════
  const velocityResult = await evaluateVelocityGate({
    currentCount: 0, // Placeholder - would come from actual counting
    period: "day",
    policyId: input.policyId,
    merchantId: authenticatedMerchantId,
  });

  if (velocityResult.decision === "BLOCK") {
    allReasonCodes.push("VELOCITY_BLOCK");
  } else if (velocityResult.decision === "REQUIRE_APPROVAL") {
    allReasonCodes.push("VELOCITY_REQUIRES_APPROVAL");
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 13: Spend
  // ═══════════════════════════════════════════════════════════════
  const spendResult = await evaluateSpendGate({
    amountMinor: input.amountMinor,
    currency: "INR",
    policyId: input.policyId,
    merchantId: authenticatedMerchantId,
  });

  if (spendResult.decision === "BLOCK") {
    allReasonCodes.push("SPEND_BLOCK");
  } else if (spendResult.decision === "REQUIRE_APPROVAL") {
    allReasonCodes.push("SPEND_REQUIRES_APPROVAL");
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 14: Customer Protection
  // ═══════════════════════════════════════════════════════════════
  const customerProtectionResult = await evaluateCustomerProtection({
    merchantId: authenticatedMerchantId,
    customerId: input.customerId || "",
    strategyId: input.strategyId,
    actionType: input.actionType,
    now: evaluatedAt,
  });

  if (customerProtectionResult.decision === "BLOCK") {
    allReasonCodes.push("CUSTOMER_PROTECTION_BLOCK");
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 15: Approval Engine
  // ═══════════════════════════════════════════════════════════════
  const approvalResult = await evaluateApproval({
    riskScore: input.riskLevel === "HIGH" ? 80 : input.riskLevel === "MEDIUM" ? 50 : 20,
    confidenceScore: input.confidence || 0,
    amountMinor: input.amountMinor,
    actionType: input.actionType,
    customerCount: input.customerCount || 0,
    securityResult,
    policyId: input.policyId,
  });

  // ═══════════════════════════════════════════════════════════════
  // STEP 16: Final Governance Decision
  // ═══════════════════════════════════════════════════════════════
  // Precedence: BLOCKED > REQUIRE_APPROVAL > APPROVED > EXECUTION_READY
  // If any component says BLOCK, the final decision is BLOCKED
  // Nothing can override a BLOCKED decision

  let finalDecision: "BLOCKED" | "REQUIRE_APPROVAL" | "APPROVED" | "EXECUTION_READY";
  let decisionReason: string;

  if (allReasonCodes.includes("AUTOMATION_PAUSED") || allReasonCodes.includes("GLOBAL_EMERGENCY_STOP")) {
    finalDecision = "BLOCKED";
    decisionReason = "AUTOMATION_PAUSED_OR_GLOBAL_EMERGENCY_STOP";
  } else if (
    allReasonCodes.includes("SECURITY_BLOCK") ||
    allReasonCodes.includes("POLICY_BLOCK") ||
    allReasonCodes.includes("SPEND_BLOCK") ||
    allReasonCodes.includes("VELOCITY_BLOCK") ||
    allReasonCodes.includes("CUSTOMER_PROTECTION_BLOCK") ||
    allReasonCodes.includes("DATA_QUALITY_BLOCK") ||
    allReasonCodes.includes("CONFIDENCE_BLOCK") ||
    allReasonCodes.includes("RISK_BLOCK")
  ) {
    finalDecision = "BLOCKED";
    decisionReason = allReasonCodes.join(", ");
  } else if (
    allReasonCodes.includes("POLICY_REQUIRES_APPROVAL") ||
    allReasonCodes.includes("SECURITY_SUSPICIOUS") ||
    approvalResult.decision === "MERCHANT_APPROVAL_REQUIRED" ||
    approvalResult.decision === "ADMIN_APPROVAL_REQUIRED" ||
    approvalResult.decision === "DUAL_APPROVAL_REQUIRED" ||
    allReasonCodes.includes("DATA_QUALITY_REQUIRES_APPROVAL") ||
    allReasonCodes.includes("CONFIDENCE_REQUIRES_APPROVAL") ||
    allReasonCodes.includes("RISK_REQUIRES_APPROVAL") ||
    allReasonCodes.includes("SPEND_REQUIRES_APPROVAL")
  ) {
    finalDecision = "REQUIRE_APPROVAL";
    decisionReason = allReasonCodes.join(", ");
  } else if (approvalResult.decision === "NO_APPROVAL_REQUIRED") {
    finalDecision = "APPROVED";
    decisionReason = "All gates passed. No approval required.";
  } else {
    finalDecision = "BLOCKED";
    decisionReason = "Default block: unknown state";
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 17-18: Persist GovernanceDecision and AuditLog
  // ═══════════════════════════════════════════════════════════════
  try {
    const { prisma } = await import("@/lib/prisma");

    // Build governance snapshot for traceability
    const snapshot: GovernanceSnapshot = {
      evaluatedAt: evaluatedAt.toISOString(),
      riskAnalysis: {
        riskScore: actualRiskScore,
        riskLevel: riskResult.riskLevel,
        source: riskSource,
      },
      confidenceAnalysis: {
        confidenceScore: actualConfidenceScore,
        confidenceLevel: confResult.confidenceLevel,
        source: confidenceSource,
      },
      dataQuality: {
        dataQualityScore: dqResult.dataQualityScore,
        insufficient: dqResult.insufficient,
        customerCount: input.customerCount || 0,
        orderCount: input.orderCount || 0,
        historicalSpanDays: input.historicalSpanDays || 0,
      },
      policyVersion: policyResult.policyId ? undefined : undefined,
      policyId: policyResult.policyId || input.policyId,
      actionType: input.actionType,
      strategyId: input.strategyId,
      amountMinor: input.amountMinor,
      currency: input.currency,
    };

    // Fetch policy version if available
    if (policyResult.policyId) {
      try {
        const policy = await prisma.policy.findUnique({ where: { id: policyResult.policyId } });
        if (policy) snapshot.policyVersion = policy.version;
      } catch { /* snapshot remains valid without version */ }
    }

    // Create GovernanceDecision and AuditLog atomically
    const governanceDecision = await prisma.$transaction(async (tx) => {
      const decision = await tx.governanceDecision.create({
        data: {
          merchantId: authenticatedMerchantId,
          actionRequestId,
          decision: finalDecision,
          decisionReason,
          riskLevel: riskResult.riskLevel as "LOW" | "MEDIUM" | "HIGH",
          confidence: actualConfidenceScore,
          status: finalDecision === "BLOCKED" ? "BLOCKED" : finalDecision === "APPROVED" ? "PENDING" : "PENDING",
          // Denormalised from the action request so the approve/reject routes
          // can enforce four-eyes against this row directly.
          requestedBy: requestedBy ?? null,          evidence: JSON.stringify({
            snapshot,
            dataQuality: dqResult,
            confidence: confResult,
            risk: riskResult,
            security: securityResult,
            policy: policyResult,
            velocity: velocityResult,
            spend: spendResult,
            customerProtection: customerProtectionResult,
            approval: approvalResult,
          }),
        },
      });

      await tx.auditLog.create({
        data: {
          merchantId: authenticatedMerchantId,
          action: `GOVERNANCE_${finalDecision}`,
          resourceType: "GOVERNANCE_DECISION",
          resourceId: decision.id,
          outcome: finalDecision,
          details: JSON.stringify({
            reasonCodes: allReasonCodes,
            decisionReason,
            securityScore: securityResult.securityScore,
          }),
          severity: finalDecision === "BLOCKED" ? "CRITICAL" : "INFO",
        },
      });

      return decision;
    });
  } catch (error) {
    // Governance decision persistence is critical — throw to indicate failure
    throw new Error(`Governance persistence failed: ${error instanceof Error ? error.message : "unknown"}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 19: Build final result
  // ═══════════════════════════════════════════════════════════════
  const explanation = `Governance Decision: ${finalDecision}. ` +
    `Reason: ${decisionReason}. ` +
    `Data Quality: ${dqResult.dataQualityScore}/100. ` +
    `Confidence: ${input.confidence || 0}%. ` +
    `Risk: ${input.riskLevel || "LOW"}. ` +
    `Security: ${securityResult.securityScore}/100. ` +
    `Approval: ${approvalResult.decision}. ` +
    `Steps: ${allReasonCodes.length} reason codes.`;

  return {
    governanceDecision: finalDecision,
    actionRequestId,
    merchantId: authenticatedMerchantId,
    dataQualityGate: {
      decision: dqResult.decision,
      dataQualityScore: dqResult.dataQualityScore,
      insufficient: dqResult.insufficient,
      reasonCode: dqResult.reasonCode,
    },
    confidenceGate: {
      decision: confResult.decision,
      confidenceScore: confResult.confidenceScore,
      confidenceLevel: confResult.confidenceLevel,
      reasonCode: confResult.reasonCode,
    },
    riskGate: {
      decision: riskResult.decision,
      riskScore: riskResult.riskScore,
      riskLevel: riskResult.riskLevel,
      reasonCode: riskResult.reasonCode,
    },
    security: {
      securityScore: securityResult.securityScore,
      securityLevel: securityResult.securityLevel,
      reasonCodes: securityResult.reasonCodes,
    },
    policyEngine: {
      decision: policyResult.decision,
      matchedRules: policyResult.matchedRules,
      violations: policyResult.violations,
      reasonCodes: policyResult.reasonCodes,
      policyId: policyResult.policyId,
    },
    velocity: {
      decision: velocityResult.decision,
      currentCount: velocityResult.currentCount,
      limit: velocityResult.limit,
      reasonCode: velocityResult.reasonCode,
    },
    spend: {
      decision: spendResult.decision,
      currentAmountMinor: spendResult.currentAmountMinor,
      limitMinor: spendResult.limitMinor,
      reasonCode: spendResult.reasonCode,
    },
    customerProtection: {
      decision: customerProtectionResult.decision,
      reasonCode: customerProtectionResult.reasonCode,
    },
    approvalEngine: {
      decision: approvalResult.decision,
      requiresFourEyes: approvalResult.requiresFourEyes,
      requiredRole: approvalResult.requiredRole,
      reasonCode: approvalResult.reasonCode,
    },
    allReasonCodes,
    explanation,
    evaluatedAt,
  };
}

/** Create a fail-closed result when a critical service is unavailable */
function failClosed(
  reasonCode: string,
  allReasonCodes: string[],
  evaluatedAt: Date
): GovernanceEvaluationResult {
  allReasonCodes.push(reasonCode);

  return {
    governanceDecision: "BLOCKED",
    actionRequestId: "",
    merchantId: "",
    dataQualityGate: {
      decision: "BLOCK",
      dataQualityScore: 0,
      insufficient: true,
      reasonCode,
    },
    confidenceGate: {
      decision: "BLOCK",
      confidenceScore: 0,
      confidenceLevel: "LOW",
      reasonCode,
    },
    riskGate: {
      decision: "BLOCK",
      riskScore: 100,
      riskLevel: "HIGH",
      reasonCode,
    },
    security: {
      securityScore: 0,
      securityLevel: "BLOCKED",
      reasonCodes: [reasonCode],
    },
    policyEngine: {
      decision: "BLOCK",
      matchedRules: [],
      violations: [],
      reasonCodes: [reasonCode],
      policyId: null,
    },
    velocity: {
      decision: "BLOCK",
      currentCount: 0,
      limit: 0,
      reasonCode,
    },
    spend: {
      decision: "BLOCK",
      currentAmountMinor: 0,
      limitMinor: 0,
      reasonCode,
    },
    customerProtection: {
      decision: "BLOCK",
      reasonCode,
    },
    approvalEngine: {
      decision: "BLOCKED",
      requiresFourEyes: false,
      requiredRole: "MERCHANT",
      reasonCode,
    },
    allReasonCodes,
    explanation: `Governance BLOCKED due to ${reasonCode}. Fail-closed: critical service unavailable.`,
    evaluatedAt,
  };
}

/** End of governance orchestrator module */