import { prisma } from "@/lib/prisma";

export type ActionType =
  | "DISCOUNT"
  | "CASHBACK"
  | "COUPON"
  | "BUNDLE"
  | "UPSELL"
  | "CROSS_SELL"
  | "REACTIVATION"
  | "CAMPAIGN"
  | "REFUND"
  | "PAYMENT_RECOVERY";

export type ActionTypeUnknown = "INVALID";
export type ActionTypeFull = ActionType | ActionTypeUnknown;

export interface CreateActionRequestInput {
  actionType: ActionTypeFull;
  strategyId: string;
  /** Human-readable strategy name; falls back to `strategyId`. */
  strategyName?: string;
  recommendedScenario?: "CONSERVATIVE" | "EXPECTED" | "OPTIMISTIC";
  decisionScore?: number;
  riskLevel?: "LOW" | "MEDIUM" | "HIGH";
  confidence?: number;
  amountMinor: number;
  currency: string;
  rationale?: string;
  evidence?: string;
  policyId?: string;
  customerCount?: number;
  orderCount?: number;
  historicalSpanDays?: number;
  customerId?: string;
  /**
   * User id of the human who initiated this action. Used to enforce four-eyes
   * at approval time (an approver may not be the requester).
   *
   * Leave undefined for machine-originated requests (agent growth cycles, the
   * AI buyer). Those are intentionally null in the database: there is no human
   * requester to protect against, and the approving human is by definition an
   * independent second party. Approval still requires a human.
   */
  requestedBy?: string;
}

export interface ActionRequestOutput {
  id: string;
  merchantId: string;
  opportunityType: string;
  strategyId: string;
  strategyName: string;
  recommendedScenario: string | null;
  decisionScore: number | null;
  riskLevel: string | null;
  confidence: number | null;
  status: string;
  reason: string | null;
  evidence: string | null;
  /**
   * Included because the approvals UI displays the requested amount. It was
   * previously omitted, so every approval card rendered "0 paise" regardless
   * of the real amount.
   */
  amountMinor: number;
  currency: string;
  customerId: string | null;
  /** null when the action was machine-originated (no human requester). */
  requestedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Single place that maps an `ActionRequest` row to the API output shape. */
function toActionRequestOutput(row: {
  id: string;
  merchantId: string;
  opportunityType: string;
  strategyId: string;
  strategyName: string;
  recommendedScenario: string;
  decisionScore: number;
  riskLevel: string;
  confidence: number;
  status: string;
  reason: string | null;
  evidence: string | null;
  amountMinor: number;
  currency: string;
  customerId: string | null;
  requestedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ActionRequestOutput {
  return {
    id: row.id,
    merchantId: row.merchantId,
    opportunityType: row.opportunityType,
    strategyId: row.strategyId,
    strategyName: row.strategyName,
    recommendedScenario: row.recommendedScenario,
    decisionScore: row.decisionScore,
    riskLevel: row.riskLevel,
    confidence: row.confidence,
    status: row.status,
    reason: row.reason,
    evidence: row.evidence,
    amountMinor: row.amountMinor,
    currency: row.currency,
    customerId: row.customerId,
    requestedBy: row.requestedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createActionRequest(
  input: CreateActionRequestInput,
  authenticatedMerchantId: string
): Promise<ActionRequestOutput> {
  const validTypes: ActionTypeFull[] = [
    "DISCOUNT", "CASHBACK", "COUPON", "BUNDLE", "UPSELL", "CROSS_SELL",
    "REACTIVATION", "CAMPAIGN", "REFUND", "PAYMENT_RECOVERY", "INVALID",
  ];

  const hasOptional = (v: unknown): boolean => v !== undefined && v !== null && v !== "";

  if (!validTypes.includes(input.actionType)) {
    const { prisma } = await import("@/lib/prisma");
    const invalidRequest = await prisma.actionRequest.create({
      data: {
        merchantId: authenticatedMerchantId,
        opportunityType: "INVALID",
        strategyId: input.strategyId,
        strategyName: input.strategyId,
        recommendedScenario: input.recommendedScenario || "",
        decisionScore: input.decisionScore || 0,
        riskLevel: input.riskLevel || "",
        confidence: input.confidence || 0,
        amountMinor: 0,
        currency: "INR",
        status: "BLOCKED",
        reason: `Invalid action type: ${input.actionType}`,
        evidence: input.evidence,
        ...(input.requestedBy ? { requestedBy: input.requestedBy } : {}),
      },
    });

    return toActionRequestOutput(invalidRequest);
  }

  if (typeof input.amountMinor !== "number" || input.amountMinor < 0 || !Number.isInteger(input.amountMinor)) {
    throw new Error("amountMinor must be a non-negative integer in paise");
  }
  if (typeof input.currency !== "string" || input.currency.trim().length === 0) {
    throw new Error("currency must be a non-empty string");
  }

  const { prisma } = await import("@/lib/prisma");
  const actionRequest = await prisma.actionRequest.create({
    data: {
      merchantId: authenticatedMerchantId,
      opportunityType: input.actionType,
      strategyId: input.strategyId,
      strategyName: input.strategyName || input.strategyId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      recommendedScenario: input.recommendedScenario || "",
      decisionScore: input.decisionScore ?? 0,
      riskLevel: input.riskLevel || "LOW",
      confidence: input.confidence ?? 0,
      status: "PENDING",
      // `ActionRequest` has a `reason` column, not `rationale`. Writing
      // `rationale` made Prisma reject the whole insert, so any request that
      // included a rationale returned 500 and no action request was created.
      ...(input.rationale ? { reason: input.rationale } : {}),
      evidence: input.evidence,
      ...(input.customerId ? { customerId: input.customerId } : {}),
      ...(input.requestedBy ? { requestedBy: input.requestedBy } : {}),
    },
  });

  return toActionRequestOutput(actionRequest);
}

export async function getActionRequest(
  id: string,
  authenticatedMerchantId: string
): Promise<ActionRequestOutput | null> {
  const { prisma } = await import("@/lib/prisma");
  const actionRequest = await prisma.actionRequest.findFirst({
    where: { id, merchantId: authenticatedMerchantId },
  });
  if (!actionRequest) return null;
  return toActionRequestOutput(actionRequest);
}

export async function listActionRequests(
  merchantId: string,
  authenticatedMerchantId: string,
  options?: { skip?: number; take?: number; status?: string; actionType?: string }
): Promise<ActionRequestOutput[]> {
  if (merchantId !== authenticatedMerchantId) return [];
  const { prisma } = await import("@/lib/prisma");
  const where = {
    merchantId,
    ...(options?.actionType ? { opportunityType: options.actionType } : {}),
    ...(options?.status ? { status: options.status } : {}),
  };
  const requests = await prisma.actionRequest.findMany({
    where, skip: options?.skip, take: options?.take, orderBy: { createdAt: "desc" },
  });
  return requests.map(toActionRequestOutput);
}

export async function validateActionRequest(
  id: string,
  expectedMerchantId: string,
  actualMerchantId: string
): Promise<{ valid: boolean; reason?: string }> {
  if (expectedMerchantId !== actualMerchantId) {
    return { valid: false, reason: "Merchant isolation violation" };
  }
  const { prisma } = await import("@/lib/prisma");
  // The row must belong to the merchant being validated. Previously the
  // lookup was by bare id, so this returned `{ valid: true }` for another
  // merchant's action request as long as the two caller-supplied ids matched.
  const request = await prisma.actionRequest.findFirst({
    where: { id, merchantId: expectedMerchantId },
    select: { id: true },
  });
  if (!request) return { valid: false, reason: "ActionRequest not found" };
  return { valid: true };
}
